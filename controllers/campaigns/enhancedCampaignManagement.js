// controllers/campaigns/enhancedCampaignManagement.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const __constants = require("../../config/constants");
const validationOfAPI = require("../../middlewares/validation");
const jwtAuth = require("../../middlewares/auth/jwtAuthMiddleware");
const enhancedCampaignService = require("../../services/campaigns/enhancedCampaignService");
const brandService = require("../../services/brands/brandService");

/**
 * @namespace -ENHANCED-CAMPAIGN-MANAGEMENT-MODULE-
 * @description Enhanced API's for campaign management with AI-powered creation methods
 */

// Configure multer for document uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Invalid file type. Please upload PDF, DOC, DOCX, or TXT files."
        ),
        false
      );
    }
  },
});

/**
 * @memberof -ENHANCED-CAMPAIGN-MANAGEMENT-module-
 * @name createCampaignFromForm
 * @path {POST} /api/campaigns/enhanced/create-form
 * @description Create campaign using enhanced form with integrated product information
 */
const createCampaignFromFormValidation = {
  type: "object",
  required: true,
  properties: {
    // Campaign basics
    campaign_name: {
      type: "string",
      required: true,
      minLength: 3,
      maxLength: 255,
    },
    campaign_type: { type: "string", required: true },
    description: { type: "string", required: false, maxLength: 2000 },
    objectives: { type: "string", required: false, maxLength: 1000 },

    // Product information (integrated)
    product_name: { type: "string", required: false, maxLength: 255 },
    product_url: { type: "string", required: false },
    product_price: { type: "number", required: false },
    product_currency: { type: "string", required: false },

    // Campaign details
    budget: { type: "number", required: false },
    currency: { type: "string", required: false },
    start_date: { type: "string", required: false },
    end_date: { type: "string", required: false },
    location: { type: "string", required: false },
    event_date: { type: "string", required: false },
    event_location: { type: "string", required: false },

    // Target audience
    target_audience: { type: "object", required: false },

    // Content requirements
    content_guidelines: { type: "string", required: false, maxLength: 2000 },
    hashtags: { type: "string", required: false },
    mention_requirements: { type: "string", required: false },
    approval_required: { type: "boolean", required: false },
  },
};

const createCampaignFromForm = async (req, res) => {
  try {
    const userId = req.user.id;
    const campaignData = req.body;

    // Get brand data
    const brandData = await brandService.getBrandByUserId(userId);
    const brandId = brandData ? brandData.id : null;

    if (!brandId) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.NO_RECORDS_FOUND,
        err: "Brand not found. Please create a brand profile first.",
      });
    }

    // Validate campaign type
    const validCampaignTypes = [
      "sponsored_post",
      "brand_ambassador",
      "product_review",
      "event_coverage",
      "content_collaboration",
      "giveaway",
    ];

    if (!validCampaignTypes.includes(campaignData.campaign_type)) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.INVALID_REQUEST,
        err:
          "Invalid campaign type. Must be one of: " +
          validCampaignTypes.join(", "),
      });
    }

    console.log(
      `Creating enhanced campaign from form for brand ${brandId}: ${campaignData.campaign_name}`
    );

    // Create campaign using enhanced service
    const result = await enhancedCampaignService.createEnhancedCampaign(
      campaignData,
      "form",
      userId,
      brandId
    );

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        message: "Campaign created successfully with AI analysis",
        campaign: {
          id: result.campaign.id,
          campaign_name: result.campaign.campaign_name,
          campaign_slug: result.campaign.campaign_slug,
          campaign_type: result.campaign.campaign_type,
          status: result.campaign.status,
          budget: result.campaign.budget,
          currency: result.campaign.currency,
          created_at: result.campaign.created_at,
        },
        ai_analysis: {
          confidence_score: result.creation_metadata.confidence_score,
          website_analysis_available: !!result.ai_analysis.website_analysis,
          campaign_analysis_available: !!result.ai_analysis.campaign_analysis,
          influencer_recommendations_count:
            result.ai_analysis.influencer_recommendations?.recommendations
              ?.length || 0,
          missing_fields: result.creation_metadata.missing_fields,
        },
        product_info: result.ai_analysis.website_analysis
          ? {
              analyzed_website:
                !!result.ai_analysis.website_analysis.scraped_data,
              brand_insights_generated:
                !!result.ai_analysis.website_analysis.brand_analysis,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Error creating campaign from form:", error);
    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: error.message || "Failed to create campaign",
    });
  }
};

