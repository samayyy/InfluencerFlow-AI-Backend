// controllers/campaigns/campaignManagement.js - Updated version
const express = require("express");
const router = express.Router();
const __constants = require("../../config/constants");
const validationOfAPI = require("../../middlewares/validation");
const jwtAuth = require("../../middlewares/auth/jwtAuthMiddleware");
const campaignService = require("../../services/campaigns/campaignService");
const enhancedCampaignService = require("../../services/campaigns/enhancedCampaignService");
const brandService = require("../../services/brands/brandService");
const campaignIntelligenceService = require("../../services/ai/campaignIntelligenceService");
const multer = require("multer");
const fs = require("fs");

// Configure multer for document uploads
const upload = multer({
  dest: "uploads/campaign-documents/",
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "text/plain",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only TXT, PDF, DOC, DOCX allowed."));
    }
  },
});

/**
 * Enhanced Campaign Creation - Form Method with Integrated Product Information
 */
const createCampaignFormValidation = {
  type: "object",
  required: true,
  properties: {
    campaign_name: {
      type: "string",
      required: true,
      minLength: 3,
      maxLength: 255,
    },
    campaign_type: { type: "string", required: true },
    description: { type: "string", required: false, maxLength: 2000 },
    objectives: { type: "string", required: false, maxLength: 1000 },
    product_name: { type: "string", required: false, maxLength: 255 },
    product_url: { type: "string", required: false },
    product_price: { type: "number", required: false },
    budget: { type: "number", required: false },
    currency: { type: "string", required: false },
    start_date: { type: "string", required: false },
    end_date: { type: "string", required: false },
    location: { type: "string", required: false },
    target_audience: { type: "object", required: false },
    requirements: { type: "object", required: false },
    content_guidelines: { type: "string", required: false, maxLength: 2000 },
    hashtags: { type: "string", required: false },
    mention_requirements: { type: "string", required: false },
    approval_required: { type: "boolean", required: false },
  },
};

const createCampaignForm = async (req, res) => {
  try {
    const userId = req.user.id;
    const campaignData = req.body;

    const brandData = await brandService.getBrandByUserId(userId);
    const brandId = brandData ? brandData.id : null;

    if (!brandData) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.NO_RECORDS_FOUND,
        err: "Brand not found. Please create a brand first.",
      });
    }

    // Validate campaign type
    const validCampaignTypes = [
      "sponsored_post",
      "brand_ambassador",
      "product_review",
      "event_coverage",
      "content_collaboration",
    ];

    if (!validCampaignTypes.includes(campaignData.campaign_type)) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.INVALID_REQUEST,
        err: "Invalid campaign type",
      });
    }

    // Analyze product if URL provided
    let productAnalysis = null;
    if (campaignData.product_url) {
      try {
        productAnalysis =
          await campaignIntelligenceService.analyzeProductForCampaign(
            campaignData.product_url,
            campaignData.product_name
          );
      } catch (error) {
        console.error("Product analysis failed:", error);
      }
    }

    // Structure campaign data with integrated product info
    const structuredCampaignData = {
      ...campaignData,
      brand_id: brandId,
      brand_owner_id: userId,
      creation_method: "form",
      product_info: {
        product_name: campaignData.product_name,
        product_url: campaignData.product_url,
        product_price: campaignData.product_price,
        analysis: productAnalysis,
      },
    };

    const campaign = await enhancedCampaignService.createEnhancedCampaign(
      brandId,
      userId,
      structuredCampaignData
    );

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        message: "Campaign created successfully",
        campaign: {
          id: campaign.id,
          campaign_name: campaign.campaign_name,
          campaign_slug: campaign.campaign_slug,
          campaign_type: campaign.campaign_type,
          status: campaign.status,
          budget: campaign.budget,
          currency: campaign.currency,
          created_at: campaign.created_at,
          product_info: campaign.product_info,
        },
        ai_recommendations: campaign.ai_recommendations,
        product_analysis: productAnalysis,
      },
    });
  } catch (error) {
    console.error("Error creating campaign via form:", error);
    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: error.message || "Failed to create campaign",
    });
  }
};

/**
 * Create Campaign from Document Upload
 */
