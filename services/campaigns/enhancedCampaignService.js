// services/campaigns/enhancedCampaignService.js
const { Pool } = require("pg");
const __config = require("../../config");
const aiSearchOrchestrator = require("../search/aiSearchOrchestrator");
const OpenAI = require("openai");

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

  // Create enhanced campaign with integrated product info
  async createEnhancedCampaign(brandId, userId, campaignData) {
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

        // Build enhanced search query including product info
        const searchQuery = await this.generateEnhancedSearchQuery(
          campaignData,
          brandData
        );

        const recommendations = await this.getInfluencerRecommendations(
          campaignData,
          brandData,
          { maxResults: 25, searchQuery }
        );
        aiRecommendations = recommendations;
      } catch (error) {
        console.error("Failed to generate AI recommendations:", error);
        // Continue without recommendations
      }

      // Structure product information for storage
      const productInfo = campaignData.product_info
        ? {
            product_name: campaignData.product_info.product_name,
            product_url: campaignData.product_info.product_url,
            product_price: campaignData.product_info.product_price,
            analysis: campaignData.product_info.analysis,
            currency: campaignData.currency || "USD",
          }
        : null;

      // Insert campaign record with integrated product info
      const campaignQuery = `
        INSERT INTO campaigns (
          brand_id, campaign_name, campaign_slug, campaign_type,
          status, description, objectives, target_audience, budget, currency,
          start_date, end_date, requirements, ai_recommended_influencers,
          content_guidelines, hashtags, mention_requirements, approval_required, 
          brand_owner_id, product_info, creation_method, ai_enhanced_data, location
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23
        ) RETURNING *
      `;

      const campaignValues = [
        brandId,
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
        userId, // brand_owner_id
        productInfo ? JSON.stringify(productInfo) : null,
        campaignData.creation_method || "form",
        campaignData.ai_enhanced_data
          ? JSON.stringify(campaignData.ai_enhanced_data)
          : null,
        campaignData.location || null,
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
        product_info: productInfo,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // Generate enhanced search query including product context
  async generateEnhancedSearchQuery(campaignData, brandData) {
    try {
      const prompt = `
Create an optimized influencer search query based on this enhanced campaign information.

Campaign Details:
- Campaign Name: ${campaignData.campaign_name}
- Campaign Type: ${campaignData.campaign_type}
- Description: ${campaignData.description || "Not provided"}
- Objectives: ${campaignData.objectives || "Not provided"}
- Budget: $${campaignData.budget || "Not specified"}
- Location: ${campaignData.location || "Not specified"}

Brand Information:
- Brand: ${brandData.brand_name}
- Industry: ${brandData.industry || "Not specified"}

${
  campaignData.product_info?.product_name
    ? `
Product Information:
- Product: ${campaignData.product_info.product_name}
- Product URL: ${campaignData.product_info.product_url || "Not provided"}
- Price: $${campaignData.product_info.product_price || "Not specified"}
${
  campaignData.product_info.analysis
    ? `- Product Category: ${campaignData.product_info.analysis.category}
- Target Audience: ${
        campaignData.product_info.analysis.target_audience?.demographics
      }
- Key Features: ${campaignData.product_info.analysis.key_features?.join(", ")}`
    : ""
}
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

Create a natural language search query (1-2 sentences) that finds the most relevant influencers.
Focus on: content niche, audience demographics, content style, platform preferences, collaboration type.

Return only the search query string, no explanations.
`;

      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 200,
        temperature: 0.7,
      });

      return response.choices[0].message.content.trim().replace(/"/g, "");
    } catch (error) {
      console.error("Error generating enhanced search query:", error);
      // Fallback to basic query
      return `${brandData.industry || "lifestyle"} creators for ${
        campaignData.campaign_type || "collaboration"
      } campaign`;
    }
  }

  // Enhanced influencer recommendations with product context
  async getInfluencerRecommendations(campaignData, brandData, options = {}) {
    try {
      const { maxResults = 20, searchQuery } = options;

      console.log(
        `Generating enhanced influencer recommendations for: ${campaignData.campaign_name}`
      );

      // Use provided search query or generate one
      const query =
        searchQuery ||
        (await this.generateEnhancedSearchQuery(campaignData, brandData));

      console.log(`Enhanced search query: "${query}"`);

      // Build comprehensive search filters
      const searchFilters = this.buildEnhancedSearchFilters(
        campaignData,
        brandData
      );

      // Use AI search to find relevant creators
      const searchOptions = {
        filters: searchFilters,
        maxResults: maxResults,
        useHybridSearch: true,
        includeMetadata: true,
      };

      const searchResults = await aiSearchOrchestrator.search(
        query,
        searchOptions
      );

      if (!searchResults.success) {
        throw new Error(
          "AI search failed: " + (searchResults.error || "Unknown error")
        );
      }

      // Enhanced scoring with product context
      const scoredInfluencers = await this.scoreInfluencersForEnhancedCampaign(
        searchResults.results,
        campaignData,
        brandData
      );

      // Filter by budget constraints
      const budgetFilteredInfluencers = this.filterByBudget(
        scoredInfluencers,
        campaignData.budget
      );

      const recommendations = budgetFilteredInfluencers.slice(0, maxResults);

      return {
        recommendations,
        search_query_used: query,
        filters_applied: searchFilters,
        total_found: searchResults.results.length,
        budget_filtered: budgetFilteredInfluencers.length,
        search_metadata: searchResults.metadata,
        product_context: campaignData.product_info || null,
      };
    } catch (error) {
      console.error(
        "Error getting enhanced influencer recommendations:",
        error
      );
      throw error;
    }
  }

  // Build enhanced search filters including product insights
  buildEnhancedSearchFilters(campaignData, brandData) {
    const filters = {};

    // Platform filters from requirements
    if (campaignData.requirements?.platforms?.length > 0) {
      filters.primary_platform = campaignData.requirements.platforms[0];
    }

    // Enhanced budget-based filtering
    if (campaignData.budget) {
      const budget = parseFloat(campaignData.budget);

      if (budget < 1000) {
        filters.max_followers = 50000;
        filters.tier = "micro";
      } else if (budget < 5000) {
        filters.max_followers = 500000;
      } else if (budget < 20000) {
        filters.min_followers = 100000;
        filters.max_followers = 1000000;
      } else {
        filters.min_followers = 500000;
      }
    }

    // Target audience filters with enhanced demographics
    if (campaignData.target_audience) {
      const targetAudience = campaignData.target_audience;

      if (targetAudience.age_groups?.length > 0) {
        filters.audience_age_primary = targetAudience.age_groups[0];
      }

      if (targetAudience.follower_range) {
        const followerRange = targetAudience.follower_range.toLowerCase();
        if (followerRange.includes("100") && followerRange.includes("300")) {
          filters.min_followers = 100000;
          filters.max_followers = 300000;
        } else if (followerRange.includes("micro")) {
          filters.tier = "micro";
        } else if (followerRange.includes("macro")) {
          filters.tier = "macro";
        }
      }
    }

    // Product-based niche filtering
    if (campaignData.product_info?.analysis?.category) {
      const category =
        campaignData.product_info.analysis.category.toLowerCase();

      if (category.includes("tech") || category.includes("electronic")) {
        filters.niche = "tech_gaming";
      } else if (category.includes("beauty") || category.includes("cosmetic")) {
        filters.niche = "beauty_fashion";
      } else if (category.includes("fitness") || category.includes("health")) {
        filters.niche = "fitness_health";
      } else if (category.includes("food") || category.includes("beverage")) {
        filters.niche = "food_cooking";
      } else if (
        category.includes("travel") ||
        category.includes("lifestyle")
      ) {
        filters.niche = "lifestyle_travel";
      }
    }

    // Brand industry alignment
    if (brandData.industry) {
      const industry = brandData.industry.toLowerCase();
      if (!filters.niche) {
        // Only if not already set by product
        if (industry.includes("technology")) filters.niche = "tech_gaming";
        else if (industry.includes("beauty")) filters.niche = "beauty_fashion";
        else if (industry.includes("fitness")) filters.niche = "fitness_health";
        else if (industry.includes("food")) filters.niche = "food_cooking";
      }
    }

    // Campaign type specific filters
    if (campaignData.campaign_type === "event_coverage") {
      filters.min_engagement_rate = 3.0; // Higher engagement for events
      if (campaignData.location) {
        // Could add location-based filtering if available
      }
    }

    // Minimum quality thresholds
    filters.min_engagement_rate = filters.min_engagement_rate || 2.0;
    filters.min_satisfaction_score = 3.5;

    return filters;
  }

  // Enhanced scoring with product context
  async scoreInfluencersForEnhancedCampaign(
    influencers,
    campaignData,
    brandData
  ) {
    return influencers
      .map((influencer) => {
        const creator = influencer.creator_data;
        if (!creator) return { ...influencer, campaign_fit_score: 0 };

        let score = influencer.search_score || 0.5;
        const scoreBreakdown = {
          base_search_score: score,
          audience_alignment: 0,
          content_fit: 0,
          budget_fit: 0,
          product_affinity: 0,
          brand_alignment: 0,
          engagement_quality: 0,
          location_relevance: 0,
        };

        // Audience alignment (20% weight)
        if (campaignData.target_audience && creator.audience_demographics) {
          const audienceScore = this.calculateEnhancedAudienceAlignment(
            campaignData.target_audience,
            creator.audience_demographics
          );
          scoreBreakdown.audience_alignment = audienceScore * 0.2;
          score += scoreBreakdown.audience_alignment;
        }

        // Product affinity scoring (15% weight)
        if (campaignData.product_info?.analysis && creator.content_categories) {
          const productScore = this.calculateProductAffinity(
            campaignData.product_info.analysis,
            creator
          );
          scoreBreakdown.product_affinity = productScore * 0.15;
          score += scoreBreakdown.product_affinity;
        }

        // Content fit (15% weight)
        if (
          campaignData.requirements?.content_type &&
          creator.content_categories
        ) {
          const contentScore = this.calculateContentFit(
            creator.content_categories,
            campaignData.requirements.content_type
          );
          scoreBreakdown.content_fit = contentScore * 0.15;
          score += scoreBreakdown.content_fit;
        }

        // Budget fit (15% weight)
        if (campaignData.budget && creator.pricing) {
          const budgetScore = this.calculateBudgetFit(
            campaignData.budget,
            creator.pricing,
            creator.primary_platform
          );
          scoreBreakdown.budget_fit = budgetScore * 0.15;
          score += scoreBreakdown.budget_fit;
        }

        // Brand alignment (10% weight)
        if (brandData.brand_values && creator.personality_profile) {
          const brandScore = this.calculateBrandAlignment(brandData, creator);
          scoreBreakdown.brand_alignment = brandScore * 0.1;
          score += scoreBreakdown.brand_alignment;
        }

        // Location relevance for events (10% weight)
        if (
          campaignData.campaign_type === "event_coverage" &&
          campaignData.location
        ) {
          const locationScore = this.calculateLocationRelevance(
            campaignData.location,
            creator.location_city,
            creator.location_country
          );
          scoreBreakdown.location_relevance = locationScore * 0.1;
          score += scoreBreakdown.location_relevance;
        }

        // Engagement quality (10% weight)
        if (creator.platform_metrics?.[creator.primary_platform]) {
          const platformMetrics =
            creator.platform_metrics[creator.primary_platform];
          const engagementScore = Math.min(
            platformMetrics.engagement_rate / 8,
            1
          );
          scoreBreakdown.engagement_quality = engagementScore * 0.1;
          score += scoreBreakdown.engagement_quality;
        }

        return {
          ...influencer,
          campaign_fit_score: Math.min(score, 1),
          score_breakdown: scoreBreakdown,
          estimated_cost: this.estimateEnhancedCollaborationCost(
            creator,
            campaignData
          ),
          recommendation_reasons: this.generateEnhancedRecommendationReasons(
            creator,
            campaignData,
            scoreBreakdown
          ),
        };
      })
      .sort((a, b) => b.campaign_fit_score - a.campaign_fit_score);
  }

  // Calculate product affinity score
  calculateProductAffinity(productAnalysis, creator) {
    let affinityScore = 0;
    let factors = 0;

    // Content category alignment
    if (productAnalysis.ideal_creator_types && creator.content_categories) {
      const idealTypes = productAnalysis.ideal_creator_types.map((t) =>
        t.toLowerCase()
      );
      const creatorCategories = creator.content_categories.map((c) =>
        c.toLowerCase()
      );

      const matches = idealTypes.filter((type) =>
        creatorCategories.some(
          (cat) => cat.includes(type) || type.includes(cat)
        )
      );

      affinityScore += (matches.length / idealTypes.length) * 0.4;
      factors++;
    }

    // Target audience alignment
    if (productAnalysis.target_audience && creator.audience_demographics) {
      const productAudience = productAnalysis.target_audience;
      const creatorAudience = Object.values(creator.audience_demographics)[0];

      if (creatorAudience) {
        // Age group alignment
        if (productAudience.age_groups) {
          const ageAlignment = this.calculateAgeAlignment(
            productAudience.age_groups,
            creatorAudience
          );
          affinityScore += ageAlignment * 0.3;
        }

        // Interest alignment
        if (productAudience.interests && creatorAudience.interests) {
          const interestAlignment = this.calculateInterestAlignment(
            productAudience.interests,
            creatorAudience.interests
          );
          affinityScore += interestAlignment * 0.3;
        }
      }
      factors++;
    }

    return factors > 0 ? affinityScore / factors : 0.5;
  }

  // Calculate location relevance for events
  calculateLocationRelevance(campaignLocation, creatorCity, creatorCountry) {
    if (!campaignLocation || !creatorCity) return 0.5;

    const campaignLoc = campaignLocation.toLowerCase();
    const creatorLoc = (creatorCity + " " + creatorCountry).toLowerCase();

    // Exact city match
    if (
      creatorLoc.includes(campaignLoc) ||
      campaignLoc.includes(creatorCity.toLowerCase())
    ) {
      return 1.0;
    }

    // Same country
    if (campaignLoc.includes(creatorCountry.toLowerCase())) {
      return 0.6;
    }

    // Different location
    return 0.2;
  }

  // Generate enhanced recommendation reasons
  generateEnhancedRecommendationReasons(creator, campaignData, scoreBreakdown) {
    const reasons = [];

    if (scoreBreakdown.audience_alignment > 0.15) {
      reasons.push("Strong audience alignment with campaign demographics");
    }

    if (scoreBreakdown.product_affinity > 0.12) {
      reasons.push("High affinity for product category and target market");
    }

    if (scoreBreakdown.content_fit > 0.12) {
      reasons.push("Creates content that matches campaign requirements");
    }

    if (scoreBreakdown.budget_fit > 0.12) {
      reasons.push("Pricing aligns well with campaign budget");
    }

    if (scoreBreakdown.brand_alignment > 0.08) {
      reasons.push("Brand values alignment with creator personality");
    }

    if (scoreBreakdown.location_relevance > 0.08) {
      reasons.push("Geographic proximity to campaign/event location");
    }

    if (scoreBreakdown.engagement_quality > 0.08) {
      reasons.push("High engagement rate indicates active, engaged audience");
    }

    if (creator.verification_status === "verified") {
      reasons.push("Verified creator with established credibility");
    }

    if (creator.client_satisfaction_score > 4.5) {
      reasons.push("Excellent track record with previous brand collaborations");
    }

    return reasons.length > 0
      ? reasons
      : ["Good overall match for campaign objectives"];
  }

  // Estimate enhanced collaboration cost with campaign context
  estimateEnhancedCollaborationCost(creator, campaignData) {
    if (!creator.pricing?.[creator.primary_platform]) {
      return {
        estimated: true,
        cost: "Contact for pricing",
        currency: campaignData.currency || "USD",
      };
    }

    const pricing = creator.pricing[creator.primary_platform];
    let baseCost = pricing.sponsored_post || 0;

    // Campaign type adjustments
    const typeMultipliers = {
      brand_ambassador: 3.0,
      product_review: 0.8,
      event_coverage: 1.3,
      content_collaboration: 1.5,
      sponsored_post: 1.0,
    };

    const multiplier = typeMultipliers[campaignData.campaign_type] || 1.0;
    baseCost = baseCost * multiplier;

    // Event-specific adjustments
    if (campaignData.campaign_type === "event_coverage") {
      if (campaignData.requirements?.deliverables?.length > 2) {
        baseCost = baseCost * 1.2; // Multiple deliverables
      }
      if (campaignData.location) {
        baseCost = baseCost * 1.1; // Travel/attendance premium
      }
    }

    return {
      estimated: true,
      cost: Math.round(baseCost),
      currency: pricing.currency || campaignData.currency || "USD",
      breakdown: {
        base_rate: pricing.sponsored_post,
        campaign_multiplier: multiplier,
        campaign_type: campaignData.campaign_type,
        additional_factors:
          campaignData.campaign_type === "event_coverage"
            ? ["Event attendance", "Multiple deliverables"]
            : [],
      },
    };
  }

  // Helper methods (keeping existing ones and adding new ones)
  calculateEnhancedAudienceAlignment(targetAudience, creatorAudience) {
    // Enhanced version of audience alignment calculation
    // Implementation similar to existing but with more factors
    return this.calculateAudienceAlignment(targetAudience, creatorAudience);
  }

  calculateAgeAlignment(productAgeGroups, creatorAudience) {
    let alignment = 0;
    productAgeGroups.forEach((ageGroup) => {
      if (ageGroup === "18-24" && creatorAudience.age_18_24 > 25)
        alignment += 0.3;
      if (ageGroup === "25-34" && creatorAudience.age_25_34 > 25)
        alignment += 0.3;
      if (ageGroup === "35-44" && creatorAudience.age_35_44 > 25)
        alignment += 0.3;
    });
    return Math.min(alignment, 1);
  }

  calculateInterestAlignment(productInterests, creatorInterests) {
    if (!Array.isArray(productInterests) || !Array.isArray(creatorInterests)) {
      return 0.5;
    }

    const matches = productInterests.filter((interest) =>
      creatorInterests.some(
        (ci) =>
          ci.toLowerCase().includes(interest.toLowerCase()) ||
          interest.toLowerCase().includes(ci.toLowerCase())
      )
    );

    return matches.length / productInterests.length;
  }

  calculateBrandAlignment(brandData, creator) {
    // Calculate alignment between brand values and creator personality
    let alignment = 0.5; // Default neutral alignment

    try {
      if (brandData.brand_values && creator.personality_profile) {
        const brandValues = Array.isArray(brandData.brand_values)
          ? brandData.brand_values
          : JSON.parse(brandData.brand_values);

        const personality =
          typeof creator.personality_profile === "string"
            ? JSON.parse(creator.personality_profile)
            : creator.personality_profile;

        // Simple keyword matching for brand-creator alignment
        const brandKeywords = brandValues.join(" ").toLowerCase();
        const creatorStyle = (
          personality.content_style +
          " " +
          personality.communication_tone
        ).toLowerCase();

        if (
          brandKeywords.includes("premium") &&
          creatorStyle.includes("professional")
        ) {
          alignment += 0.3;
        }
        if (brandKeywords.includes("fun") && creatorStyle.includes("casual")) {
          alignment += 0.3;
        }
        if (
          brandKeywords.includes("authentic") &&
          creatorStyle.includes("genuine")
        ) {
          alignment += 0.3;
        }
      }
    } catch (error) {
      console.error("Error calculating brand alignment:", error);
    }

    return Math.min(alignment, 1);
  }

  // Inherit other methods from original service...
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

  calculateBudgetFit(campaignBudget, creatorPricing, primaryPlatform) {
    if (!creatorPricing?.[primaryPlatform]) {
      return 0.5;
    }

    const budget = parseFloat(campaignBudget);
    const creatorRate = creatorPricing[primaryPlatform].sponsored_post || 0;

    if (creatorRate === 0) return 0.5;

    const ratio = creatorRate / budget;

    if (ratio >= 0.7 && ratio <= 0.9) return 1;
    if (ratio >= 0.5 && ratio <= 1.1) return 0.8;
    if (ratio >= 0.3 && ratio <= 1.3) return 0.6;
    if (ratio <= 1.5) return 0.4;

    return 0.2;
  }

  filterByBudget(influencers, campaignBudget) {
    if (!campaignBudget) return influencers;

    const budget = parseFloat(campaignBudget);

    return influencers.filter((influencer) => {
      const estimatedCost = influencer.estimated_cost;
      if (!estimatedCost || estimatedCost.cost === "Contact for pricing") {
        return true;
      }

      return estimatedCost.cost <= budget * 1.2; // 20% buffer
    });
  }
}

module.exports = new EnhancedCampaignService();