/**
 * @memberof -ENHANCED-CAMPAIGN-MANAGEMENT-module-
 * @name createCampaignFromDocument
 * @path {POST} /api/campaigns/enhanced/create-document
 * @description Create campaign by uploading and analyzing campaign brief document
 */
const createCampaignFromDocument = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get brand data
    const brandData = await brandService.getBrandByUserId(userId);
    const brandId = brandData ? brandData.id : null;

    if (!brandId) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.NO_RECORDS_FOUND,
        err: "Brand not found. Please create a brand profile first.",
      });
    }

    // Check if file was uploaded
    if (!req.file) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.INVALID_REQUEST,
        err: "No document uploaded. Please upload a campaign brief document.",
      });
    }

    const documentInput = {
      fileBuffer: req.file.buffer,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
    };

    console.log(
      `Creating campaign from document: ${req.file.originalname} for brand ${brandId}`
    );

    // Create campaign using enhanced service
    const result = await enhancedCampaignService.createEnhancedCampaign(
      documentInput,
      "document",
      userId,
      brandId
    );

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        message: "Campaign created successfully from document analysis",
        campaign: {
          id: result.campaign.id,
          campaign_name: result.campaign.campaign_name,
          campaign_slug: result.campaign.campaign_slug,
          campaign_type: result.campaign.campaign_type,
          status: result.campaign.status,
          budget: result.campaign.budget,
          currency: result.campaign.currency,
          created_at: result.campaign.created_at,
        },
        document_analysis: {
          file_name: req.file.originalname,
          file_size: req.file.size,
          extraction_confidence: result.creation_metadata.confidence_score,
          fields_extracted: result.ai_analysis.extracted_data
            ? Object.keys(result.ai_analysis.extracted_data).length
            : 0,
          missing_fields: result.creation_metadata.missing_fields,
        },
        ai_analysis: {
          website_analysis_available: !!result.ai_analysis.website_analysis,
          campaign_analysis_available: !!result.ai_analysis.campaign_analysis,
          influencer_recommendations_count:
            result.ai_analysis.influencer_recommendations?.recommendations
              ?.length || 0,
        },
      },
    });
  } catch (error) {
    console.error("Error creating campaign from document:", error);

    if (
      error.message.includes("Invalid file type") ||
      error.message.includes("Unsupported file format")
    ) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.INVALID_REQUEST,
        err: error.message,
      });
    }

    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: error.message || "Failed to create campaign from document",
    });
  }
};

/**
 * @memberof -ENHANCED-CAMPAIGN-MANAGEMENT-module-
 * @name createCampaignFromQuery
 * @path {POST} /api/campaigns/enhanced/create-query
 * @description Create campaign from natural language query/description
 */
const createCampaignFromQueryValidation = {
  type: "object",
  required: true,
  properties: {
    query_text: {
      type: "string",
      required: true,
      minLength: 50,
      maxLength: 5000,
    },
  },
};