const createCampaignFromDocument = async (req, res) => {
  try {
    const userId = req.user.id;
    const uploadedFile = req.file;

    if (!uploadedFile) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.INVALID_REQUEST,
        err: "No document uploaded",
      });
    }

    const brandData = await brandService.getBrandByUserId(userId);
    if (!brandData) {
      fs.unlinkSync(uploadedFile.path);
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.NO_RECORDS_FOUND,
        err: "Brand not found",
      });
    }

    // Read document content
    let documentText = "";
    try {
      if (uploadedFile.mimetype === "text/plain") {
        documentText = fs.readFileSync(uploadedFile.path, "utf8");
      } else {
        throw new Error(
          "Only TXT files supported currently. PDF support coming soon."
        );
      }
    } catch (error) {
      fs.unlinkSync(uploadedFile.path);
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.INVALID_REQUEST,
        err: `Failed to read document: ${error.message}`,
      });
    }

    // Extract campaign data using AI
    const extractedData =
      await campaignIntelligenceService.extractCampaignFromDocument(
        documentText,
        brandData.id
      );

    // Validate and enhance
    const validatedData =
      campaignIntelligenceService.validateCampaignData(extractedData);
    const enhancedData = await campaignIntelligenceService.enhanceCampaignData(
      validatedData,
      brandData
    );

    // Create campaign
    const campaignData = {
      ...enhancedData.enhanced_campaign,
      brand_id: brandData.id,
      brand_owner_id: userId,
      creation_method: "document",
      source_document: {
        filename: uploadedFile.originalname,
        processed_at: new Date().toISOString(),
        extraction_confidence:
          extractedData.extracted_insights?.confidence_score,
      },
    };

    const campaign = await enhancedCampaignService.createEnhancedCampaign(
      brandData.id,
      userId,
      campaignData
    );

    // Clean up file
    fs.unlinkSync(uploadedFile.path);

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        message: "Campaign created from document successfully",
        campaign: {
          id: campaign.id,
          campaign_name: campaign.campaign_name,
          campaign_type: campaign.campaign_type,
          status: campaign.status,
          budget: campaign.budget,
        },
        extracted_data: extractedData,
        ai_enhancements: enhancedData.ai_recommendations,
        confidence_score: extractedData.extracted_insights?.confidence_score,
      },
    });
  } catch (error) {
    if (req.file?.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {}
    }

    console.error("Error creating campaign from document:", error);
    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: error.message || "Failed to create campaign from document",
    });
  }
};

/**
 * Create Campaign from AI Query
 */
const createCampaignFromQueryValidation = {
  type: "object",
  required: true,
  properties: {
    query: { type: "string", required: true, minLength: 50, maxLength: 5000 },
    enhance_with_ai: { type: "boolean", required: false },
  },
};

const createCampaignFromQuery = async (req, res) => {
  try {
    const userId = req.user.id;
    const { query, enhance_with_ai = true } = req.body;

    const brandData = await brandService.getBrandByUserId(userId);
    if (!brandData) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.NO_RECORDS_FOUND,
        err: "Brand not found",
      });
    }

    // Extract campaign data from query
    const extractedData =
      await campaignIntelligenceService.extractCampaignFromQuery(
        query,
        brandData.id
      );

    // Validate and enhance if requested
    const validatedData =
      campaignIntelligenceService.validateCampaignData(extractedData);

    let enhancedData = { enhanced_campaign: validatedData };
    if (enhance_with_ai) {
      enhancedData = await campaignIntelligenceService.enhanceCampaignData(
        validatedData,
        brandData
      );
    }

    // Create campaign
    const campaignData = {
      ...enhancedData.enhanced_campaign,
      brand_id: brandData.id,
      brand_owner_id: userId,
      creation_method: "query",
      source_query: {
        original_query: query,
        processed_at: new Date().toISOString(),
        extraction_confidence: extractedData.ai_insights?.confidence_score,
      },
      ai_enhanced_data: enhancedData.ai_recommendations,
    };

    const campaign = await enhancedCampaignService.createEnhancedCampaign(
      brandData.id,
      userId,
      campaignData
    );

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        message: "Campaign created from query successfully",
        campaign: {
          id: campaign.id,
          campaign_name: campaign.campaign_name,
          campaign_type: campaign.campaign_type,
          status: campaign.status,
          budget: campaign.budget,
        },
        extracted_data: extractedData,
        ai_recommendations: enhancedData.ai_recommendations,
        confidence_score: extractedData.ai_insights?.confidence_score,
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
 * Preview Query Extraction (without creating campaign)
 */
