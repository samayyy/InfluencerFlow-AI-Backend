// services/campaigns/campaignService.js
const { Pool } = require("pg");
const __config = require("../../config");
const aiSearchOrchestrator = require("../search/aiSearchOrchestrator");
const creatorService = require("../creators/creatorService");
const OpenAI = require("openai");

class CampaignService {
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

  // Generate AI-powered influencer search query from campaign data
  async generateInfluencerSearchQuery(
    campaignData,
    brandData,
    productData = null
  ) {
    try {
      const prompt = `
Create an optimized influencer search query based on this campaign information.

Campaign Details:
- Campaign Name: ${campaignData.campaign_name}
- Campaign Type: ${campaignData.campaign_type}
- Description: ${campaignData.description || "Not provided"}
- Objectives: ${campaignData.objectives || "Not provided"}
- Budget: $${campaignData.budget || "Not specified"}

Brand Information:
- Brand: ${brandData.brand_name}
- Industry: ${brandData.industry || "Not specified"}
- Brand Values: ${brandData.brand_values?.join(", ") || "Not specified"}

${
  productData
    ? `
Product Information:
- Product: ${productData.product_name}
- Category: ${productData.category || "Not specified"}
- Description: ${productData.description || "Not provided"}
`
    : ""
}

Target Audience:
${
  campaignData.target_audience
    ? JSON.stringify(campaignData.target_audience)
    : "Not specified"
}

Requirements:
${
  campaignData.requirements
    ? JSON.stringify(campaignData.requirements)
    : "Not specified"
}

Create a natural language search query that would find the most relevant influencers for this campaign. 
The query should be 1-2 sentences and focus on:
1. Content niche/category
2. Audience demographics
3. Content style
4. Platform preferences
5. Collaboration type

Return only the search query string, no explanations or JSON formatting.

Examples:
- "Tech YouTubers who create product reviews and tutorials with young male audiences interested in gaming and gadgets"
- "Beauty and fashion creators on Instagram with female audiences aged 18-34 who focus on affordable makeup and skincare"
- "Fitness influencers who create workout content and have health-conscious audiences interested in weight loss and wellness"
`;

      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 200,
        temperature: 0.7,
      });