const createCampaignFromQuery = async (req, res) => {
  try {
    const userId = req.user.id;
    const { query_text } = req.body;

    // Get brand data
    const brandData = await brandService.getBrandByUserId(userId);
    const brandId = brandData ? brandData.id : null;

    if (!brandId) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.NO_RECORDS_FOUND,
        err: "Brand not found. Please create a brand profile first.",
      });
    }

    const queryInput = {
      queryText: query_text,
    };

    console.log(`Creating campaign from NLP query for brand ${brandId}`);

    // Create campaign using enhanced service
    const result = await enhancedCampaignService.createEnhancedCampaign(
      queryInput,
      "query",
      userId,
      brandId
    );

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        message: "Campaign created successfully from AI query analysis",
        campaign: {
          id: result.campaign.id,
          campaign_name: result.campaign.campaign_name,
          campaign_slug: result.campaign.campaign_slug,
          campaign_type: result.campaign.campaign_type,
          status: result.campaign.status,
          budget: result.campaign.budget,
          currency: result.campaign.currency,
          created_at: result.campaign.created_at,
        },
        query_analysis: {
          original_query_length: query_text.length,
          extraction_confidence: result.creation_metadata.confidence_score,
          fields_extracted: result.ai_analysis.extracted_data
            ? Object.keys(result.ai_analysis.extracted_data).length
            : 0,
          ai_generated_fields: result.ai_analysis.extracted_data
            ?.ai_generated_insights
            ? Object.keys(
                result.ai_analysis.extracted_data.ai_generated_insights
              ).length
            : 0,
          missing_fields: result.creation_metadata.missing_fields,
        },
        ai_analysis: {
          website_analysis_available: !!result.ai_analysis.website_analysis,
          campaign_analysis_available: !!result.ai_analysis.campaign_analysis,
          influencer_recommendations_count:
            result.ai_analysis.influencer_recommendations?.recommendations
              ?.length || 0,
        },
      },
    });
  } catch (error) {
    console.error("Error creating campaign from query:", error);
    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: error.message || "Failed to create campaign from query",
    });
  }
};

/**
 * @memberof -ENHANCED-CAMPAIGN-MANAGEMENT-module-
 * @name previewCampaignAnalysis
 * @path {POST} /api/campaigns/enhanced/preview-analysis
 * @description Preview AI analysis without creating campaign
 */
const previewCampaignAnalysisValidation = {
  type: "object",
  required: true,
  properties: {
    analysis_type: {
      type: "string",
      required: true,
      enum: ["form", "query", "url_only"],
    },
    campaign_data: { type: "object", required: false },
    query_text: { type: "string", required: false },
    product_url: { type: "string", required: false },
  },
};