const previewCampaignFromQuery = async (req, res) => {
  try {
    const userId = req.user.id;
    const { query } = req.body;

    if (!query || query.length < 20) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.INVALID_REQUEST,
        err: "Query must be at least 20 characters",
      });
    }

    const brandData = await brandService.getBrandByUserId(userId);
    if (!brandData) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.NO_RECORDS_FOUND,
        err: "Brand not found",
      });
    }

    // Extract data without creating campaign
    const extractedData =
      await campaignIntelligenceService.extractCampaignFromQuery(
        query,
        brandData.id
      );

    const validatedData =
      campaignIntelligenceService.validateCampaignData(extractedData);

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        message: "Query preview generated successfully",
        preview: {
          extracted_data: validatedData,
          confidence_score: extractedData.ai_insights?.confidence_score,
          inferred_fields: extractedData.ai_insights?.inferred_fields,
          generated_fields: extractedData.ai_insights?.generated_fields,
          ai_insights: extractedData.ai_insights,
          product_analysis: extractedData.product_analysis || null,
        },
      },
    });
  } catch (error) {
    console.error("Error previewing campaign query:", error);
    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: error.message || "Failed to preview campaign",
    });
  }
};

/**
 * Analyze Product URL for Campaign Integration
 */
const analyzeProductUrlValidation = {
  type: "object",
  required: true,
  properties: {
    product_url: { type: "string", required: true },
    product_name: { type: "string", required: false },
  },
};

const analyzeProductUrl = async (req, res) => {
  try {
    const { product_url, product_name } = req.body;

    const analysis =
      await campaignIntelligenceService.analyzeProductForCampaign(
        product_url,
        product_name
      );

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        message: "Product analysis completed",
        product_analysis: analysis,
        suggestions: {
          campaign_name: analysis.product_name
            ? `${analysis.product_name} Campaign`
            : null,
          campaign_type: analysis.collaboration_types?.[0] || "sponsored_post",
          target_audience: analysis.target_audience,
          content_opportunities: analysis.content_opportunities,
        },
      },
    });
  } catch (error) {
    console.error("Error analyzing product URL:", error);
    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: error.message || "Product analysis failed",
    });
  }
};

// ========== EXISTING CAMPAIGN MANAGEMENT METHODS ==========

/**
 * Legacy create campaign method (for backward compatibility)
 */
const createCampaignValidation = {
  type: "object",
  required: true,
  properties: {
    campaign_name: {
      type: "string",
      required: true,
      minLength: 3,
      maxLength: 255,
    },
    campaign_type: { type: "string", required: true },
    description: { type: "string", required: false, maxLength: 2000 },
    objectives: { type: "string", required: false, maxLength: 1000 },
    target_audience: { type: "object", required: false },
    budget: { type: "number", required: false },
    currency: { type: "string", required: false },
    start_date: { type: "string", required: false },
    end_date: { type: "string", required: false },
    requirements: { type: "object", required: false },
    content_guidelines: { type: "string", required: false, maxLength: 2000 },
    hashtags: { type: "array", required: false },
    mention_requirements: { type: "string", required: false, maxLength: 500 },
    approval_required: { type: "boolean", required: false },
  },
};

const createCampaign = async (req, res) => {
  try {
    const userId = req.user.id;
    const campaignData = req.body;
    const brandData = await brandService.getBrandByUserId(userId);
    const brandId = brandData ? brandData.id : null;

    // Validate campaign type
    const validCampaignTypes = [
      "sponsored_post",
      "brand_ambassador",
      "product_review",
      "event_coverage",
      "content_collaboration",
    ];
    if (!validCampaignTypes.includes(campaignData.campaign_type)) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.INVALID_REQUEST,
        err:
          "Invalid campaign type. Must be one of: " +
          validCampaignTypes.join(", "),
      });
    }

    // Verify brand ownership
    const brand = await brandService.getBrandById(brandId);
    if (!brand) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.NO_RECORDS_FOUND,
        err: "Brand not found",
      });
    }

    if (brand.user_id !== userId) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.ACCESS_DENIED,
        err: "Not authorized to create campaigns for this brand",
      });
    }

    console.log(
      `Creating campaign for brand ${brandId}: ${campaignData.campaign_name}`
    );

    const campaign = await campaignService.createCampaign(
      brandId,
      userId,
      campaignData
    );

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        message: "Campaign created successfully",
        campaign: {
          id: campaign.id,
          campaign_name: campaign.campaign_name,
          campaign_slug: campaign.campaign_slug,
          campaign_type: campaign.campaign_type,
          status: campaign.status,
          budget: campaign.budget,
          currency: campaign.currency,
          created_at: campaign.created_at,
        },
        ai_recommendations: campaign.ai_recommendations
          ? {
              total_found: campaign.ai_recommendations.total_found,
              recommendations_count:
                campaign.ai_recommendations.recommendations?.length || 0,
              search_query_used: campaign.ai_recommendations.search_query_used,
            }
          : null,
        brand_info: campaign.brand_data,
      },
    });
  } catch (error) {
    console.error("Error creating campaign:", error);
    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: error.message || "Failed to create campaign",
    });
  }
};

