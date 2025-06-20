// services/ai/campaignIntelligenceService.js
const OpenAI = require("openai");
const webScrapingService = require("./webScrapingService");

class CampaignIntelligenceService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  // Extract campaign details from document text
  async extractCampaignFromDocument(documentText, brandId = null) {
    try {
      const prompt = `
Extract campaign details from this document and structure them for campaign creation.

Document Content:
${documentText}

Extract and structure the following information:
1. Campaign name/title
2. Campaign type (sponsored_post, brand_ambassador, product_review, event_coverage, content_collaboration)
3. Brand name (if mentioned)
4. Product information (name, URL, price if mentioned)
5. Budget details
6. Target audience demographics
7. Campaign dates (start/end)
8. Requirements and deliverables
9. Location (if applicable)
10. Platform preferences
11. Content guidelines
12. Hashtags and mentions

Return as JSON in this exact format:
{
  "campaign_name": "extracted or generated campaign name",
  "campaign_type": "one of the valid types",
  "brand_name": "brand name if found",
  "product_info": {
    "product_name": "product name if mentioned",
    "product_url": "product URL if mentioned",
    "price": "price if mentioned"
  },
  "description": "campaign description",
  "objectives": "campaign objectives",
  "budget": "budget amount (number only)",
  "currency": "currency (USD/EUR/INR etc)",
  "start_date": "YYYY-MM-DD format or null",
  "end_date": "YYYY-MM-DD format or null",
  "target_audience": {
    "demographics": "target demographics description",
    "age_groups": ["age ranges"],
    "interests": ["interests"],
    "follower_range": "follower count range"
  },
  "requirements": {
    "deliverables": ["list of deliverables"],
    "platforms": ["instagram", "youtube", "tiktok"],
    "content_type": ["video", "photo", "story"]
  },
  "content_guidelines": "content creation guidelines",
  "hashtags": "suggested hashtags",
  "mention_requirements": "mention requirements",
  "location": "event/campaign location if applicable",
  "extracted_insights": {
    "confidence_score": 0.85,
    "missing_fields": ["list of fields not found"],
    "generated_fields": ["list of fields AI generated"]
  }
}

Important:
- Use only valid campaign types from the list
- Extract actual numbers for budget (remove currency symbols)
- Be specific about target audience requirements
- If information is missing, mark it as null rather than guessing
- Generate campaign name if not explicitly mentioned
`;

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

      const parsedData = JSON.parse(extractedData);

      // Enhance with product analysis if product URL is found
      if (parsedData.product_info?.product_url) {
        try {
          const productAnalysis = await this.analyzeProductForCampaign(
            parsedData.product_info.product_url,
            parsedData.product_info.product_name || "Product"
          );
          parsedData.product_analysis = productAnalysis;
        } catch (error) {
          console.error("Product analysis failed:", error);
        }
      }

      return parsedData;
    } catch (error) {
      console.error("Error extracting campaign from document:", error);
      throw new Error(`Failed to extract campaign data: ${error.message}`);
    }
  }

  // Extract campaign details from natural language query
  async extractCampaignFromQuery(queryText, brandId = null) {
    try {
      const prompt = `
Parse this campaign creation query and extract structured campaign information.

User Query:
"${queryText}"

Extract and infer the following campaign details:
1. Campaign name/title (generate if not specified)
2. Campaign type based on described activities
3. Brand name (if mentioned)
4. Product information
5. Budget and currency
6. Target audience and demographics
7. Timeline and dates
8. Content requirements
9. Platform specifications
10. Location details

Return as JSON in this exact format:
{
  "campaign_name": "generated descriptive campaign name",
  "campaign_type": "sponsored_post|brand_ambassador|product_review|event_coverage|content_collaboration",
  "brand_name": "brand name if mentioned",
  "product_info": {
    "product_name": "product name if mentioned",
    "product_url": "product URL if mentioned",
    "price": "price if mentioned"
  },
  "description": "detailed campaign description",
  "objectives": "inferred campaign objectives",
  "budget": "budget amount (number only)",
  "currency": "currency code",
  "start_date": "YYYY-MM-DD or null",
  "end_date": "YYYY-MM-DD or null",
  "target_audience": {
    "demographics": "target creator demographics",
    "age_groups": ["age ranges"],
    "interests": ["relevant interests"],
    "follower_range": "follower count requirements"
  },
  "requirements": {
    "deliverables": ["specific deliverables"],
    "platforms": ["primary platforms"],
    "content_type": ["content formats"]
  },
  "content_guidelines": "content creation guidelines",
  "hashtags": "relevant hashtags",
  "mention_requirements": "brand mention requirements",
  "location": "location if event-based",
  "ai_insights": {
    "confidence_score": 0.85,
    "inferred_fields": ["list of fields AI inferred"],
    "recommendations": ["campaign optimization suggestions"]
  }
}

Guidelines:
- Generate professional campaign names that reflect the objective
- Infer campaign type from described activities (events=event_coverage, reviews=product_review, etc.)
- Be specific about target audience requirements
- Convert budget mentions to numbers only
- Suggest relevant hashtags based on brand/product
- Provide realistic timeline if dates mentioned relatively
`;

      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 2000,
        temperature: 0.4,
      });

      let extractedData = response.choices[0].message.content.trim();
      extractedData = extractedData
        .replace(/```json\s*/, "")
        .replace(/```$/, "");

      const parsedData = JSON.parse(extractedData);

      // Enhance with product analysis if product URL is found
      if (parsedData.product_info?.product_url) {
        try {
          const productAnalysis = await this.analyzeProductForCampaign(
            parsedData.product_info.product_url,
            parsedData.product_info.product_name || "Product"
          );
          parsedData.product_analysis = productAnalysis;
        } catch (error) {
          console.error("Product analysis failed:", error);
        }
      }

      return parsedData;
    } catch (error) {
      console.error("Error extracting campaign from query:", error);
      throw new Error(`Failed to parse campaign query: ${error.message}`);
    }
  }

  // Analyze product URL for campaign integration
  async analyzeProductForCampaign(productUrl, productName = null) {
    try {
      console.log(`Analyzing product for campaign: ${productUrl}`);

      // Scrape product website
      const scrapedData = await webScrapingService.scrapeWebsite(productUrl);

      // Generate product insights for campaign
      const analysisPrompt = `
Analyze this product information for influencer campaign planning.

Product URL: ${productUrl}
Product Name: ${productName || scrapedData.title}
Website Data:
- Title: ${scrapedData.title}
- Description: ${scrapedData.description}
- Content: ${scrapedData.contentText?.substring(0, 1000)}

Generate campaign-focused product analysis:

{
  "product_name": "refined product name",
  "category": "product category",
  "price_range": "estimated price range if found",
  "key_features": ["main product features"],
  "target_audience": {
    "demographics": "ideal customer profile",
    "age_groups": ["relevant age ranges"],
    "interests": ["customer interests"],
    "lifestyle": "target lifestyle"
  },
  "campaign_angles": ["marketing angles for influencer content"],
  "content_opportunities": {
    "video_content": ["video content ideas"],
    "photo_content": ["photo content ideas"],
    "story_content": ["story content ideas"]
  },
  "ideal_creator_types": ["types of creators that would fit"],
  "seasonal_relevance": "when this product is most relevant",
  "collaboration_types": ["suitable collaboration formats"],
  "confidence_score": 0.9
}
`;

      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: analysisPrompt }],
        max_tokens: 1200,
        temperature: 0.3,
      });

      let analysis = response.choices[0].message.content.trim();
      analysis = analysis.replace(/```json\s*/, "").replace(/```$/, "");

      return JSON.parse(analysis);
    } catch (error) {
      console.error("Error analyzing product for campaign:", error);
      return {
        product_name: productName || "Unknown Product",
        category: "general",
        error: error.message,
        confidence_score: 0.1,
      };
    }
  }

  // Generate enhanced campaign recommendations
  async enhanceCampaignData(campaignData, brandData = null) {
    try {
      const prompt = `
Enhance this campaign data with AI recommendations and fill missing information.

Campaign Data:
${JSON.stringify(campaignData, null, 2)}

Brand Data:
${brandData ? JSON.stringify(brandData, null, 2) : "Not provided"}

Enhance the campaign with:
1. Missing field recommendations
2. Optimized target audience
3. Content strategy suggestions
4. Budget optimization
5. Timeline recommendations
6. Platform strategy

Return enhanced campaign data with AI recommendations:
{
  "enhanced_campaign": {
    // All original fields plus enhancements
  },
  "ai_recommendations": {
    "content_strategy": "detailed content strategy",
    "target_audience_refinement": "audience targeting suggestions",
    "budget_optimization": "budget allocation recommendations",
    "timeline_suggestions": "optimal campaign timing",
    "platform_strategy": "platform-specific approach",
    "success_metrics": ["key metrics to track"],
    "risk_factors": ["potential risks and mitigation"]
  },
  "auto_generated_fields": ["list of fields AI generated"],
  "confidence_score": 0.85
}
`;

      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 2000,
        temperature: 0.4,
      });

      let enhanced = response.choices[0].message.content.trim();
      enhanced = enhanced.replace(/```json\s*/, "").replace(/```$/, "");

      return JSON.parse(enhanced);
    } catch (error) {
      console.error("Error enhancing campaign data:", error);
      return {
        enhanced_campaign: campaignData,
        ai_recommendations: {
          error: error.message,
        },
      };
    }
  }

  // Validate and clean extracted campaign data
  validateCampaignData(extractedData) {
    const validCampaignTypes = [
      "sponsored_post",
      "brand_ambassador",
      "product_review",
      "event_coverage",
      "content_collaboration",
    ];

    // Ensure campaign type is valid
    if (!validCampaignTypes.includes(extractedData.campaign_type)) {
      extractedData.campaign_type = "sponsored_post"; // Default fallback
    }

    // Validate and clean budget
    if (extractedData.budget) {
      const budgetNum = parseFloat(
        extractedData.budget.toString().replace(/[^0-9.]/g, "")
      );
      extractedData.budget = isNaN(budgetNum) ? null : budgetNum;
    }

    // Ensure currency is valid
    const validCurrencies = ["USD", "EUR", "GBP", "INR"];
    if (!validCurrencies.includes(extractedData.currency)) {
      extractedData.currency = "USD";
    }

    // Validate dates
    if (
      extractedData.start_date &&
      !this.isValidDate(extractedData.start_date)
    ) {
      extractedData.start_date = null;
    }
    if (extractedData.end_date && !this.isValidDate(extractedData.end_date)) {
      extractedData.end_date = null;
    }

    return extractedData;
  }

  isValidDate(dateString) {
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date);
  }
}

module.exports = new CampaignIntelligenceService();