const previewCampaignAnalysis = async (req, res) => {
  try {
    const userId = req.user.id;
    const { analysis_type, campaign_data, query_text, product_url } = req.body;

    // Get brand data
    const brandData = await brandService.getBrandByUserId(userId);
    const brandId = brandData ? brandData.id : null;

    if (!brandId) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.NO_RECORDS_FOUND,
        err: "Brand not found. Please create a brand profile first.",
      });
    }

    let extractedData = null;
    let websiteAnalysis = null;

    // Extract data based on analysis type
    if (analysis_type === "form" && campaign_data) {
      extractedData =
        enhancedCampaignService.convertFormToCampaignData(campaign_data);
    } else if (analysis_type === "query" && query_text) {
      extractedData = await enhancedCampaignService.extractCampaignFromText(
        query_text,
        "query"
      );
    } else if (analysis_type === "url_only" && product_url) {
      // For URL-only analysis, create minimal campaign data
      extractedData = {
        brand_product: { product_url: product_url },
        extraction_metadata: { confidence_score: 0.5 },
      };
    } else {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.INVALID_REQUEST,
        err: "Invalid analysis configuration. Missing required data for analysis type.",
      });
    }

    // Analyze website if URL provided
    const urlToAnalyze =
      extractedData.brand_product?.product_url || product_url;
    if (urlToAnalyze) {
      try {
        websiteAnalysis = await enhancedCampaignService.analyzeWebsite(
          urlToAnalyze
        );
      } catch (error) {
        console.error("Website analysis failed in preview:", error);
      }
    }

    // Generate campaign analysis if we have enough data
    let campaignAnalysis = null;
    if (extractedData.campaign_basics || analysis_type === "url_only") {
      try {
        campaignAnalysis =
          await enhancedCampaignService.generateCampaignAnalysis(
            extractedData,
            websiteAnalysis
          );
      } catch (error) {
        console.error("Campaign analysis failed in preview:", error);
      }
    }

    // Generate sample influencer recommendations
    let influencerRecommendations = null;
    if (extractedData.campaign_basics && websiteAnalysis) {
      try {
        influencerRecommendations =
          await enhancedCampaignService.generateInfluencerRecommendations(
            extractedData,
            websiteAnalysis,
            campaignAnalysis
          );
      } catch (error) {
        console.error("Influencer recommendations failed in preview:", error);
      }
    }

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        message: "Campaign analysis preview generated successfully",
        preview: {
          analysis_type: analysis_type,
          extracted_data: extractedData,
          website_analysis: websiteAnalysis
            ? {
                brand_overview: websiteAnalysis.brand_analysis?.brand_overview,
                target_demographics:
                  websiteAnalysis.brand_analysis?.target_demographics,
                brand_personality:
                  websiteAnalysis.brand_analysis?.brand_personality,
                analysis_confidence:
                  websiteAnalysis.brand_analysis?.analysis_confidence,
              }
            : null,
          campaign_analysis: campaignAnalysis
            ? {
                campaign_intelligence: campaignAnalysis.campaign_intelligence,
                target_audience_analysis:
                  campaignAnalysis.target_audience_analysis,
                creator_matching_strategy:
                  campaignAnalysis.creator_matching_strategy,
                roi_prediction: campaignAnalysis.roi_prediction,
              }
            : null,
          influencer_preview: influencerRecommendations
            ? {
                total_found: influencerRecommendations.total_found,
                top_recommendations:
                  influencerRecommendations.recommendations
                    ?.slice(0, 5)
                    .map((rec) => ({
                      creator_name: rec.creator_data?.creator_name,
                      niche: rec.creator_data?.niche,
                      followers:
                        rec.creator_data?.platform_metrics?.[
                          rec.creator_data?.primary_platform
                        ]?.follower_count,
                      engagement_rate:
                        rec.creator_data?.platform_metrics?.[
                          rec.creator_data?.primary_platform
                        ]?.engagement_rate,
                      campaign_fit_score: rec.campaign_fit_score,
                      estimated_cost: rec.estimated_cost?.cost,
                      recommendation_reasons:
                        rec.ai_recommendation_reasons?.slice(0, 3),
                    })) || [],
              }
            : null,
        },
        analysis_metadata: {
          confidence_score:
            extractedData.extraction_metadata?.confidence_score || 0.5,
          analysis_completeness: {
            extracted_data: !!extractedData.campaign_basics,
            website_analysis: !!websiteAnalysis,
            campaign_analysis: !!campaignAnalysis,
            influencer_recommendations: !!influencerRecommendations,
          },
          preview_generated_at: new Date().toISOString(),
        },
      },
    });
  } catch (error) {
    console.error("Error generating campaign analysis preview:", error);
    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: error.message || "Failed to generate campaign analysis preview",
    });
  }
};

/**
 * @memberof -ENHANCED-CAMPAIGN-MANAGEMENT-module-
 * @name getCampaignFullAnalysis
 * @path {GET} /api/campaigns/enhanced/:campaignId/full-analysis
 * @description Get complete AI analysis for existing campaign
 */