/**
 * Get specific campaign by ID
 */
const getCampaignByIdValidation = {
  type: "object",
  required: true,
  properties: {
    campaignId: { type: "string", required: true },
  },
};

const getCampaignById = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const campaign = await campaignService.getCampaignById(
      campaignId,
      userId,
      userRole
    );

    if (!campaign) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.NO_RECORDS_FOUND,
        err: "Campaign not found",
      });
    }

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        campaign: campaign,
      },
    });
  } catch (error) {
    console.error("Error getting campaign by ID:", error);
    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: "Failed to get campaign details",
    });
  }
};

/**
 * Get current user's campaigns
 */
const getMyCampaignsValidation = {
  type: "object",
  required: false,
  properties: {
    page: { type: "string", required: false },
    limit: { type: "string", required: false },
  },
};

const getMyCampaigns = async (req, res) => {
  try {
    const userId = req.user.id;
    const pagination = {};

    if (req.query.page) pagination.page = parseInt(req.query.page);
    if (req.query.limit) pagination.limit = parseInt(req.query.limit);

    const result = await campaignService.getUserCampaigns(userId, pagination);

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: result,
    });
  } catch (error) {
    console.error("Error getting user campaigns:", error);
    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: "Failed to get campaigns",
    });
  }
};

/**
 * Get campaigns by brand ID
 */
const getCampaignsByBrandValidation = {
  type: "object",
  required: true,
  properties: {
    brandId: { type: "string", required: true },
  },
};

const getCampaignsByBrand = async (req, res) => {
  try {
    const { brandId } = req.params;
    const userId = req.user.id;

    const pagination = {};
    if (req.query.page) pagination.page = parseInt(req.query.page);
    if (req.query.limit) pagination.limit = parseInt(req.query.limit);

    const result = await campaignService.getCampaignsByBrandId(
      brandId,
      userId,
      pagination
    );

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: result,
    });
  } catch (error) {
    console.error("Error getting campaigns by brand:", error);

    if (error.message.includes("not authorized")) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.ACCESS_DENIED,
        err: "Not authorized to view these campaigns",
      });
    }

    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: "Failed to get brand campaigns",
    });
  }
};

/**
 * Update campaign details
 */
const updateCampaignValidation = {
  type: "object",
  required: false,
  properties: {
    campaign_name: {
      type: "string",
      required: false,
      minLength: 3,
      maxLength: 255,
    },
    campaign_type: { type: "string", required: false },
    status: { type: "string", required: false },
    description: { type: "string", required: false, maxLength: 2000 },
    objectives: { type: "string", required: false, maxLength: 1000 },
    target_audience: { type: "object", required: false },
    budget: { type: "number", required: false },
    currency: { type: "string", required: false },
    start_date: { type: "string", required: false },
    end_date: { type: "string", required: false },
    requirements: { type: "object", required: false },
    content_guidelines: { type: "string", required: false, maxLength: 2000 },
    hashtags: { type: "array", required: false },
    mention_requirements: { type: "string", required: false, maxLength: 500 },
    approval_required: { type: "boolean", required: false },
    selected_influencers: { type: "array", required: false },
    performance_metrics: { type: "object", required: false },
  },
};