      return response.choices[0].message.content.trim().replace(/"/g, "");
    } catch (error) {
      console.error("Error generating influencer search query:", error);
      // Fallback to basic query
      return `${brandData.industry || "lifestyle"} creators with ${
        campaignData.campaign_type || "sponsored post"
      } experience`;
    }
  }

  // Get AI-powered influencer recommendations for campaign
  async getInfluencerRecommendations(
    campaignData,
    brandData,
    productData = null,
    options = {}
  ) {
    try {
      const { maxResults = 20, includeScores = true } = options;

      console.log(
        `Generating influencer recommendations for campaign: ${campaignData.campaign_name}`
      );

      // Generate optimized search query
      const searchQuery = await this.generateInfluencerSearchQuery(
        campaignData,
        brandData,
        productData
      );
      console.log(`Generated search query: "${searchQuery}"`);

      // Build search filters based on campaign requirements and brand preferences
      const searchFilters = this.buildSearchFilters(campaignData, brandData);

      // Use AI search to find relevant creators
      const searchOptions = {
        filters: searchFilters,
        maxResults: maxResults,
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
      const scoredInfluencers = await this.scoreInfluencersForCampaign(
        searchResults.results,
        campaignData,
        brandData,
        productData
      );

      // Filter by budget constraints if specified
      const budgetFilteredInfluencers = this.filterByBudget(
        scoredInfluencers,
        campaignData.budget
      );

      // Return top recommendations
      const recommendations = budgetFilteredInfluencers.slice(0, maxResults);

      return {
        recommendations,
        search_query_used: searchQuery,
        filters_applied: searchFilters,
        total_found: searchResults.results.length,
        budget_filtered: budgetFilteredInfluencers.length,
        search_metadata: searchResults.metadata,
      };
    } catch (error) {
      console.error("Error getting influencer recommendations:", error);
      throw error;
    }
  }

  // Build search filters from campaign and brand data
  buildSearchFilters(campaignData, brandData) {
    const filters = {};

    // Platform filters
    if (campaignData.requirements?.platforms) {
      // Use first platform as primary filter
      filters.primary_platform = campaignData.requirements.platforms[0];
    }

    // Budget-based follower filtering
    if (campaignData.budget) {
      const budget = parseFloat(campaignData.budget);

      if (budget < 500) {
        filters.max_followers = 50000; // Micro influencers
        filters.tier = "micro";
      } else if (budget < 2000) {
        filters.max_followers = 500000; // Macro influencers
      } else {
        filters.min_followers = 100000; // Larger influencers
      }
    }

    // Target audience filters
    if (campaignData.target_audience) {
      const targetAudience = campaignData.target_audience;

      if (targetAudience.age_groups && targetAudience.age_groups.length > 0) {
        filters.audience_age_primary = targetAudience.age_groups[0];
      }

      if (targetAudience.gender && targetAudience.gender !== "any") {
        filters.audience_gender_primary = targetAudience.gender;
      }
    }

    // Brand preferences integration
    if (brandData.ai_generated_overview) {
      const aiOverview =
        typeof brandData.ai_generated_overview === "string"
          ? JSON.parse(brandData.ai_generated_overview)
          : brandData.ai_generated_overview;

      if (aiOverview.collaboration_fit?.ideal_creators) {
        // This could influence niche selection
        const idealCreators =
          aiOverview.collaboration_fit.ideal_creators.toLowerCase();

        if (idealCreators.includes("tech")) filters.niche = "tech_gaming";
        else if (idealCreators.includes("beauty"))
          filters.niche = "beauty_fashion";
        else if (idealCreators.includes("fitness"))
          filters.niche = "fitness_health";
        else if (idealCreators.includes("food")) filters.niche = "food_cooking";
        else if (idealCreators.includes("travel"))
          filters.niche = "lifestyle_travel";
      }
    }

    // Minimum engagement rate
    filters.min_engagement_rate = 2.0;

    return filters;
  }

  // Score influencers based on campaign fit
  async scoreInfluencersForCampaign(
    influencers,
    campaignData,
    brandData,
    productData
  ) {
    try {
      return influencers
        .map((influencer) => {
          const creator = influencer.creator_data;
          if (!creator) return { ...influencer, campaign_fit_score: 0 };

          let score = influencer.search_score || 0.5;
          let scoreBreakdown = {
            base_search_score: score,
            audience_alignment: 0,
            content_fit: 0,
            budget_fit: 0,
            collaboration_history: 0,
            engagement_quality: 0,
          };

          // Audience alignment scoring (25% weight)
          if (campaignData.target_audience && creator.audience_demographics) {
            const audienceScore = this.calculateAudienceAlignment(
              campaignData.target_audience,
              creator.audience_demographics
            );
            scoreBreakdown.audience_alignment = audienceScore * 0.25;
            score += scoreBreakdown.audience_alignment;
          }

          // Content fit scoring (20% weight)
          if (
            creator.content_categories &&
            campaignData.requirements?.content_type
          ) {
            const contentScore = this.calculateContentFit(
              creator.content_categories,
              campaignData.requirements.content_type
            );
            scoreBreakdown.content_fit = contentScore * 0.2;
            score += scoreBreakdown.content_fit;
          }

          // Budget fit scoring (15% weight)
          if (campaignData.budget && creator.pricing) {
            const budgetScore = this.calculateBudgetFit(
              campaignData.budget,
              creator.pricing,
              creator.primary_platform
            );
            scoreBreakdown.budget_fit = budgetScore * 0.15;
            score += scoreBreakdown.budget_fit;
          }

          // Collaboration history scoring (10% weight)
          if (
            creator.total_collaborations &&
            creator.client_satisfaction_score
          ) {
            const historyScore = Math.min(
              (creator.total_collaborations / 50) * 0.5 +
                (creator.client_satisfaction_score / 5) * 0.5,
              1
            );
            scoreBreakdown.collaboration_history = historyScore * 0.1;
            score += scoreBreakdown.collaboration_history;
          }

          // Engagement quality scoring (10% weight)
          if (
            creator.platform_metrics &&
            creator.platform_metrics[creator.primary_platform]
          ) {
            const platformMetrics =
              creator.platform_metrics[creator.primary_platform];
            const engagementScore = Math.min(
              platformMetrics.engagement_rate / 10,
              1
            );
            scoreBreakdown.engagement_quality = engagementScore * 0.1;
            score += scoreBreakdown.engagement_quality;
          }

          return {
            ...influencer,
            campaign_fit_score: Math.min(score, 1),
            score_breakdown: scoreBreakdown,
            estimated_cost: this.estimateCollaborationCost(
              creator,
              campaignData.campaign_type
            ),
            recommendation_reasons: this.generateRecommendationReasons(
              creator,
              campaignData,
              scoreBreakdown
            ),
          };
        })
        .sort((a, b) => b.campaign_fit_score - a.campaign_fit_score);
    } catch (error) {
      console.error("Error scoring influencers:", error);
      return influencers;
    }
  }

  // Calculate audience alignment score
  calculateAudienceAlignment(targetAudience, creatorAudience) {
    let alignmentScore = 0;
    let factors = 0;

    // Age group alignment
    if (
      targetAudience.age_groups &&
      creatorAudience[Object.keys(creatorAudience)[0]]
    ) {
      const primaryPlatform = Object.keys(creatorAudience)[0];
      const demographics = creatorAudience[primaryPlatform];

      if (
        targetAudience.age_groups.includes("18-24") &&
        demographics.age_18_24 > 30
      ) {
        alignmentScore += 0.3;
      }
      if (
        targetAudience.age_groups.includes("25-34") &&
        demographics.age_25_34 > 30
      ) {
        alignmentScore += 0.3;
      }
      factors++;
    }

    // Interest alignment
    if (targetAudience.interests && creatorAudience.interests) {
      const commonInterests = targetAudience.interests.filter((interest) =>
        creatorAudience.interests.some((ci) =>
          ci.toLowerCase().includes(interest.toLowerCase())
        )
      );
      alignmentScore +=
        (commonInterests.length / targetAudience.interests.length) * 0.4;
      factors++;
    }

    return factors > 0 ? alignmentScore / factors : 0.5;
  }

  // Calculate content fit score
  calculateContentFit(creatorCategories, requiredContentTypes) {
    if (
      !Array.isArray(creatorCategories) ||
      !Array.isArray(requiredContentTypes)
    ) {
      return 0.5;
    }

    const matches = requiredContentTypes.filter((type) =>
      creatorCategories.some(
        (category) =>
          category.toLowerCase().includes(type.toLowerCase()) ||
          type.toLowerCase().includes(category.toLowerCase())
      )
    );

    return matches.length / requiredContentTypes.length;
  }

  // Calculate budget fit score
  calculateBudgetFit(campaignBudget, creatorPricing, primaryPlatform) {
    if (!creatorPricing || !creatorPricing[primaryPlatform]) {
      return 0.5;
    }

    const budget = parseFloat(campaignBudget);
    const creatorRate = creatorPricing[primaryPlatform].sponsored_post || 0;

    if (creatorRate === 0) return 0.5;

    // Perfect fit if creator rate is 70-90% of budget
    const ratio = creatorRate / budget;

    if (ratio >= 0.7 && ratio <= 0.9) return 1;
    if (ratio >= 0.5 && ratio <= 1.1) return 0.8;
    if (ratio >= 0.3 && ratio <= 1.3) return 0.6;
    if (ratio <= 1.5) return 0.4;

    return 0.2; // Too expensive
  }

  // Estimate collaboration cost
  estimateCollaborationCost(creator, campaignType) {
    if (!creator.pricing || !creator.pricing[creator.primary_platform]) {
      return { estimated: true, cost: "Contact for pricing", currency: "USD" };
    }

    const pricing = creator.pricing[creator.primary_platform];
    let baseCost = pricing.sponsored_post || 0;

    // Adjust based on campaign type
    switch (campaignType) {
      case "brand_ambassador":
        baseCost = pricing.brand_ambassadorship_monthly || baseCost * 3;
        break;
      case "product_review":
        baseCost = baseCost * 0.8; // Typically less than sponsored posts
        break;
      case "event_coverage":
        baseCost = pricing.event_coverage || baseCost * 1.2;
        break;
      case "content_collaboration":
        baseCost = pricing.video_integration || baseCost * 1.5;
        break;
    }

    return {
      estimated: true,
      cost: baseCost,
      currency: pricing.currency || "USD",
      breakdown: {
        base_rate: pricing.sponsored_post,
        campaign_multiplier: baseCost / (pricing.sponsored_post || 1),
        campaign_type: campaignType,
      },
    };
  }

  // Generate recommendation reasons
  generateRecommendationReasons(creator, campaignData, scoreBreakdown) {
    const reasons = [];

    if (scoreBreakdown.audience_alignment > 0.15) {
      reasons.push("Strong audience alignment with target demographics");
    }

    if (scoreBreakdown.content_fit > 0.15) {
      reasons.push("Creates content that matches campaign requirements");
    }

    if (scoreBreakdown.budget_fit > 0.1) {
      reasons.push("Pricing fits within campaign budget");
    }

    if (scoreBreakdown.collaboration_history > 0.08) {
      reasons.push("Proven track record with brand collaborations");
    }

    if (scoreBreakdown.engagement_quality > 0.08) {
      reasons.push("High engagement rate indicates active audience");
    }

    if (creator.verification_status === "verified") {
      reasons.push("Verified creator with established credibility");
    }

    if (creator.client_satisfaction_score > 4.5) {
      reasons.push("Excellent client satisfaction ratings");
    }

    return reasons.length > 0
      ? reasons
      : ["Good overall match for your campaign goals"];
  }

  // Filter by budget constraints
  filterByBudget(influencers, campaignBudget) {
    if (!campaignBudget) return influencers;

    const budget = parseFloat(campaignBudget);

    return influencers.filter((influencer) => {
      const estimatedCost = influencer.estimated_cost;
      if (!estimatedCost || estimatedCost.cost === "Contact for pricing") {
        return true; // Include if no pricing info
      }

      return estimatedCost.cost <= budget * 1.2; // Allow 20% buffer
    });
  }

  // Create new campaign
  async createCampaign(brandId, userId, campaignData) {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      // Verify brand ownership
      const brandCheck = await client.query(
        "SELECT user_id, brand_name, industry, brand_values, ai_generated_overview FROM brands WHERE id = $1 AND is_active = true",
        [brandId]
      );

      if (brandCheck.rows.length === 0) {
        throw new Error("Brand not found");
      }

      if (brandCheck.rows[0].user_id !== userId) {
        throw new Error("Not authorized to create campaigns for this brand");
      }

      const brandData = brandCheck.rows[0];

      // Get product data if product_id is provided
      let productData = null;
      if (campaignData.product_id) {
        const productCheck = await client.query(
          "SELECT * FROM products WHERE id = $1 AND brand_id = $2 AND is_active = true",
          [campaignData.product_id, brandId]
        );

        if (productCheck.rows.length === 0) {
          throw new Error(
            "Product not found or not associated with this brand"
          );
        }

        productData = productCheck.rows[0];
      }

      // Generate unique slug
      const campaignSlug = await this.generateCampaignSlug(
        campaignData.campaign_name,
        brandId
      );

      // Generate AI-powered influencer recommendations
      let aiRecommendations = null;
      try {
        console.log(
          `Generating AI recommendations for campaign: ${campaignData.campaign_name}`
        );
        const recommendations = await this.getInfluencerRecommendations(
          campaignData,
          brandData,
          productData,
          { maxResults: 25 }
        );
        aiRecommendations = recommendations;
      } catch (error) {
        console.error("Failed to generate AI recommendations:", error);
        // Continue without recommendations
      }

      // Insert campaign record
      const campaignQuery = `
        INSERT INTO campaigns (
          brand_id, product_id, campaign_name, campaign_slug, campaign_type,
          status, description, objectives, target_audience, budget, currency,
          start_date, end_date, requirements, ai_recommended_influencers,
          content_guidelines, hashtags, mention_requirements, approval_required
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
        ) RETURNING *
      `;

      const campaignValues = [
        brandId,
        campaignData.product_id || null,
        campaignData.campaign_name,
        campaignSlug,
        campaignData.campaign_type,
        campaignData.status || "draft",
        campaignData.description || null,
        campaignData.objectives || null,
        campaignData.target_audience
          ? JSON.stringify(campaignData.target_audience)
          : null,
        campaignData.budget || null,
        campaignData.currency || "USD",
        campaignData.start_date || null,
        campaignData.end_date || null,
        campaignData.requirements
          ? JSON.stringify(campaignData.requirements)
          : null,
        aiRecommendations ? JSON.stringify(aiRecommendations) : null,
        campaignData.content_guidelines || null,
        campaignData.hashtags || null,
        campaignData.mention_requirements || null,
        campaignData.approval_required !== false, // Default to true
      ];

      const campaignResult = await client.query(campaignQuery, campaignValues);
      const campaign = campaignResult.rows[0];

      await client.query("COMMIT");

      return {
        ...campaign,
        ai_recommendations: aiRecommendations,
        brand_data: {
          brand_name: brandData.brand_name,
          industry: brandData.industry,
        },
        product_data: productData
          ? {
              product_name: productData.product_name,
              category: productData.category,
            }
          : null,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // Get campaign by ID
  async getCampaignById(campaignId, userId = null, userRole = null) {
    try {
      const query = `
        SELECT c.*, b.brand_name, b.user_id as brand_owner_id, b.verification_status as brand_verification,
               p.product_name, p.category as product_category
        FROM campaigns c
        JOIN brands b ON c.brand_id = b.id
        LEFT JOIN products p ON c.product_id = p.id
        WHERE c.id = $1 AND c.is_active = true AND b.is_active = true
      `;

      const result = await this.pool.query(query, [campaignId]);

      if (result.rows.length === 0) {
        return null;
      }

      const campaign = result.rows[0];

      // Parse JSON fields
      if (campaign.target_audience) {
        campaign.target_audience = JSON.parse(campaign.target_audience);
      }
      if (campaign.requirements) {
        campaign.requirements = JSON.parse(campaign.requirements);
      }
      if (campaign.ai_recommended_influencers) {
        campaign.ai_recommended_influencers = JSON.parse(
          campaign.ai_recommended_influencers
        );
      }

      // Check permissions for sensitive data
      const isOwner = userId && campaign.brand_owner_id === userId;
      const isAdmin = userRole === "admin";

      if (!isOwner && !isAdmin) {
        // Return limited public information
        return {
          id: campaign.id,
          campaign_name: campaign.campaign_name,
          campaign_slug: campaign.campaign_slug,
          campaign_type: campaign.campaign_type,
          status: campaign.status,
          description: campaign.description,
          brand_name: campaign.brand_name,
          brand_verification: campaign.brand_verification,
          created_at: campaign.created_at,
        };
      }

      return campaign;
    } catch (error) {
      console.error("Error getting campaign by ID:", error);
      throw error;
    }
  }

  // Get campaigns by brand
  async getCampaignsByBrandId(brandId, userId, pagination = {}) {
    try {
      const { page = 1, limit = 20 } = pagination;
      const offset = (page - 1) * limit;

      // Verify ownership
      const brandCheck = await this.pool.query(
        "SELECT user_id FROM brands WHERE id = $1 AND is_active = true",
        [brandId]
      );

      if (brandCheck.rows.length === 0) {
        throw new Error("Brand not found");
      }

      if (brandCheck.rows[0].user_id !== userId) {
        throw new Error("Not authorized to view these campaigns");
      }

      // Get total count
      const countResult = await this.pool.query(
        "SELECT COUNT(*) as total FROM campaigns WHERE brand_id = $1 AND is_active = true",
        [brandId]
      );
      const total = parseInt(countResult.rows[0].total);

      // Get campaigns
      const query = `
        SELECT c.*, p.product_name, p.category as product_category
        FROM campaigns c
        LEFT JOIN products p ON c.product_id = p.id
        WHERE c.brand_id = $1 AND c.is_active = true
        ORDER BY c.created_at DESC
        LIMIT $2 OFFSET $3
      `;

      const result = await this.pool.query(query, [brandId, limit, offset]);

      return {
        campaigns: result.rows.map((campaign) => {
          if (campaign.target_audience) {
            campaign.target_audience = JSON.parse(campaign.target_audience);
          }
          if (campaign.requirements) {
            campaign.requirements = JSON.parse(campaign.requirements);
          }
          return campaign;
        }),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      console.error("Error getting campaigns by brand ID:", error);
      throw error;
    }
  }

  // Get user's campaigns
  async getUserCampaigns(userId, pagination = {}) {
    try {
      const { page = 1, limit = 20 } = pagination;
      const offset = (page - 1) * limit;

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total 
        FROM campaigns c
        JOIN brands b ON c.brand_id = b.id
        WHERE b.user_id = $1 AND c.is_active = true AND b.is_active = true
      `;
      const countResult = await this.pool.query(countQuery, [userId]);
      const total = parseInt(countResult.rows[0].total);

      // Get campaigns
      const query = `
        SELECT c.*, b.brand_name, p.product_name, p.category as product_category
        FROM campaigns c
        JOIN brands b ON c.brand_id = b.id
        LEFT JOIN products p ON c.product_id = p.id
        WHERE b.user_id = $1 AND c.is_active = true AND b.is_active = true
        ORDER BY c.created_at DESC
        LIMIT $2 OFFSET $3
      `;

      const result = await this.pool.query(query, [userId, limit, offset]);

      return {
        campaigns: result.rows.map((campaign) => {
          if (campaign.target_audience) {
            campaign.target_audience = JSON.parse(campaign.target_audience);
          }
          if (campaign.requirements) {
            campaign.requirements = JSON.parse(campaign.requirements);
          }
          return campaign;
        }),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      console.error("Error getting user campaigns:", error);
      throw error;
    }
  }

  // Update campaign
  async updateCampaign(campaignId, userId, updateData) {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      // Verify ownership
      const ownershipCheck = await client.query(
        `
        SELECT c.brand_id, b.user_id 
        FROM campaigns c
        JOIN brands b ON c.brand_id = b.id
        WHERE c.id = $1 AND c.is_active = true AND b.is_active = true
      `,
        [campaignId]
      );

      if (ownershipCheck.rows.length === 0) {
        throw new Error("Campaign not found");
      }

      if (ownershipCheck.rows[0].user_id !== userId) {
        throw new Error("Not authorized to update this campaign");
      }

      // Build dynamic update query
      const updateFields = [];
      const updateValues = [];
      let paramCount = 0;

      // Handle simple fields
      const simpleFields = [
        "campaign_name",
        "campaign_type",
        "status",
        "description",
        "objectives",
        "budget",
        "currency",
        "start_date",
        "end_date",
        "content_guidelines",
        "mention_requirements",
        "approval_required",
        "product_id",
      ];

      simpleFields.forEach((field) => {
        if (updateData[field] !== undefined) {
          paramCount++;
          updateFields.push(`${field} = $${paramCount}`);
          updateValues.push(updateData[field]);
        }
      });

      // Handle array fields
      if (updateData.hashtags !== undefined) {
        paramCount++;
        updateFields.push(`hashtags = $${paramCount}`);
        updateValues.push(updateData.hashtags);
      }

      if (updateData.selected_influencers !== undefined) {
        paramCount++;
        updateFields.push(`selected_influencers = $${paramCount}`);
        updateValues.push(updateData.selected_influencers);
      }

      // Handle JSON fields
      const jsonFields = [
        "target_audience",
        "requirements",
        "performance_metrics",
      ];
      jsonFields.forEach((field) => {
        if (updateData[field] !== undefined) {
          paramCount++;
          updateFields.push(`${field} = $${paramCount}`);
          updateValues.push(JSON.stringify(updateData[field]));
        }
      });

      if (updateFields.length === 0) {
        throw new Error("No fields to update");
      }

      // Update campaign slug if name changed
      if (updateData.campaign_name) {
        const brandId = ownershipCheck.rows[0].brand_id;
        const newSlug = await this.generateCampaignSlug(
          updateData.campaign_name,
          brandId
        );
        paramCount++;
        updateFields.push(`campaign_slug = $${paramCount}`);
        updateValues.push(newSlug);
      }

      // Add updated_at
      paramCount++;
      updateFields.push(`updated_at = $${paramCount}`);
      updateValues.push(new Date());

      // Add campaign ID for WHERE clause
      paramCount++;
      updateValues.push(campaignId);

      const updateQuery = `
        UPDATE campaigns 
        SET ${updateFields.join(", ")}
        WHERE id = $${paramCount}
        RETURNING *
      `;

      const result = await client.query(updateQuery, updateValues);

      await client.query("COMMIT");

      return await this.getCampaignById(campaignId, userId);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // Regenerate influencer recommendations
  async regenerateInfluencerRecommendations(campaignId, userId) {
    try {
      const campaign = await this.getCampaignById(campaignId, userId, "brand");

      if (!campaign) {
        throw new Error("Campaign not found");
      }

      if (campaign.brand_owner_id !== userId) {
        throw new Error("Not authorized to update this campaign");
      }

      console.log(
        `Regenerating influencer recommendations for campaign: ${campaign.campaign_name}`
      );

      // Get brand data
      const brandData = await this.pool.query(
        "SELECT * FROM brands WHERE id = $1",
        [campaign.brand_id]
      );

      if (brandData.rows.length === 0) {
        throw new Error("Brand not found");
      }

      const brand = brandData.rows[0];

      // Get product data if applicable
      let productData = null;
      if (campaign.product_id) {
        const productResult = await this.pool.query(
          "SELECT * FROM products WHERE id = $1",
          [campaign.product_id]
        );
        productData = productResult.rows[0] || null;
      }

      // Generate new recommendations
      const recommendations = await this.getInfluencerRecommendations(
        campaign,
        brand,
        productData,
        { maxResults: 30 }
      );

      // Update campaign with new recommendations
      const updateQuery = `
        UPDATE campaigns 
        SET ai_recommended_influencers = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `;

      const result = await this.pool.query(updateQuery, [
        JSON.stringify(recommendations),
        campaignId,
      ]);

      return {
        campaign: result.rows[0],
        recommendations: recommendations,
      };
    } catch (error) {
      console.error("Error regenerating influencer recommendations:", error);
      throw error;
    }
  }

  // Delete campaign (soft delete)
  async deleteCampaign(campaignId, userId) {
    try {
      const updateQuery = `
        UPDATE campaigns 
        SET is_active = false, updated_at = CURRENT_TIMESTAMP
        FROM brands
        WHERE campaigns.id = $1 AND campaigns.brand_id = brands.id 
          AND brands.user_id = $2 AND brands.is_active = true
        RETURNING campaigns.id
      `;

      const result = await this.pool.query(updateQuery, [campaignId, userId]);

      if (result.rows.length === 0) {
        throw new Error("Campaign not found or not authorized");
      }

      return { deleted: true, campaign_id: campaignId };
    } catch (error) {
      console.error("Error deleting campaign:", error);
      throw error;
    }
  }

  // Get campaign statistics
  async getCampaignStats(userId = null) {
    try {
      let query, params;

      if (userId) {
        // User-specific stats
        query = `
          SELECT 
            COUNT(*) as total_campaigns,
            COUNT(*) FILTER (WHERE c.status = 'active') as active_campaigns,
            COUNT(*) FILTER (WHERE c.status = 'completed') as completed_campaigns,
            COUNT(*) FILTER (WHERE c.created_at > CURRENT_DATE - INTERVAL '30 days') as new_this_month,
            AVG(c.budget) FILTER (WHERE c.budget IS NOT NULL) as avg_budget,
            COUNT(DISTINCT c.campaign_type) as unique_campaign_types
          FROM campaigns c
          JOIN brands b ON c.brand_id = b.id
          WHERE b.user_id = $1 AND c.is_active = true AND b.is_active = true
        `;
        params = [userId];
      } else {
        // Global stats (admin)
        query = `
          SELECT 
            COUNT(*) as total_campaigns,
            COUNT(*) FILTER (WHERE c.status = 'active') as active_campaigns,
            COUNT(*) FILTER (WHERE c.status = 'completed') as completed_campaigns,
            COUNT(*) FILTER (WHERE c.created_at > CURRENT_DATE - INTERVAL '30 days') as new_this_month,
            AVG(c.budget) FILTER (WHERE c.budget IS NOT NULL) as avg_budget,
            COUNT(DISTINCT c.campaign_type) as unique_campaign_types,
            COUNT(DISTINCT c.brand_id) as brands_with_campaigns
          FROM campaigns c
          JOIN brands b ON c.brand_id = b.id
          WHERE c.is_active = true AND b.is_active = true
        `;
        params = [];
      }

      const result = await this.pool.query(query, params);
      const stats = result.rows[0];

      // Convert numeric strings to numbers
      Object.keys(stats).forEach((key) => {
        if (stats[key] && !isNaN(stats[key])) {
          stats[key] = parseFloat(stats[key]);
        }
      });

      return stats;
    } catch (error) {
      console.error("Error getting campaign stats:", error);
      throw error;
    }
  }
}

module.exports = new CampaignService();