const getCampaignFullAnalysis = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const userId = req.user.id;

    // Get campaign with full AI analysis
    const query = `
      SELECT c.*, b.brand_name, b.user_id as brand_owner_id
      FROM campaigns c
      JOIN brands b ON c.brand_id = b.id
      WHERE c.id = $1 AND c.is_active = true AND b.is_active = true
    `;

    const result = await enhancedCampaignService.pool.query(query, [
      campaignId,
    ]);

    if (result.rows.length === 0) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.NO_RECORDS_FOUND,
        err: "Campaign not found",
      });
    }

    const campaign = result.rows[0];

    // Check permissions
    if (campaign.brand_owner_id !== userId && req.user.role !== "admin") {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.ACCESS_DENIED,
        err: "Not authorized to view this campaign analysis",
      });
    }

    // Parse AI analysis data
    const aiExtractedData = campaign.ai_extracted_data
      ? JSON.parse(campaign.ai_extracted_data)
      : null;
    const aiCampaignAnalysis = campaign.ai_campaign_analysis
      ? JSON.parse(campaign.ai_campaign_analysis)
      : null;
    const aiRecommendations = campaign.ai_recommended_influencers
      ? JSON.parse(campaign.ai_recommended_influencers)
      : null;
    const productInfo = campaign.product_info
      ? JSON.parse(campaign.product_info)
      : null;

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        campaign_overview: {
          id: campaign.id,
          campaign_name: campaign.campaign_name,
          campaign_type: campaign.campaign_type,
          status: campaign.status,
          creation_method: campaign.creation_method,
          created_at: campaign.created_at,
        },
        ai_analysis: {
          extracted_data: aiExtractedData,
          campaign_analysis: aiCampaignAnalysis,
          influencer_recommendations: aiRecommendations,
          product_analysis: productInfo,
        },
        analysis_summary: {
          total_ai_recommendations:
            aiRecommendations?.recommendations?.length || 0,
          extraction_confidence:
            aiExtractedData?.extraction_metadata?.confidence_score || 0,
          campaign_analysis_available: !!aiCampaignAnalysis,
          website_analysis_available: !!productInfo?.brand_analysis,
          creation_method: campaign.creation_method,
          missing_fields:
            aiExtractedData?.extraction_metadata?.missing_fields || [],
        },
      },
    });
  } catch (error) {
    console.error("Error getting campaign full analysis:", error);
    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: "Failed to get campaign analysis",
    });
  }
};

/**
 * @memberof -ENHANCED-CAMPAIGN-MANAGEMENT-module-
 * @name regenerateAIAnalysis
 * @path {POST} /api/campaigns/enhanced/:campaignId/regenerate-analysis
 * @description Regenerate AI analysis for existing campaign
 */
