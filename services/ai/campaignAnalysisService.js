// services/ai/campaignAnalysisService.js
const OpenAI = require("openai");
const webScrapingService = require("./webScrapingService");

class CampaignAnalysisService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  // Main method to analyze campaign data from document or query
  async analyzeCampaignData(mode, content, websiteUrl = null) {
    try {
      // Extract campaign information from content
      const extractedData = await this.extractCampaignInfo(mode, content);

      // If website URL is found or provided, analyze it
      let websiteAnalysis = null;
      const urlInContent = this.extractUrlFromContent(content);
      const finalUrl = websiteUrl || extractedData.product_url || urlInContent;

      if (finalUrl) {
        websiteAnalysis = await this.analyzeWebsite(finalUrl);
      }

      // Generate missing fields using AI
      const enrichedData = await this.enrichCampaignData(
        extractedData,
        websiteAnalysis
      );

      // Generate AI suggestions
      const suggestions = await this.generateSuggestions(
        enrichedData,
        websiteAnalysis
      );

      return {
        campaign_data: enrichedData,
        website_analysis: websiteAnalysis,
        ai_suggestions: suggestions,
        extracted_fields: Object.keys(extractedData).filter(
          (key) => extractedData[key]
        ),
        generated_fields: Object.keys(enrichedData).filter(
          (key) => !extractedData[key] && enrichedData[key]
        ),
      };
    } catch (error) {
      console.error("Error analyzing campaign data:", error);
      throw error;
    }
  }

  // Extract campaign information from document or query
  async extractCampaignInfo(mode, content) {
    const prompt = `
Extract campaign information from the following ${
      mode === "document" ? "document" : "text"
    }. 
Return a JSON object with these fields:
- campaign_name: string
- campaign_type: "sponsored_post" | "brand_ambassador" | "product_review" | "event_coverage" | "content_collaboration"
- description: string
- objectives: string
- budget: number (extract numeric value only)
- currency: string (default to INR if mentioned as "K" with Indian location)
- start_date: string (YYYY-MM-DD format)
- end_date: string (YYYY-MM-DD format)
- location: string
- event_details: string
- deliverables: string (list all deliverables mentioned)
- requirements: string (creator requirements like follower count, age, niche)
- product_name: string
- product_url: string
- product_price: number
- product_category: string
- product_description: string
- hashtags: string (comma-separated)
- mention_requirements: string
- target_audience: object with demographics, interests, age_range
- creator_count: number (how many creators needed)
- content_guidelines: string

If a field is not found, set it as null.

Content:
${content}

Important notes:
- For budget, if it says "70-80K per profile", extract the average (75000)
- For dates, if only one date is mentioned, use it as start_date
- For location, include full address if available
- For deliverables, list everything mentioned (e.g., "Event attendance, 1 IG Reel, 1 IG Story")
- For requirements, include all criteria (follower count, age, interests, etc.)

Return only valid JSON.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 2000,
        temperature: 0.3,
      });

      let extractedData = response.choices[0].message.content.trim();
      extractedData = extractedData
        .replace(/```json\s*/, "")
        .replace(/```$/, "");

      return JSON.parse(extractedData);
    } catch (error) {
      console.error("Error extracting campaign info:", error);
      throw new Error("Failed to extract campaign information");
    }
  }

  // Analyze website to get brand information
  async analyzeWebsite(url) {
    try {
      const scrapedData = await webScrapingService.scrapeWebsite(url);

      const prompt = `
Based on this website data, extract brand and product information:

URL: ${url}
Title: ${scrapedData.title}
Description: ${scrapedData.description}
Content: ${scrapedData.contentText?.substring(0, 2000)}

Extract:
1. Brand name
2. Industry/category
3. Brand values and personality
4. Target audience
5. Key products/services
6. Marketing tone/style
7. Any campaign-relevant insights

Return as JSON with these fields:
- brand_name: string
- industry: string
- brand_values: string
- target_audience: string
- key_products: array of strings
- marketing_style: string
- campaign_insights: string

Return only valid JSON.`;

      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1000,
        temperature: 0.3,
      });

      let analysis = response.choices[0].message.content.trim();
      analysis = analysis.replace(/```json\s*/, "").replace(/```$/, "");

      return JSON.parse(analysis);
    } catch (error) {
      console.error("Error analyzing website:", error);
      return null;
    }
  }

  // Enrich campaign data with AI-generated content
  async enrichCampaignData(extractedData, websiteAnalysis) {
    const enrichedData = { ...extractedData };

    // Generate campaign name if missing
    if (
      !enrichedData.campaign_name &&
      (websiteAnalysis?.brand_name || extractedData.product_name)
    ) {
      const brand = websiteAnalysis?.brand_name || extractedData.product_name;
      const eventType = extractedData.event_details ? "Event" : "Campaign";
      enrichedData.campaign_name = `${brand} ${eventType} ${new Date().getFullYear()}`;
    }

    // Generate description if missing
    if (!enrichedData.description) {
      enrichedData.description = await this.generateDescription(
        enrichedData,
        websiteAnalysis
      );
    }

    // Generate objectives if missing
    if (!enrichedData.objectives) {
      enrichedData.objectives = await this.generateObjectives(
        enrichedData,
        websiteAnalysis
      );
    }

    // Set default dates if missing
    if (!enrichedData.start_date) {
      enrichedData.start_date = new Date().toISOString().split("T")[0];
    }
    if (!enrichedData.end_date) {
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 1);
      enrichedData.end_date = endDate.toISOString().split("T")[0];
    }

    // Generate hashtags if missing
    if (!enrichedData.hashtags && websiteAnalysis?.brand_name) {
      const brandHashtag = websiteAnalysis.brand_name.replace(/\s+/g, "");
      enrichedData.hashtags = `#${brandHashtag}, #sponsored, #ad, #collaboration`;
    }

    // Generate content guidelines if missing
    if (!enrichedData.content_guidelines) {
      enrichedData.content_guidelines = await this.generateContentGuidelines(
        enrichedData,
        websiteAnalysis
      );
    }

    // Set target audience from website analysis if missing
    if (!enrichedData.target_audience && websiteAnalysis?.target_audience) {
      enrichedData.target_audience = {
        demographics: websiteAnalysis.target_audience,
        interests: websiteAnalysis.industry,
        age_range: "18-45", // Default range
      };
    }

    return enrichedData;
  }

  // Generate campaign description
  async generateDescription(campaignData, websiteAnalysis) {
    const prompt = `
Generate a professional campaign description based on:
${websiteAnalysis ? `Brand: ${websiteAnalysis.brand_name}` : ""}
${campaignData.product_name ? `Product: ${campaignData.product_name}` : ""}
${campaignData.event_details ? `Event: ${campaignData.event_details}` : ""}
${campaignData.deliverables ? `Deliverables: ${campaignData.deliverables}` : ""}
${campaignData.location ? `Location: ${campaignData.location}` : ""}

Create a 2-3 sentence campaign description that explains the campaign purpose and goals.
Be specific and professional.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 200,
        temperature: 0.7,
      });

      return response.choices[0].message.content.trim();
    } catch (error) {
      return "Campaign to increase brand awareness and engagement through influencer partnerships.";
    }
  }

  // Generate campaign objectives
  async generateObjectives(campaignData, websiteAnalysis) {
    const prompt = `
Generate 3-4 specific campaign objectives based on:
${websiteAnalysis ? `Brand: ${websiteAnalysis.brand_name}` : ""}
${campaignData.campaign_type ? `Type: ${campaignData.campaign_type}` : ""}
${campaignData.deliverables ? `Deliverables: ${campaignData.deliverables}` : ""}
${campaignData.requirements ? `Requirements: ${campaignData.requirements}` : ""}

Return clear, measurable objectives as a single paragraph.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 200,
        temperature: 0.7,
      });

      return response.choices[0].message.content.trim();
    } catch (error) {
      return "Increase brand awareness, drive engagement, and generate authentic content through strategic influencer partnerships.";
    }
  }

  // Generate content guidelines
  async generateContentGuidelines(campaignData, websiteAnalysis) {
    const prompt = `
Generate content creation guidelines for influencers based on:
${websiteAnalysis ? `Brand: ${websiteAnalysis.brand_name}` : ""}
${websiteAnalysis ? `Brand Values: ${websiteAnalysis.brand_values}` : ""}
${campaignData.deliverables ? `Deliverables: ${campaignData.deliverables}` : ""}
${campaignData.requirements ? `Requirements: ${campaignData.requirements}` : ""}

Include:
1. Content tone and style
2. Key messages to convey
3. Do's and don'ts
4. Visual guidelines

Return as a paragraph with clear guidelines.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 300,
        temperature: 0.7,
      });

      return response.choices[0].message.content.trim();
    } catch (error) {
      return "Create authentic, engaging content that aligns with brand values. Maintain a professional yet approachable tone. Focus on quality over quantity.";
    }
  }

  // Generate AI suggestions
  async generateSuggestions(campaignData, websiteAnalysis) {
    const suggestions = [];

    // Budget suggestions
    if (campaignData.budget && campaignData.creator_count) {
      const perCreatorBudget =
        campaignData.budget / (campaignData.creator_count || 1);
      suggestions.push(
        `Budget per creator: ${
          campaignData.currency
        } ${perCreatorBudget.toLocaleString()}`
      );
    }

    // Platform suggestions based on target audience
    if (campaignData.target_audience?.age_range) {
      if (campaignData.target_audience.age_range.includes("18-24")) {
        suggestions.push(
          "Consider focusing on TikTok and Instagram for younger audience"
        );
      } else if (campaignData.target_audience.age_range.includes("25-34")) {
        suggestions.push(
          "Instagram and YouTube would be ideal for this age group"
        );
      }
    }

    // Content type suggestions
    if (campaignData.deliverables) {
      if (campaignData.deliverables.toLowerCase().includes("reel")) {
        suggestions.push(
          "Reels typically generate 67% more engagement than regular posts"
        );
      }
      if (campaignData.deliverables.toLowerCase().includes("story")) {
        suggestions.push(
          "Stories create urgency - perfect for event coverage or limited-time offers"
        );
      }
    }

    // Timing suggestions
    if (campaignData.event_details) {
      suggestions.push(
        "For events, start creator outreach at least 2-3 weeks in advance"
      );
    }

    // Creator tier suggestions
    if (campaignData.requirements) {
      if (campaignData.requirements.includes("100-300K")) {
        suggestions.push(
          "Mid-tier influencers (100-300K) often have higher engagement rates than mega influencers"
        );
      }
    }

    return suggestions;
  }

  // Extract URL from content
  extractUrlFromContent(content) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const matches = content.match(urlRegex);
    return matches ? matches[0] : null;
  }
}

module.exports = new CampaignAnalysisService();
