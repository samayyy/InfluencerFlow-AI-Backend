// services/campaigns/enhancedCampaignService.js
const { Pool } = require("pg");
const __config = require("../../config");
const OpenAI = require("openai");
const aiSearchOrchestrator = require("../search/aiSearchOrchestrator");
const webScrapingService = require("../ai/webScrapingService");

class EnhancedCampaignService {
  constructor() {
    this.pool = new Pool({
      user: __config.postgres.user,
      host: __config.postgres.host,
      database: __config.postgres.database,
      password: __config.postgres.password,
      port: __config.postgres.port,
      ssl: { rejectUnauthorized: false },
    });

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  // Extract campaign information from document/query using AI
  async extractCampaignFromText(text, extractionType = "query") {
    try {
      const prompt = `
Analyze this ${extractionType} and extract comprehensive campaign information. Return a structured JSON object.

${extractionType === "document" ? "Document Content:" : "Campaign Description:"}
"${text}"

Extract and structure the following information:

{
  "campaign_basics": {
    "campaign_name": "string - derive from content or generate appropriate name",
    "campaign_type": "string - one of: sponsored_post, brand_ambassador, product_review, event_coverage, content_collaboration, giveaway",
    "description": "string - campaign description or generate from context",
    "objectives": "string - campaign goals or generate based on type and context"
  },
  "brand_product": {
    "brand_name": "string - extract brand name",
    "product_name": "string - extract product name if mentioned",
    "product_url": "string - extract website/product URL if mentioned",
    "product_price": "number - extract price if mentioned",
    "product_currency": "string - extract currency or default to USD"
  },
  "campaign_details": {
    "budget_per_creator": "number - extract budget per creator/influencer",
    "total_budget": "number - extract total budget if mentioned",
    "currency": "string - extract currency",
    "creators_needed": "string - number or range of creators needed",
    "start_date": "string - YYYY-MM-DD format if mentioned",
    "end_date": "string - YYYY-MM-DD format if mentioned",
    "event_date": "string - YYYY-MM-DD if it's an event",
    "location": "string - event/campaign location",
    "event_location": "string - specific event venue if applicable"
  },
  "target_audience": {
    "demographics": "string - target audience description",
    "age_range": "string - age requirements",
    "follower_range": "string - follower count requirements (e.g., 100K-300K)",
    "interests": "array - audience interests and niches",
    "location_requirements": "string - geographic requirements",
    "special_requirements": "array - specific creator requirements"
  },
  "deliverables": {
    "content_types": "array - required content deliverables",
    "posting_requirements": "array - specific posting requirements",
    "attendance_required": "boolean - if event attendance is required",
    "content_guidelines": "string - content creation guidelines"
  },
  "requirements": {
    "hashtags": "array - required hashtags",
    "mentions": "array - required mentions/tags",
    "approval_required": "boolean - if content approval is needed",
    "exclusive_requirements": "array - exclusivity or other special requirements"
  },
  "ai_generated_insights": {
    "recommended_campaign_type": "string - AI recommendation if type unclear",
    "suggested_objectives": "string - AI-generated objectives if not clear",
    "target_audience_analysis": "string - AI analysis of ideal audience",
    "content_strategy_suggestions": "array - content strategy recommendations",
    "timing_recommendations": "string - optimal timing suggestions",
    "creator_persona_recommendations": "array - ideal creator types"
  },
  "extraction_metadata": {
    "confidence_score": "number - 0.0 to 1.0",
    "missing_fields": "array - fields that couldn't be extracted",
    "assumptions_made": "array - fields where AI made assumptions",
    "extraction_source": "string - query/document"
  }
}

Rules:
1. Extract explicit information first, then generate intelligent defaults for missing fields
2. Be conservative with confidence scores - only high confidence for explicitly mentioned info
3. Generate realistic and relevant content for missing fields based on context
4. For event campaigns, prioritize event-specific details
5. Standardize follower ranges (e.g., "100K-300K", "1M+", "micro", "macro", "mega")
6. Generate campaign names that are descriptive and professional
7. Infer campaign objectives from brand, product, and campaign type
8. If budget is per creator, calculate total budget if creators_needed is specified

Return only the JSON object, no explanations.
`;

      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 3000,
        temperature: 0.3,
      });

      let extractedData = response.choices[0].message.content.trim();
      extractedData = extractedData
        .replace(/```json\s*/, "")
        .replace(/```$/, "");

      return JSON.parse(extractedData);
    } catch (error) {
      console.error("Error extracting campaign from text:", error);
      throw new Error(
        `Failed to extract campaign information: ${error.message}`
      );
    }
  }

  // Analyze website and generate brand/product insights
  async analyzeWebsite(url) {
    try {
      console.log(`Analyzing website: ${url}`);

      // Scrape website content
      const scrapedData = await webScrapingService.scrapeWebsite(url);

      // Generate comprehensive brand analysis
      const brandAnalysis = await this.generateBrandAnalysis(scrapedData, url);

      return {
        scraped_data: scrapedData,
        brand_analysis: brandAnalysis,
        analyzed_at: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Error analyzing website:", error);
      throw new Error(`Website analysis failed: ${error.message}`);
    }
  }

  // Generate comprehensive brand analysis from scraped data
  async generateBrandAnalysis(scrapedData, url) {
    try {
      const prompt = `
Analyze this website data and generate comprehensive brand insights for influencer marketing campaigns.

Website: ${url}
Title: ${scrapedData.title}
Description: ${scrapedData.description}
Content Sample: ${scrapedData.contentText?.substring(0, 2000)}
Headings: ${scrapedData.headings?.map((h) => h.text).join(", ")}
Social Links: ${JSON.stringify(scrapedData.socialLinks)}

Generate detailed brand analysis in JSON format:

{
  "brand_overview": {
    "brand_name": "extracted or inferred brand name",
    "industry": "primary industry/sector",
    "business_type": "B2B/B2C/marketplace/service/product",
    "brand_description": "2-3 sentence brand overview",
    "market_position": "premium/mass market/luxury/budget-friendly",
    "geographical_presence": "local/national/international",
    "company_size": "startup/SME/enterprise"
  },
  "target_demographics": {
    "primary_audience": "main target customer description",
    "age_groups": ["age ranges that would be interested"],
    "income_level": "income bracket of typical customers",
    "lifestyle_attributes": ["lifestyle characteristics"],
    "geographic_markets": ["primary geographic markets"],
    "psychographic_traits": ["personality and interest traits"]
  },
  "brand_personality": {
    "brand_voice": "formal/casual/friendly/professional/playful",
    "brand_values": ["core brand values"],
    "messaging_style": "direct/storytelling/emotional/rational",
    "visual_style": "modern/classic/minimalist/bold/luxury",
    "communication_tone": "authoritative/approachable/inspirational/educational"
  },
  "product_insights": {
    "product_categories": ["main product/service categories"],
    "price_range": "budget/mid-range/premium/luxury",
    "unique_selling_points": ["key differentiators"],
    "product_benefits": ["main customer benefits"],
    "seasonal_relevance": "year-round/seasonal/specific occasions"
  },
  "marketing_analysis": {
    "current_marketing_channels": ["visible marketing channels"],
    "content_themes": ["common content themes on site"],
    "brand_partnerships": ["visible partnerships or collaborations"],
    "social_media_presence": ["platforms where brand is active"],
    "marketing_style": "performance-driven/brand-building/educational/entertainment"
  },
  "influencer_collaboration_fit": {
    "ideal_creator_types": ["types of creators that would fit"],
    "content_collaboration_opportunities": ["collaboration types that would work"],
    "creator_audience_alignment": "description of creator audiences that would align",
    "collaboration_goals": ["typical goals for influencer partnerships"],
    "content_guidelines_suggestions": ["suggested content guidelines for creators"],
    "campaign_types_recommended": ["recommended campaign types for this brand"]
  },
  "competitive_landscape": {
    "competitive_advantages": ["apparent competitive advantages"],
    "market_differentiation": "how brand differentiates itself",
    "innovation_focus": "areas where brand appears innovative",
    "brand_positioning": "how brand positions itself in market"
  },
  "analysis_confidence": {
    "overall_confidence": "number 0.0-1.0",
    "data_quality": "excellent/good/limited/poor",
    "analysis_completeness": "comprehensive/partial/basic",
    "recommendations_reliability": "high/medium/low"
  }
}

Focus on actionable insights for influencer marketing campaigns. Be specific and avoid generic descriptions.
`;

      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 2500,
        temperature: 0.3,
      });

      let brandAnalysis = response.choices[0].message.content.trim();
      brandAnalysis = brandAnalysis
        .replace(/```json\s*/, "")
        .replace(/```$/, "");

      return JSON.parse(brandAnalysis);
    } catch (error) {
      console.error("Error generating brand analysis:", error);
      throw new Error(`Brand analysis failed: ${error.message}`);
    }
  }

  // Generate comprehensive campaign analysis by combining extracted data and website analysis
  async generateCampaignAnalysis(extractedData, websiteAnalysis = null) {
    try {
      const prompt = `
Create a comprehensive campaign analysis by combining the extracted campaign data with brand insights.

Extracted Campaign Data:
${JSON.stringify(extractedData, null, 2)}

${
  websiteAnalysis
    ? `
Brand Analysis from Website:
${JSON.stringify(websiteAnalysis.brand_analysis, null, 2)}
`
    : ""
}

Generate enhanced campaign analysis:

{
  "campaign_intelligence": {
    "campaign_strategy": "overall strategic approach for this campaign",
    "success_metrics": ["key metrics to track for success"],
    "risk_factors": ["potential risks or challenges"],
    "optimization_opportunities": ["areas for campaign optimization"],
    "competitive_advantages": ["advantages this campaign approach provides"]
  },
  "target_audience_analysis": {
    "audience_persona": "detailed ideal audience description",
    "audience_interests": ["specific interests relevant to campaign"],
    "content_consumption_patterns": "how target audience consumes content",
    "platform_preferences": ["preferred social media platforms"],
    "engagement_behaviors": "how audience typically engages with branded content",
    "purchase_decision_factors": ["factors that influence buying decisions"]
  },
  "creator_matching_strategy": {
    "ideal_creator_profiles": ["detailed creator personas that would excel"],
    "creator_audience_overlap": "description of creator-brand audience alignment",
    "content_style_preferences": ["content styles that would resonate"],
    "creator_experience_requirements": ["required creator experience/background"],
    "exclusivity_considerations": ["exclusivity requirements or preferences"],
    "collaboration_approach": "recommended approach for creator partnerships"
  },
  "content_strategy": {
    "content_pillars": ["main content themes/pillars"],
    "storytelling_approach": "recommended narrative/storytelling style",
    "visual_guidelines": ["visual style and aesthetic recommendations"],
    "messaging_framework": ["key messages to communicate"],
    "call_to_action_strategy": "recommended CTAs and conversion approach",
    "content_distribution_timing": "optimal posting times and frequency"
  },
  "campaign_optimization": {
    "budget_allocation_strategy": "how to optimize budget distribution",
    "creator_tier_mix": "recommended mix of creator tiers (micro/macro/mega)",
    "geographic_optimization": "geographic targeting recommendations",
    "seasonal_considerations": "timing and seasonal factors",
    "cross_platform_strategy": "multi-platform approach recommendations",
    "performance_tracking_plan": "comprehensive tracking and measurement plan"
  },
  "brand_alignment_analysis": {
    "brand_fit_score": "number 0.0-1.0 indicating campaign-brand alignment",
    "brand_voice_integration": "how to integrate brand voice into creator content",
    "brand_value_amplification": "how campaign amplifies brand values",
    "brand_differentiation_opportunities": "opportunities to differentiate from competitors",
    "brand_risk_mitigation": "strategies to mitigate brand risks"
  },
  "execution_recommendations": {
    "campaign_phases": ["recommended campaign phases/milestones"],
    "creator_onboarding_process": "recommended creator onboarding approach",
    "content_approval_workflow": "suggested content review and approval process",
    "crisis_management_plan": "basic crisis management considerations",
    "success_celebration_strategy": "how to leverage successful content",
    "relationship_nurturing": "post-campaign relationship maintenance"
  },
  "market_intelligence": {
    "industry_trends_alignment": "how campaign aligns with current trends",
    "competitor_analysis": "competitive landscape considerations",
    "market_opportunity_assessment": "market opportunities this campaign addresses",
    "timing_market_fit": "assessment of market timing for campaign",
    "innovation_opportunities": "innovative approaches this campaign could take"
  },
  "roi_prediction": {
    "expected_performance_metrics": {
      "estimated_reach": "estimated total reach",
      "engagement_rate_prediction": "predicted engagement rates",
      "conversion_expectations": "expected conversion rates",
      "brand_awareness_lift": "predicted brand awareness impact"
    },
    "budget_efficiency_analysis": "analysis of budget efficiency",
    "roi_optimization_strategies": ["strategies to maximize ROI"],
    "performance_benchmarks": ["relevant industry benchmarks"],
    "success_probability": "number 0.0-1.0 indicating success likelihood"
  },
  "analysis_metadata": {
    "analysis_confidence": "number 0.0-1.0",
    "data_completeness": "percentage of available data used",
    "recommendation_strength": "high/medium/low confidence in recommendations",
    "assumptions_made": ["key assumptions in analysis"],
    "additional_research_needed": ["areas needing more research"]
  }
}

Provide specific, actionable insights based on the campaign type, brand, and target audience.

Provide the output in JSON only, no suufix/prefix to be added in the response
`;

      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 4000,
        temperature: 0.4,
      });

      let campaignAnalysis = response.choices[0].message.content.trim();
      campaignAnalysis = campaignAnalysis
        .replace(/```json\s*/, "")
        .replace(/```$/, "");

      return JSON.parse(campaignAnalysis);
    } catch (error) {
      console.error("Error generating campaign analysis:", error);
      throw new Error(`Campaign analysis failed: ${error.message}`);
    }
  }

  // Process document upload and extract campaign information
  async processCampaignDocument(fileBuffer, fileName, mimeType) {
    try {
      console.log(`Processing campaign document: ${fileName}`);

      // Convert document to text (implement based on file type)
      let documentText = "";

      if (mimeType.includes("text/plain")) {
        documentText = fileBuffer.toString("utf8");
      } else if (mimeType.includes("application/pdf")) {
        // Use pdf-parse library
        const pdf = require("pdf-parse");
        const pdfData = await pdf(fileBuffer);
        documentText = pdfData.text;
      } else if (
        mimeType.includes("application/msword") ||
        mimeType.includes(
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
      ) {
        // Use mammoth library for Word documents
        const mammoth = require("mammoth");
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        documentText = result.value;
      } else {
        throw new Error(
          "Unsupported file format. Please upload PDF, DOC, DOCX, or TXT files."
        );
      }

      if (!documentText.trim()) {
        throw new Error("Could not extract text from document");
      }

      // Extract campaign information from document text
      const extractedData = await this.extractCampaignFromText(
        documentText,
        "document"
      );

      return {
        document_info: {
          file_name: fileName,
          file_type: mimeType,
          text_length: documentText.length,
          processed_at: new Date().toISOString(),
        },
        extracted_text: documentText.substring(0, 1000), // First 1000 chars for reference
        extracted_campaign_data: extractedData,
      };
    } catch (error) {
      console.error("Error processing campaign document:", error);
      throw new Error(`Document processing failed: ${error.message}`);
    }
  }

  // Main method to create enhanced campaign with AI analysis
  async createEnhancedCampaign(
    campaignInput,
    creationMethod = "form",
    userId,
    brandId
  ) {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      console.log(`Creating enhanced campaign via ${creationMethod} method`);

      let extractedData = null;
      let websiteAnalysis = null;
      let campaignAnalysis = null;
      let productInfo = null;

      // Step 1: Extract campaign data based on creation method
      if (creationMethod === "form") {
        extractedData = this.convertFormToCampaignData(campaignInput);
      } else if (creationMethod === "document") {
        const documentResult = await this.processCampaignDocument(
          campaignInput.fileBuffer,
          campaignInput.fileName,
          campaignInput.mimeType
        );
        extractedData = documentResult.extracted_campaign_data;
      } else if (creationMethod === "query") {
        extractedData = await this.extractCampaignFromText(
          campaignInput.queryText,
          "query"
        );
      }

      // Step 2: Analyze website if URL provided
      if (extractedData.brand_product?.product_url) {
        try {
          websiteAnalysis = await this.analyzeWebsite(
            extractedData.brand_product.product_url
          );

          // Create product info from website analysis and extracted data
          productInfo = {
            product_name:
              extractedData.brand_product.product_name ||
              websiteAnalysis.brand_analysis.brand_overview.brand_name +
                " Product",
            product_url: extractedData.brand_product.product_url,
            price: extractedData.brand_product.product_price,
            currency: extractedData.brand_product.product_currency || "USD",
            brand_analysis: websiteAnalysis.brand_analysis,
            scraped_data: websiteAnalysis.scraped_data,
          };
        } catch (error) {
          console.error("Website analysis failed:", error);
          // Continue without website analysis
        }
      }

      // Step 3: Generate comprehensive campaign analysis
      campaignAnalysis = await this.generateCampaignAnalysis(
        extractedData,
        websiteAnalysis
      );

      // Step 4: Generate AI-powered influencer recommendations
      let influencerRecommendations = null;
      try {
        influencerRecommendations =
          await this.generateInfluencerRecommendations(
            extractedData,
            websiteAnalysis,
            campaignAnalysis
          );
      } catch (error) {
        console.error("Influencer recommendations failed:", error);
      }

      // Step 5: Generate campaign slug
      const campaignSlug = await this.generateCampaignSlug(
        extractedData.campaign_basics.campaign_name,
        brandId
      );

      // Step 6: Insert campaign record
      const campaignQuery = `
        INSERT INTO campaigns (
          brand_id, campaign_name, campaign_slug, campaign_type, status,
          description, objectives, budget, currency, start_date, end_date,
          target_audience, ai_extracted_data, ai_campaign_analysis,
          ai_recommended_influencers, product_info, creation_method,
          brand_owner_id, event_date, event_location, content_guidelines,
          hashtags, mention_requirements, approval_required
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24
        ) RETURNING *
      `;

      const campaignValues = [
        brandId,
        extractedData.campaign_basics.campaign_name,
        campaignSlug,
        extractedData.campaign_basics.campaign_type,
        "draft",
        extractedData.campaign_basics.description,
        extractedData.campaign_basics.objectives,
        extractedData.campaign_details.budget_per_creator,
        extractedData.campaign_details.currency || "USD",
        extractedData.campaign_details.start_date || null,
        extractedData.campaign_details.end_date || null,
        JSON.stringify(extractedData.target_audience),
        JSON.stringify(extractedData),
        JSON.stringify(campaignAnalysis),
        influencerRecommendations
          ? JSON.stringify(influencerRecommendations)
          : null,
        productInfo ? JSON.stringify(productInfo) : null,
        creationMethod,
        userId,
        extractedData.campaign_details.event_date || null,
        extractedData.campaign_details.event_location || null,
        extractedData.deliverables.content_guidelines || null,
        extractedData.requirements.hashtags || null,
        extractedData.requirements.mentions || null,
        extractedData.requirements.approval_required !== false,
      ];

      const campaignResult = await client.query(campaignQuery, campaignValues);
      const campaign = campaignResult.rows[0];

      await client.query("COMMIT");

      return {
        campaign: campaign,
        ai_analysis: {
          extracted_data: extractedData,
          website_analysis: websiteAnalysis,
          campaign_analysis: campaignAnalysis,
          influencer_recommendations: influencerRecommendations,
        },
        creation_metadata: {
          method: creationMethod,
          confidence_score:
            extractedData.extraction_metadata?.confidence_score || 0.8,
          missing_fields:
            extractedData.extraction_metadata?.missing_fields || [],
          generated_at: new Date().toISOString(),
        },
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // Convert form data to standardized campaign data format
  convertFormToCampaignData(formData) {
    return {
      campaign_basics: {
        campaign_name: formData.campaign_name,
        campaign_type: formData.campaign_type,
        description: formData.description,
        objectives: formData.objectives,
      },
      brand_product: {
        brand_name: formData.brand_name,
        product_name: formData.product_name,
        product_url: formData.product_url,
        product_price: formData.product_price
          ? parseFloat(formData.product_price)
          : null,
        product_currency: formData.product_currency || "USD",
      },
      campaign_details: {
        budget_per_creator: formData.budget
          ? parseFloat(formData.budget)
          : null,
        currency: formData.currency || "USD",
        start_date: formData.start_date,
        end_date: formData.end_date,
        event_date: formData.event_date,
        location: formData.location,
        event_location: formData.event_location,
      },
      target_audience: formData.target_audience || {},
      deliverables: {
        content_guidelines: formData.content_guidelines,
      },
      requirements: {
        hashtags: formData.hashtags
          ? formData.hashtags.split(",").map((h) => h.trim())
          : [],
        mentions: formData.mention_requirements
          ? [formData.mention_requirements]
          : [],
        approval_required: formData.approval_required !== false,
      },
      extraction_metadata: {
        confidence_score: 1.0,
        missing_fields: [],
        extraction_source: "form",
      },
    };
  }

  // Generate influencer recommendations based on campaign and brand analysis
  async generateInfluencerRecommendations(
    extractedData,
    websiteAnalysis,
    campaignAnalysis
  ) {
    try {
      // Build search query from campaign data
      const searchQuery = this.buildSearchQueryFromCampaignData(
        extractedData,
        websiteAnalysis
      );

      // Build search filters
      const searchFilters = this.buildSearchFiltersFromCampaignData(
        extractedData,
        campaignAnalysis
      );

      // Use AI search to find relevant creators
      const searchOptions = {
        filters: searchFilters,
        maxResults: 30,
        useHybridSearch: true,
        includeMetadata: true,
      };

      const searchResults = await aiSearchOrchestrator.search(
        searchQuery,
        searchOptions
      );

      if (!searchResults.success) {
        throw new Error(
          "AI search failed: " + (searchResults.error || "Unknown error")
        );
      }

      // Score and rank influencers based on campaign fit
      const scoredInfluencers = await this.scoreInfluencersForEnhancedCampaign(
        searchResults.results,
        extractedData,
        websiteAnalysis,
        campaignAnalysis
      );

      return {
        recommendations: scoredInfluencers.slice(0, 25),
        search_query_used: searchQuery,
        filters_applied: searchFilters,
        total_found: searchResults.results.length,
        search_metadata: searchResults.metadata,
        generated_at: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Error generating influencer recommendations:", error);
      throw error;
    }
  }

  // Build search query from campaign data and website analysis
  buildSearchQueryFromCampaignData(extractedData, websiteAnalysis) {
    const queryParts = [];

    // Add brand/product context
    if (websiteAnalysis?.brand_analysis?.brand_overview?.brand_name) {
      queryParts.push(websiteAnalysis.brand_analysis.brand_overview.brand_name);
    }

    // Add industry/category
    if (websiteAnalysis?.brand_analysis?.brand_overview?.industry) {
      queryParts.push(websiteAnalysis.brand_analysis.brand_overview.industry);
    }

    // Add campaign type context
    queryParts.push(
      extractedData.campaign_basics.campaign_type.replace("_", " ")
    );

    // Add target audience interests
    if (extractedData.target_audience?.interests?.length > 0) {
      queryParts.push(...extractedData.target_audience.interests.slice(0, 3));
    }

    // Add location if specified
    if (extractedData.campaign_details?.location) {
      queryParts.push(extractedData.campaign_details.location);
    }

    return queryParts.join(" ");
  }

  // Build search filters from campaign data
  buildSearchFiltersFromCampaignData(extractedData, campaignAnalysis) {
    const filters = {};

    // Follower range filtering
    if (extractedData.target_audience?.follower_range) {
      const followerRange =
        extractedData.target_audience.follower_range.toLowerCase();

      if (
        followerRange.includes("100k-300k") ||
        followerRange.includes("100-300k")
      ) {
        filters.min_followers = 100000;
        filters.max_followers = 300000;
        filters.tier = "macro";
      } else if (followerRange.includes("micro")) {
        filters.tier = "micro";
        filters.max_followers = 100000;
      } else if (followerRange.includes("macro")) {
        filters.tier = "macro";
        filters.min_followers = 100000;
        filters.max_followers = 1000000;
      } else if (followerRange.includes("mega")) {
        filters.tier = "mega";
        filters.min_followers = 1000000;
      }
    }

    // Budget-based filtering
    if (extractedData.campaign_details?.budget_per_creator) {
      const budget = extractedData.campaign_details.budget_per_creator;

      if (budget < 50000) {
        filters.max_followers = 100000; // Micro influencers
      } else if (budget < 200000) {
        filters.max_followers = 500000; // Small to mid macro
      }
    }

    // Location filtering
    if (
      extractedData.target_audience?.location_requirements ||
      extractedData.campaign_details?.location
    ) {
      const location =
        extractedData.target_audience.location_requirements ||
        extractedData.campaign_details.location;
      if (location.toLowerCase().includes("mumbai")) {
        filters.location_city = "Mumbai";
      } else if (location.toLowerCase().includes("delhi")) {
        filters.location_city = "Delhi";
      } else if (location.toLowerCase().includes("bangalore")) {
        filters.location_city = "Bangalore";
      }
    }

    // Age filtering
    if (extractedData.target_audience?.age_range) {
      const ageRange = extractedData.target_audience.age_range;
      if (ageRange.includes("25+")) {
        // This would need custom filtering in the search service
        filters.min_age = 25;
      }
    }

    // Minimum engagement rate
    filters.min_engagement_rate = 2.0;

    return filters;
  }

  // Score influencers for enhanced campaign
  async scoreInfluencersForEnhancedCampaign(
    influencers,
    extractedData,
    websiteAnalysis,
    campaignAnalysis
  ) {
    return influencers
      .map((influencer) => {
        const creator = influencer.creator_data;
        if (!creator) return { ...influencer, campaign_fit_score: 0 };

        let score = influencer.search_score || 0.5;
        const scoreBreakdown = {
          base_search_score: score,
          audience_alignment: 0,
          brand_fit: 0,
          campaign_type_fit: 0,
          location_match: 0,
          budget_fit: 0,
          special_requirements: 0,
        };

        // Enhanced scoring based on campaign analysis
        if (campaignAnalysis?.creator_matching_strategy) {
          // Brand alignment scoring
          if (websiteAnalysis?.brand_analysis && creator.brand_collaborations) {
            const brandScore = this.calculateBrandAlignment(
              creator.brand_collaborations,
              websiteAnalysis.brand_analysis
            );
            scoreBreakdown.brand_fit = brandScore * 0.2;
            score += scoreBreakdown.brand_fit;
          }

          // Campaign type experience
          if (creator.content_categories) {
            const campaignTypeScore = this.calculateCampaignTypeExperience(
              creator.content_categories,
              extractedData.campaign_basics.campaign_type
            );
            scoreBreakdown.campaign_type_fit = campaignTypeScore * 0.15;
            score += scoreBreakdown.campaign_type_fit;
          }

          // Location matching for events
          if (
            extractedData.campaign_details?.location &&
            creator.location_city
          ) {
            const locationScore = this.calculateLocationMatch(
              creator.location_city,
              extractedData.campaign_details.location
            );
            scoreBreakdown.location_match = locationScore * 0.1;
            score += scoreBreakdown.location_match;
          }

          // Special requirements (age, interests, etc.)
          const specialReqScore = this.calculateSpecialRequirements(
            creator,
            extractedData.target_audience
          );
          scoreBreakdown.special_requirements = specialReqScore * 0.15;
          score += scoreBreakdown.special_requirements;
        }

        return {
          ...influencer,
          campaign_fit_score: Math.min(score, 1),
          score_breakdown: scoreBreakdown,
          estimated_cost: this.estimateCollaborationCost(
            creator,
            extractedData.campaign_basics.campaign_type,
            extractedData.campaign_details.budget_per_creator
          ),
          ai_recommendation_reasons: this.generateAIRecommendationReasons(
            creator,
            extractedData,
            campaignAnalysis,
            scoreBreakdown
          ),
        };
      })
      .sort((a, b) => b.campaign_fit_score - a.campaign_fit_score);
  }

  // Calculate brand alignment score
  calculateBrandAlignment(creatorCollaborations, brandAnalysis) {
    if (!Array.isArray(creatorCollaborations) || !brandAnalysis) return 0.5;

    const brandIndustry = brandAnalysis.brand_overview?.industry?.toLowerCase();
    const brandValues = brandAnalysis.brand_personality?.brand_values || [];

    let alignmentScore = 0;
    let factors = 0;

    // Industry alignment
    if (brandIndustry) {
      const industryMatches = creatorCollaborations.filter(
        (collab) =>
          collab.brand_name?.toLowerCase().includes(brandIndustry) ||
          collab.collaboration_type?.toLowerCase().includes(brandIndustry)
      );
      alignmentScore +=
        (industryMatches.length / Math.max(creatorCollaborations.length, 1)) *
        0.4;
      factors++;
    }

    // Brand tier alignment
    const brandPosition =
      brandAnalysis.brand_overview?.market_position?.toLowerCase();
    if (brandPosition === "premium" || brandPosition === "luxury") {
      const premiumBrands = creatorCollaborations.filter(
        (collab) => collab.success_rating > 4.0 && collab.brand_name
      );
      alignmentScore +=
        (premiumBrands.length / Math.max(creatorCollaborations.length, 1)) *
        0.3;
      factors++;
    }

    return factors > 0 ? alignmentScore / factors : 0.5;
  }

  // Calculate campaign type experience score
  calculateCampaignTypeExperience(contentCategories, campaignType) {
    if (!Array.isArray(contentCategories)) return 0.5;

    const campaignTypeMapping = {
      event_coverage: ["events", "live", "coverage", "social"],
      product_review: ["reviews", "unboxing", "testing", "comparison"],
      sponsored_post: ["sponsored", "brand", "collaboration"],
      brand_ambassador: ["ambassador", "partnership", "longterm"],
      content_collaboration: ["collaboration", "creative", "content"],
    };

    const relevantKeywords = campaignTypeMapping[campaignType] || [];
    const matches = contentCategories.filter((category) =>
      relevantKeywords.some((keyword) =>
        category.toLowerCase().includes(keyword)
      )
    );

    return Math.min(matches.length / contentCategories.length, 1);
  }

  // Calculate location match score
  calculateLocationMatch(creatorLocation, campaignLocation) {
    if (!creatorLocation || !campaignLocation) return 0;

    const creatorLoc = creatorLocation.toLowerCase();
    const campaignLoc = campaignLocation.toLowerCase();

    if (creatorLoc === campaignLoc) return 1;
    if (creatorLoc.includes(campaignLoc) || campaignLoc.includes(creatorLoc))
      return 0.8;

    // City-state matching
    const locationMappings = {
      mumbai: ["maharashtra", "bombay"],
      delhi: ["new delhi", "ncr"],
      bangalore: ["bengaluru", "karnataka"],
    };

    for (const [city, alternatives] of Object.entries(locationMappings)) {
      if (
        (creatorLoc.includes(city) ||
          alternatives.some((alt) => creatorLoc.includes(alt))) &&
        (campaignLoc.includes(city) ||
          alternatives.some((alt) => campaignLoc.includes(alt)))
      ) {
        return 0.6;
      }
    }

    return 0;
  }

  // Calculate special requirements score
  calculateSpecialRequirements(creator, targetAudience) {
    let score = 0;
    let factors = 0;

    // Age requirements (approximate based on content and audience)
    if (targetAudience.age_range?.includes("25+")) {
      // Assume creators with professional content are likely 25+
      if (
        creator.content_categories?.some((cat) =>
          ["professional", "business", "finance", "career"].some((term) =>
            cat.toLowerCase().includes(term)
          )
        )
      ) {
        score += 0.3;
      }
      factors++;
    }

    // Interest alignment
    if (targetAudience.interests?.length > 0) {
      const creatorInterests = [
        ...(creator.content_categories || []),
        ...(creator.audience_insights?.specific_interests || []),
      ];

      const interestMatches = targetAudience.interests.filter((interest) =>
        creatorInterests.some(
          (ci) =>
            ci.toLowerCase().includes(interest.toLowerCase()) ||
            interest.toLowerCase().includes(ci.toLowerCase())
        )
      );

      score += (interestMatches.length / targetAudience.interests.length) * 0.4;
      factors++;
    }

    return factors > 0 ? score / factors : 0.5;
  }

  // Generate AI recommendation reasons
  generateAIRecommendationReasons(
    creator,
    extractedData,
    campaignAnalysis,
    scoreBreakdown
  ) {
    const reasons = [];

    if (scoreBreakdown.brand_fit > 0.15) {
      reasons.push("Strong brand alignment based on previous collaborations");
    }

    if (scoreBreakdown.campaign_type_fit > 0.1) {
      reasons.push(
        `Proven experience with ${extractedData.campaign_basics.campaign_type.replace(
          "_",
          " "
        )} campaigns`
      );
    }

    if (scoreBreakdown.location_match > 0.8) {
      reasons.push("Perfect location match for event requirements");
    } else if (scoreBreakdown.location_match > 0.5) {
      reasons.push("Good geographic alignment with campaign location");
    }

    if (scoreBreakdown.special_requirements > 0.1) {
      reasons.push("Meets specific campaign requirements and target criteria");
    }

    if (creator.client_satisfaction_score > 4.5) {
      reasons.push("Excellent track record with high client satisfaction");
    }

    if (creator.verification_status === "verified") {
      reasons.push("Verified creator with established credibility");
    }

    // Add campaign-specific reasons
    if (extractedData.campaign_basics.campaign_type === "event_coverage") {
      if (
        creator.content_categories?.some((cat) =>
          ["events", "social", "lifestyle"].some((term) =>
            cat.toLowerCase().includes(term)
          )
        )
      ) {
        reasons.push("Specializes in event content and social experiences");
      }
    }

    return reasons.length > 0
      ? reasons
      : ["Good overall match for campaign objectives"];
  }

  // Estimate collaboration cost with enhanced logic
  estimateCollaborationCost(creator, campaignType, budgetPerCreator = null) {
    if (!creator.pricing || !creator.pricing[creator.primary_platform]) {
      return {
        estimated: true,
        cost: budgetPerCreator || "Contact for pricing",
        currency: "USD",
        fits_budget: budgetPerCreator ? true : null,
      };
    }

    const pricing = creator.pricing[creator.primary_platform];
    let baseCost = pricing.sponsored_post || 0;

    // Adjust based on campaign type
    const campaignMultipliers = {
      event_coverage: 1.5,
      brand_ambassador: 3.0,
      product_review: 0.9,
      content_collaboration: 1.3,
      sponsored_post: 1.0,
      giveaway: 0.7,
    };

    const multiplier = campaignMultipliers[campaignType] || 1.0;
    const estimatedCost = baseCost * multiplier;

    return {
      estimated: true,
      cost: estimatedCost,
      currency: pricing.currency || "USD",
      fits_budget: budgetPerCreator
        ? estimatedCost <= budgetPerCreator * 1.1
        : null,
      breakdown: {
        base_rate: baseCost,
        campaign_multiplier: multiplier,
        campaign_type: campaignType,
      },
    };
  }

  // Generate unique campaign slug
  async generateCampaignSlug(campaignName, brandId) {
    let baseSlug = campaignName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    if (!baseSlug) {
      baseSlug = `campaign-${Date.now()}`;
    }

    let slug = baseSlug;
    let counter = 1;

    while (true) {
      const existingCampaign = await this.pool.query(
        "SELECT id FROM campaigns WHERE brand_id = $1 AND campaign_slug = $2",
        [brandId, slug]
      );

      if (existingCampaign.rows.length === 0) {
        return slug;
      }

      slug = `${baseSlug}-${counter}`;
      counter++;
    }
  }
}

module.exports = new EnhancedCampaignService();