const regenerateAIAnalysis = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const userId = req.user.id;

    // Get existing campaign
    const query = `
      SELECT c.*, b.brand_name, b.user_id as brand_owner_id
      FROM campaigns c
      JOIN brands b ON c.brand_id = b.id
      WHERE c.id = $1 AND c.is_active = true AND b.is_active = true
    `;

    const result = await enhancedCampaignService.pool.query(query, [
      campaignId,
    ]);

    if (result.rows.length === 0) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.NO_RECORDS_FOUND,
        err: "Campaign not found",
      });
    }

    const campaign = result.rows[0];

    // Check permissions
    if (campaign.brand_owner_id !== userId) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.ACCESS_DENIED,
        err: "Not authorized to update this campaign",
      });
    }

    console.log(
      `Regenerating AI analysis for campaign: ${campaign.campaign_name}`
    );

    // Get current extracted data
    const currentExtractedData = campaign.ai_extracted_data
      ? JSON.parse(campaign.ai_extracted_data)
      : null;

    if (!currentExtractedData) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.INVALID_REQUEST,
        err: "No AI extracted data found. Cannot regenerate analysis for manually created campaigns.",
      });
    }

    // Regenerate website analysis if URL available
    let websiteAnalysis = null;
    if (currentExtractedData.brand_product?.product_url) {
      try {
        websiteAnalysis = await enhancedCampaignService.analyzeWebsite(
          currentExtractedData.brand_product.product_url
        );
      } catch (error) {
        console.error("Website analysis failed during regeneration:", error);
      }
    }

    // Regenerate campaign analysis
    const campaignAnalysis =
      await enhancedCampaignService.generateCampaignAnalysis(
        currentExtractedData,
        websiteAnalysis
      );

    // Regenerate influencer recommendations
    let influencerRecommendations = null;
    try {
      influencerRecommendations =
        await enhancedCampaignService.generateInfluencerRecommendations(
          currentExtractedData,
          websiteAnalysis,
          campaignAnalysis
        );
    } catch (error) {
      console.error(
        "Influencer recommendations failed during regeneration:",
        error
      );
    }

    // Update campaign with new analysis
    const updateQuery = `
      UPDATE campaigns 
      SET ai_campaign_analysis = $1, 
          ai_recommended_influencers = $2,
          product_info = $3,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING *
    `;

    const productInfo = websiteAnalysis
      ? {
          product_name: currentExtractedData.brand_product?.product_name,
          product_url: currentExtractedData.brand_product?.product_url,
          price: currentExtractedData.brand_product?.product_price,
          currency: currentExtractedData.brand_product?.product_currency,
          brand_analysis: websiteAnalysis.brand_analysis,
          scraped_data: websiteAnalysis.scraped_data,
        }
      : null;

    const updateResult = await enhancedCampaignService.pool.query(updateQuery, [
      JSON.stringify(campaignAnalysis),
      influencerRecommendations
        ? JSON.stringify(influencerRecommendations)
        : null,
      productInfo ? JSON.stringify(productInfo) : null,
      campaignId,
    ]);

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        message: "AI analysis regenerated successfully",
        campaign_id: campaignId,
        updated_analysis: {
          campaign_analysis_updated: !!campaignAnalysis,
          website_analysis_updated: !!websiteAnalysis,
          influencer_recommendations_updated: !!influencerRecommendations,
          new_recommendations_count:
            influencerRecommendations?.recommendations?.length || 0,
        },
        updated_at: updateResult.rows[0].updated_at,
      },
    });
  } catch (error) {
    console.error("Error regenerating AI analysis:", error);
    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: error.message || "Failed to regenerate AI analysis",
    });
  }
};

// Apply authentication and route handlers
router.use(jwtAuth.securityHeaders());

// Enhanced campaign creation endpoints
router.post(
  "/enhanced/create-form",
  jwtAuth.requireBrand(),
  jwtAuth.auditLog("CREATE_ENHANCED_CAMPAIGN_FORM"),
  (req, res, next) =>
    validationOfAPI(req, res, next, createCampaignFromFormValidation, "body"),
  createCampaignFromForm
);

router.post(
  "/enhanced/create-document",
  jwtAuth.requireBrand(),
  jwtAuth.auditLog("CREATE_ENHANCED_CAMPAIGN_DOCUMENT"),
  upload.single("campaign_document"),
  createCampaignFromDocument
);

router.post(
  "/enhanced/create-query",
  jwtAuth.requireBrand(),
  jwtAuth.auditLog("CREATE_ENHANCED_CAMPAIGN_QUERY"),
  jwtAuth.rateLimit({ maxRequests: 10, windowMinutes: 60 }),
  (req, res, next) =>
    validationOfAPI(req, res, next, createCampaignFromQueryValidation, "body"),
  createCampaignFromQuery
);

// Preview and analysis endpoints
router.post(
  "/enhanced/preview-analysis",
  jwtAuth.requireBrand(),
  jwtAuth.rateLimit({ maxRequests: 20, windowMinutes: 60 }),
  (req, res, next) =>
    validationOfAPI(req, res, next, previewCampaignAnalysisValidation, "body"),
  previewCampaignAnalysis
);

router.get(
  "/enhanced/:campaignId/full-analysis",
  jwtAuth.requireAuth(),
  getCampaignFullAnalysis
);

router.post(
  "/enhanced/:campaignId/regenerate-analysis",
  jwtAuth.requireBrand(),
  jwtAuth.rateLimit({ maxRequests: 5, windowMinutes: 60 }),
  regenerateAIAnalysis
);

module.exports = router;
