// services/ai/webScrapingService.js
const axios = require("axios");
const crypto = require("crypto");
const OpenAI = require("openai");
const { Pool } = require("pg");
const __config = require("../../config");

class WebScrapingService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    this.pool = new Pool({
      user: __config.postgres.user,
      host: __config.postgres.host,
      database: __config.postgres.database,
      password: __config.postgres.password,
      port: __config.postgres.port,
      ssl: { rejectUnauthorized: false },
    });

    this.rateLimiter = {
      requests: 0,
      lastReset: Date.now(),
      maxRequestsPerMinute: 30,
    };
  }

  // Check rate limiting
  async checkRateLimit() {
    const now = Date.now();
    if (now - this.rateLimiter.lastReset >= 60000) {
      this.rateLimiter.requests = 0;
      this.rateLimiter.lastReset = now;
    }

    if (this.rateLimiter.requests >= this.rateLimiter.maxRequestsPerMinute) {
      throw new Error("Rate limit exceeded. Please try again later.");
    }

    this.rateLimiter.requests++;
  }

  // Generate URL hash for caching
  generateUrlHash(url) {
    return crypto.createHash("sha256").update(url).digest("hex");
  }

  // Clean and validate URL
  cleanUrl(url) {
    try {
      // Add protocol if missing
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        url = "https://" + url;
      }

      const urlObj = new URL(url);

      // Basic validation
      if (!urlObj.hostname || urlObj.hostname.length < 3) {
        throw new Error("Invalid hostname");
      }

      return urlObj.toString();
    } catch (error) {
      throw new Error(`Invalid URL format: ${error.message}`);
    }
  }

  // Check if cached scrape is available and valid
  async getCachedScrape(url) {
    try {
      const urlHash = this.generateUrlHash(url);

      const query = `
        SELECT * FROM website_scrapes 
        WHERE url_hash = $1 AND expires_at > CURRENT_TIMESTAMP
        ORDER BY created_at DESC LIMIT 1
      `;

      const result = await this.pool.query(query, [urlHash]);
      return result.rows[0] || null;
    } catch (error) {
      console.error("Error checking cached scrape:", error);
      return null;
    }
  }

  // Store scrape results in cache
  async storeScrapeCache(url, scrapedData, aiAnalysis = null) {
    try {
      const urlHash = this.generateUrlHash(url);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      const query = `
        INSERT INTO website_scrapes (url, url_hash, scraped_data, ai_analysis, expires_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (url_hash) 
        DO UPDATE SET 
          scraped_data = EXCLUDED.scraped_data,
          ai_analysis = EXCLUDED.ai_analysis,
          expires_at = EXCLUDED.expires_at,
          created_at = CURRENT_TIMESTAMP
        RETURNING id
      `;

      const result = await this.pool.query(query, [
        url,
        urlHash,
        JSON.stringify(scrapedData),
        aiAnalysis ? JSON.stringify(aiAnalysis) : null,
        expiresAt,
      ]);

      return result.rows[0].id;
    } catch (error) {
      console.error("Error storing scrape cache:", error);
      return null;
    }
  }

  // Scrape website metadata and content
  async scrapeWebsite(url) {
    try {
      await this.checkRateLimit();

      const cleanedUrl = this.cleanUrl(url);

      // Check cache first
      const cached = await this.getCachedScrape(cleanedUrl);
      if (cached && cached.scrape_status === "completed") {
        console.log(`Using cached scrape for: ${cleanedUrl}`);
        return {
          ...cached.scraped_data,
          cached: true,
          cached_at: cached.created_at,
        };
      }

      console.log(`Scraping website: ${cleanedUrl}`);

      // Configure axios with timeouts and headers
      const response = await axios.get(cleanedUrl, {
        timeout: 15000,
        maxRedirects: 5,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; InfluencerFlow/1.0; +https://influencerflow.com/bot)",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
          "Accept-Encoding": "gzip, deflate",
          Connection: "keep-alive",
          "Upgrade-Insecure-Requests": "1",
        },
      });

      const html = response.data;
      const scrapedData = this.extractMetadata(html, cleanedUrl);

      // Store in cache
      await this.storeScrapeCache(cleanedUrl, scrapedData);

      return scrapedData;
    } catch (error) {
      console.error(`Website scraping failed for ${url}:`, error.message);

      // Store error in cache to prevent repeated attempts
      await this.storeScrapeCache(url, { error: error.message }, null);

      throw new Error(`Failed to scrape website: ${error.message}`);
    }
  }

  // Extract metadata from HTML
  extractMetadata(html, url) {
    const metadata = {
      url: url,
      title:
        this.extractBetween(html, "<title>", "</title>") || "No title found",
      description: "",
      keywords: "",
      ogTitle: "",
      ogDescription: "",
      ogImage: "",
      twitterTitle: "",
      twitterDescription: "",
      twitterImage: "",
      favicon: "",
      language: "en",
      contentText: "",
      headings: [],
      links: [],
      images: [],
      socialLinks: {},
      contactInfo: {},
      structured_data: null,
      scraped_at: new Date().toISOString(),
    };

    try {
      // Meta description
      metadata.description =
        this.extractMetaContent(html, 'name="description"') ||
        this.extractMetaContent(html, 'property="description"') ||
        "";

      // Meta keywords
      metadata.keywords =
        this.extractMetaContent(html, 'name="keywords"') || "";

      // Open Graph tags
      metadata.ogTitle =
        this.extractMetaContent(html, 'property="og:title"') || metadata.title;
      metadata.ogDescription =
        this.extractMetaContent(html, 'property="og:description"') ||
        metadata.description;
      metadata.ogImage =
        this.extractMetaContent(html, 'property="og:image"') || "";

      // Twitter Card tags
      metadata.twitterTitle =
        this.extractMetaContent(html, 'name="twitter:title"') ||
        metadata.ogTitle;
      metadata.twitterDescription =
        this.extractMetaContent(html, 'name="twitter:description"') ||
        metadata.ogDescription;
      metadata.twitterImage =
        this.extractMetaContent(html, 'name="twitter:image"') ||
        metadata.ogImage;

      // Language
      const langMatch = html.match(/<html[^>]*lang=["']([^"']+)["']/i);
      if (langMatch) metadata.language = langMatch[1];

      // Favicon
      metadata.favicon = this.extractFavicon(html, url);

      // Extract headings
      metadata.headings = this.extractHeadings(html);

      // Extract main content text (simplified)
      metadata.contentText = this.extractMainContent(html);

      // Social media links
      metadata.socialLinks = this.extractSocialLinks(html);

      // Contact information
      metadata.contactInfo = this.extractContactInfo(html);

      // Structured data (JSON-LD)
      metadata.structured_data = this.extractStructuredData(html);
    } catch (error) {
      console.error("Error extracting metadata:", error);
    }

    return metadata;
  }

  // Helper methods for extraction
  extractBetween(text, start, end) {
    const startIndex = text.toLowerCase().indexOf(start.toLowerCase());
    if (startIndex === -1) return null;

    const contentStart = startIndex + start.length;
    const endIndex = text
      .toLowerCase()
      .indexOf(end.toLowerCase(), contentStart);
    if (endIndex === -1) return null;

    return text.substring(contentStart, endIndex).trim();
  }

  extractMetaContent(html, attribute) {
    const regex = new RegExp(
      `<meta[^>]*${attribute}[^>]*content=["']([^"']+)["']`,
      "i"
    );
    const match = html.match(regex);
    return match ? match[1] : null;
  }

  extractFavicon(html, baseUrl) {
    const faviconRegex =
      /<link[^>]*rel=["'](?:icon|shortcut icon)["'][^>]*href=["']([^"']+)["']/i;
    const match = html.match(faviconRegex);

    if (match) {
      const href = match[1];
      if (href.startsWith("http")) return href;
      if (href.startsWith("/")) return new URL(baseUrl).origin + href;
      return new URL(href, baseUrl).toString();
    }

    return new URL("/favicon.ico", baseUrl).toString();
  }

  extractHeadings(html) {
    const headings = [];
    const headingRegex = /<h([1-6])[^>]*>([^<]+)<\/h[1-6]>/gi;
    let match;

    while ((match = headingRegex.exec(html)) !== null) {
      headings.push({
        level: parseInt(match[1]),
        text: match[2].trim(),
      });
    }

    return headings.slice(0, 20); // Limit to first 20 headings
  }

  extractMainContent(html) {
    // Remove script and style tags
    let content = html.replace(
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      ""
    );
    content = content.replace(
      /<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi,
      ""
    );

    // Remove HTML tags
    content = content.replace(/<[^>]+>/g, " ");

    // Clean up whitespace
    content = content.replace(/\s+/g, " ").trim();

    // Return first 2000 characters
    return content.substring(0, 2000);
  }

  extractSocialLinks(html) {
    const social = {};
    const socialPatterns = {
      facebook: /(?:facebook\.com|fb\.com)\/([a-zA-Z0-9._-]+)/i,
      twitter: /(?:twitter\.com|x\.com)\/([a-zA-Z0-9._-]+)/i,
      instagram: /instagram\.com\/([a-zA-Z0-9._-]+)/i,
      linkedin: /linkedin\.com\/(?:company|in)\/([a-zA-Z0-9._-]+)/i,
      youtube: /youtube\.com\/(?:channel\/|user\/|c\/)?([a-zA-Z0-9._-]+)/i,
      tiktok: /tiktok\.com\/@([a-zA-Z0-9._-]+)/i,
    };

    Object.entries(socialPatterns).forEach(([platform, pattern]) => {
      const matches = html.match(new RegExp(pattern.source, "gi"));
      if (matches && matches.length > 0) {
        social[platform] = matches[0];
      }
    });

    return social;
  }

  extractContactInfo(html) {
    const contact = {};

    // Email extraction
    const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
    const emails = html.match(emailRegex);
    if (emails) {
      contact.emails = [...new Set(emails)].slice(0, 3);
    }

    // Phone extraction (simplified)
    const phoneRegex =
      /(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g;
    const phones = html.match(phoneRegex);
    if (phones) {
      contact.phones = [...new Set(phones)].slice(0, 3);
    }

    return contact;
  }

  extractStructuredData(html) {
    try {
      const jsonLdRegex =
        /<script[^>]*type=["']application\/ld\+json["'][^>]*>(.*?)<\/script>/gis;
      const matches = html.match(jsonLdRegex);

      if (matches) {
        const structuredData = [];
        matches.forEach((match) => {
          try {
            const jsonContent = match
              .replace(/<script[^>]*>/, "")
              .replace(/<\/script>/, "");
            const data = JSON.parse(jsonContent);
            structuredData.push(data);
          } catch (e) {
            console.warn("Failed to parse JSON-LD:", e.message);
          }
        });
        return structuredData.length > 0 ? structuredData : null;
      }
    } catch (error) {
      console.error("Error extracting structured data:", error);
    }

    return null;
  }

  // Generate AI-powered brand overview from scraped data
  async generateBrandOverview(scrapedData, brandName = null) {
    try {
      await this.checkRateLimit();

      const prompt = `
Analyze this website data and create a comprehensive brand overview for a marketing platform.

Website Data:
- URL: ${scrapedData.url}
- Title: ${scrapedData.title}
- Description: ${scrapedData.description}
- Content: ${scrapedData.contentText}
- Headings: ${scrapedData.headings?.map((h) => h.text).join(", ")}
- Social Links: ${JSON.stringify(scrapedData.socialLinks)}
${brandName ? `- Brand Name: ${brandName}` : ""}

Create a detailed brand overview that includes:

1. Company/Brand Overview (2-3 sentences)
2. Industry & Market Position
3. Products/Services Offered
4. Target Audience
5. Brand Personality & Values
6. Marketing Style & Tone
7. Collaboration Opportunities

Format as JSON:
{
  "overview": "Brief company description",
  "industry": "Primary industry",
  "market_position": "Market position description",
  "products_services": ["list", "of", "main", "offerings"],
  "target_audience": {
    "demographics": "Description of target customers",
    "interests": ["interest1", "interest2"],
    "behavior": "Customer behavior patterns"
  },
  "brand_personality": {
    "tone": "Brand communication tone",
    "values": ["value1", "value2", "value3"],
    "style": "Brand style description"
  },
  "marketing_approach": "How they typically market",
  "collaboration_fit": {
    "ideal_creators": "Type of creators that would fit",
    "content_types": ["content", "types"],
    "campaign_styles": ["campaign", "approaches"]
  },
  "key_messaging": ["key", "brand", "messages"],
  "competitive_advantages": ["advantage1", "advantage2"],
  "confidence_score": 0.85
}

Focus on insights that would help brands find the right influencers for collaborations.
`;

      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1500,
        temperature: 0.3,
      });

      let aiOverview = response.choices[0].message.content.trim();

      // Clean up response
      aiOverview = aiOverview.replace(/```json\s*/, "").replace(/```$/, "");

      const parsedOverview = JSON.parse(aiOverview);

      // Store AI analysis
      await this.storeAIAnalysis("brand_overview", scrapedData, parsedOverview);

      return parsedOverview;
    } catch (error) {
      console.error("Error generating brand overview:", error);
      throw new Error(`Failed to generate brand overview: ${error.message}`);
    }
  }

  // Store AI analysis for caching
  async storeAIAnalysis(analysisType, inputData, aiResponse) {
    try {
      const inputHash = crypto
        .createHash("sha256")
        .update(JSON.stringify(inputData))
        .digest("hex");

      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const query = `
        INSERT INTO ai_analyses (analysis_type, input_data_hash, input_data, 
                               ai_response, model_used, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (analysis_type, input_data_hash)
        DO UPDATE SET 
          ai_response = EXCLUDED.ai_response,
          expires_at = EXCLUDED.expires_at,
          created_at = CURRENT_TIMESTAMP
        RETURNING id
      `;

      const result = await this.pool.query(query, [
        analysisType,
        inputHash,
        JSON.stringify(inputData),
        JSON.stringify(aiResponse),
        "gpt-4o",
        expiresAt,
      ]);

      return result.rows[0].id;
    } catch (error) {
      console.error("Error storing AI analysis:", error);
      return null;
    }
  }

  // Get cached AI analysis
  async getCachedAIAnalysis(analysisType, inputData) {
    try {
      const inputHash = crypto
        .createHash("sha256")
        .update(JSON.stringify(inputData))
        .digest("hex");

      const query = `
        SELECT ai_response, created_at FROM ai_analyses 
        WHERE analysis_type = $1 AND input_data_hash = $2 
          AND expires_at > CURRENT_TIMESTAMP
        ORDER BY created_at DESC LIMIT 1
      `;

      const result = await this.pool.query(query, [analysisType, inputHash]);

      if (result.rows.length > 0) {
        return {
          ...result.rows[0].ai_response,
          cached: true,
          cached_at: result.rows[0].created_at,
        };
      }

      return null;
    } catch (error) {
      console.error("Error getting cached AI analysis:", error);
      return null;
    }
  }

  // Clean up expired cache entries
  async cleanupExpiredCache() {
    try {
      const websiteCleanup = await this.pool.query(
        "DELETE FROM website_scrapes WHERE expires_at < CURRENT_TIMESTAMP"
      );

      const aiCleanup = await this.pool.query(
        "DELETE FROM ai_analyses WHERE expires_at < CURRENT_TIMESTAMP"
      );

      console.log(
        `Cleaned up ${websiteCleanup.rowCount} expired website scrapes`
      );
      console.log(`Cleaned up ${aiCleanup.rowCount} expired AI analyses`);

      return {
        website_scrapes_cleaned: websiteCleanup.rowCount,
        ai_analyses_cleaned: aiCleanup.rowCount,
      };
    } catch (error) {
      console.error("Error cleaning up cache:", error);
      throw error;
    }
  }
}

module.exports = new WebScrapingService();