const updateCampaign = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const userId = req.user.id;
    const updateData = req.body;

    // Validate campaign type if provided
    if (updateData.campaign_type) {
      const validCampaignTypes = [
        "sponsored_post",
        "brand_ambassador",
        "product_review",
        "event_coverage",
        "content_collaboration",
      ];
      if (!validCampaignTypes.includes(updateData.campaign_type)) {
        return res.sendJson({
          type: __constants.RESPONSE_MESSAGES.INVALID_REQUEST,
          err:
            "Invalid campaign type. Must be one of: " +
            validCampaignTypes.join(", "),
        });
      }
    }

    // Validate status if provided
    if (updateData.status) {
      const validStatuses = [
        "draft",
        "active",
        "paused",
        "completed",
        "cancelled",
      ];
      if (!validStatuses.includes(updateData.status)) {
        return res.sendJson({
          type: __constants.RESPONSE_MESSAGES.INVALID_REQUEST,
          err: "Invalid status. Must be one of: " + validStatuses.join(", "),
        });
      }
    }

    const updatedCampaign = await campaignService.updateCampaign(
      campaignId,
      userId,
      updateData
    );

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        message: "Campaign updated successfully",
        campaign: updatedCampaign,
      },
    });
  } catch (error) {
    console.error("Error updating campaign:", error);

    if (error.message.includes("not authorized")) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.ACCESS_DENIED,
        err: "Not authorized to update this campaign",
      });
    }

    if (error.message.includes("not found")) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.NO_RECORDS_FOUND,
        err: "Campaign not found",
      });
    }

    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: error.message || "Failed to update campaign",
    });
  }
};

/**
 * Get AI-powered influencer recommendations for campaign
 */
const getCampaignRecommendations = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const userId = req.user.id;
    const { fresh = false, limit = 20 } = req.query;

    const campaign = await campaignService.getCampaignById(
      campaignId,
      userId,
      "brand"
    );

    if (!campaign) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.NO_RECORDS_FOUND,
        err: "Campaign not found",
      });
    }

    if (campaign.brand_owner_id !== userId) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.ACCESS_DENIED,
        err: "Not authorized to view recommendations for this campaign",
      });
    }

    let recommendations;

    if (fresh === "true" || !campaign.ai_recommended_influencers) {
      // Generate fresh recommendations
      console.log(
        `Generating fresh recommendations for campaign: ${campaign.campaign_name}`
      );
      const result = await campaignService.regenerateInfluencerRecommendations(
        campaignId,
        userId
      );
      recommendations = result.recommendations;
    } else {
      // Use existing recommendations
      recommendations = campaign.ai_recommended_influencers;
    }

    // Apply limit if specified
    if (recommendations && recommendations.recommendations) {
      recommendations.recommendations = recommendations.recommendations.slice(
        0,
        parseInt(limit)
      );
    }

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        campaign_id: campaignId,
        campaign_name: campaign.campaign_name,
        recommendations: recommendations,
        generated_fresh: fresh === "true",
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Error getting campaign recommendations:", error);
    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: error.message || "Failed to get influencer recommendations",
    });
  }
};

/**
 * Regenerate AI-powered influencer recommendations
 */
const regenerateRecommendations = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const userId = req.user.id;

    const result = await campaignService.regenerateInfluencerRecommendations(
      campaignId,
      userId
    );

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        message: "Influencer recommendations regenerated successfully",
        campaign_id: campaignId,
        recommendations: result.recommendations,
        updated_at: result.campaign.updated_at,
      },
    });
  } catch (error) {
    console.error("Error regenerating recommendations:", error);

    if (error.message.includes("not authorized")) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.ACCESS_DENIED,
        err: "Not authorized to update this campaign",
      });
    }

    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: error.message || "Failed to regenerate recommendations",
    });
  }
};

/**
 * Delete campaign (soft delete)
 */
const deleteCampaign = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const userId = req.user.id;

    const result = await campaignService.deleteCampaign(campaignId, userId);

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        message: "Campaign deleted successfully",
        deleted: result.deleted,
      },
    });
  } catch (error) {
    console.error("Error deleting campaign:", error);
    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: error.message || "Failed to delete campaign",
    });
  }
};

/**
 * Get campaign statistics for current user
 */
const getCampaignStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const stats = await campaignService.getCampaignStats(userId);

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        statistics: stats,
      },
    });
  } catch (error) {
    console.error("Error getting campaign stats:", error);
    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: "Failed to get campaign statistics",
    });
  }
};

// Helper function to get campaign ownership for middleware
const getCampaignOwnerId = async (req) => {
  const campaignId = req.params.campaignId;
  const campaign = await campaignService.getCampaignById(campaignId);
  return campaign ? campaign.brand_owner_id : null;
};

// Apply authentication and route handlers
router.use(jwtAuth.securityHeaders());

// ========== ENHANCED CAMPAIGN CREATION ROUTES ==========

// Enhanced form-based creation with integrated product fields
router.post(
  "/create/form",
  jwtAuth.requireBrand(),
  jwtAuth.auditLog("CREATE_CAMPAIGN_ENHANCED_FORM"),
  (req, res, next) =>
    validationOfAPI(req, res, next, createCampaignFormValidation, "body"),
  createCampaignForm
);

// Document-based creation
router.post(
  "/create/document",
  jwtAuth.requireBrand(),
  jwtAuth.auditLog("CREATE_CAMPAIGN_DOCUMENT"),
  jwtAuth.rateLimit({ maxRequests: 5, windowMinutes: 60 }),
  upload.single("document"),
  createCampaignFromDocument
);

// Query-based creation
router.post(
  "/create/query",
  jwtAuth.requireBrand(),
  jwtAuth.auditLog("CREATE_CAMPAIGN_QUERY"),
  jwtAuth.rateLimit({ maxRequests: 10, windowMinutes: 60 }),
  (req, res, next) =>
    validationOfAPI(req, res, next, createCampaignFromQueryValidation, "body"),
  createCampaignFromQuery
);

// Preview query extraction
router.post(
  "/preview/query",
  jwtAuth.requireBrand(),
  jwtAuth.rateLimit({ maxRequests: 20, windowMinutes: 60 }),
  previewCampaignFromQuery
);

// Product URL analysis
router.post(
  "/analyze-product",
  jwtAuth.requireBrand(),
  jwtAuth.rateLimit({ maxRequests: 15, windowMinutes: 60 }),
  (req, res, next) =>
    validationOfAPI(req, res, next, analyzeProductUrlValidation, "body"),
  analyzeProductUrl
);

// ========== STANDARD CAMPAIGN MANAGEMENT ROUTES ==========

// Legacy create endpoint (for backward compatibility)
router.post(
  "/create",
  jwtAuth.requireBrand(),
  jwtAuth.auditLog("CREATE_CAMPAIGN"),
  (req, res, next) =>
    validationOfAPI(req, res, next, createCampaignValidation, "body"),
  createCampaign
);

router.get(
  "/my-campaigns",
  jwtAuth.requireBrand(),
  (req, res, next) =>
    validationOfAPI(req, res, next, getMyCampaignsValidation, "query"),
  getMyCampaigns
);

router.get("/stats", jwtAuth.requireBrand(), getCampaignStats);

router.get(
  "/brand/:brandId",
  jwtAuth.requireAuth(),
  (req, res, next) =>
    validationOfAPI(req, res, next, getCampaignsByBrandValidation, "params"),
  getCampaignsByBrand
);

router.get(
  "/:campaignId",
  jwtAuth.requireAuth(),
  (req, res, next) =>
    validationOfAPI(req, res, next, getCampaignByIdValidation, "params"),
  getCampaignById
);

router.put(
  "/:campaignId",
  jwtAuth.requireBrand(),
  jwtAuth.requireOwnership(getCampaignOwnerId),
  jwtAuth.auditLog("UPDATE_CAMPAIGN"),
  (req, res, next) =>
    validationOfAPI(req, res, next, updateCampaignValidation, "body"),
  updateCampaign
);

router.get(
  "/:campaignId/recommendations",
  jwtAuth.requireBrand(),
  jwtAuth.requireOwnership(getCampaignOwnerId),
  getCampaignRecommendations
);

router.post(
  "/:campaignId/regenerate-recommendations",
  jwtAuth.requireBrand(),
  jwtAuth.requireOwnership(getCampaignOwnerId),
  jwtAuth.rateLimit({ maxRequests: 5, windowMinutes: 60 }),
  regenerateRecommendations
);

router.delete(
  "/:campaignId",
  jwtAuth.requireBrand(),
  jwtAuth.requireOwnership(getCampaignOwnerId),
  jwtAuth.auditLog("DELETE_CAMPAIGN"),
  deleteCampaign
);

module.exports = router;
