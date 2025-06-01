// controllers/brands/brandManagement.js
const express = require("express");
const router = express.Router();
const __constants = require("../../config/constants");
const validationOfAPI = require("../../middlewares/validation");
const jwtAuth = require("../../middlewares/auth/jwtAuthMiddleware");
const brandService = require("../../services/brands/brandService");
const webScrapingService = require("../../services/ai/webScrapingService");

/**
 * @namespace -BRAND-MANAGEMENT-MODULE-
 * @description API's related to brand profile management and AI-powered analysis.
 */

/**
 * @memberof -BRAND-MANAGEMENT-module-
 * @name createBrand
 * @path {POST} /api/brands/create
 * @description Create a new brand profile with optional AI-powered website analysis
 */
const createBrandValidation = {
  type: "object",
  required: true,
  properties: {
    brand_name: {
      type: "string",
      required: true,
      minLength: 2,
      maxLength: 100,
    },
    website_url: { type: "string", required: false, minLength: 4 },
    industry: { type: "string", required: false, maxLength: 100 },
    company_size: { type: "string", required: false },
    description: { type: "string", required: false, maxLength: 1000 },
    custom_overview: { type: "string", required: false, maxLength: 2000 },
    logo_url: { type: "string", required: false },
    brand_colors: { type: "object", required: false },
    social_media_links: { type: "object", required: false },
    contact_info: { type: "object", required: false },
    brand_guidelines: { type: "string", required: false, maxLength: 2000 },
    target_audience: { type: "object", required: false },
    brand_values: { type: "array", required: false },
    monthly_budget: { type: "number", required: false },
    currency: { type: "string", required: false },
  },
};

const createBrand = async (req, res) => {
  try {
    const userId = req.user.id;
    const brandData = req.body;

    // Validate company size if provided
    const validCompanySizes = [
      "startup",
      "small",
      "medium",
      "large",
      "enterprise",
    ];
    if (
      brandData.company_size &&
      !validCompanySizes.includes(brandData.company_size)
    ) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.INVALID_REQUEST,
        err: "Invalid company size. Must be one of: startup, small, medium, large, enterprise",
      });
    }

    console.log(
      `Creating brand profile for user ${userId}: ${brandData.brand_name}`
    );

    const brand = await brandService.createBrand(userId, brandData);

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        message: "Brand profile created successfully",
        brand: {
          id: brand.id,
          brand_name: brand.brand_name,
          brand_slug: brand.brand_slug,
          website_url: brand.website_url,
          industry: brand.industry,
          verification_status: brand.verification_status,
          ai_analysis_available: brand.ai_analysis_available,
          created_at: brand.created_at,
        },
        ai_overview: brand.ai_generated_overview
          ? JSON.parse(brand.ai_generated_overview)
          : null,
        scraped_data_available: !!brand.scraped_data,
      },
    });
  } catch (error) {
    console.error("Error creating brand:", error);

    if (error.message.includes("already has an active brand")) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.RECORD_EXIST,
        err: "You already have an active brand profile",
      });
    }

    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: error.message || "Failed to create brand profile",
    });
  }
};

/**
 * @memberof -BRAND-MANAGEMENT-module-
 * @name getBrandProfile
 * @path {GET} /api/brands/profile
 * @description Get current user's brand profile
 */
const getBrandProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const brand = await brandService.getBrandByUserId(userId);

    if (!brand) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.NO_RECORDS_FOUND,
        data: { message: "No brand profile found. Create one to get started." },
      });
    }

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        brand: brand,
      },
    });
  } catch (error) {
    console.error("Error getting brand profile:", error);
    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: "Failed to get brand profile",
    });
  }
};

/**
 * @memberof -BRAND-MANAGEMENT-module-
 * @name getBrandById
 * @path {GET} /api/brands/:brandId
 * @description Get specific brand profile by ID
 */
const getBrandByIdValidation = {
  type: "object",
  required: true,
  properties: {
    brandId: { type: "string", required: true },
  },
};

const getBrandById = async (req, res) => {
  try {
    const { brandId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const brand = await brandService.getBrandById(brandId, true);

    if (!brand) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.NO_RECORDS_FOUND,
        err: "Brand not found",
      });
    }

    // Check permissions - owners and admins can see full details
    if (brand.user_id !== userId && userRole !== "admin") {
      // Return limited public information for non-owners
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.SUCCESS,
        data: {
          brand: {
            id: brand.id,
            brand_name: brand.brand_name,
            brand_slug: brand.brand_slug,
            industry: brand.industry,
            verification_status: brand.verification_status,
            description: brand.description,
            logo_url: brand.logo_url,
            website_url: brand.website_url,
            created_at: brand.created_at,
          },
        },
      });
    }

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        brand: brand,
      },
    });
  } catch (error) {
    console.error("Error getting brand by ID:", error);
    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: "Failed to get brand details",
    });
  }
};

/**
 * @memberof -BRAND-MANAGEMENT-module-
 * @name updateBrand
 * @path {PUT} /api/brands/:brandId
 * @description Update brand profile
 */
const updateBrandValidation = {
  type: "object",
  required: false,
  properties: {
    brand_name: {
      type: "string",
      required: false,
      minLength: 2,
      maxLength: 100,
    },
    website_url: { type: "string", required: false, minLength: 4 },
    industry: { type: "string", required: false, maxLength: 100 },
    company_size: { type: "string", required: false },
    description: { type: "string", required: false, maxLength: 1000 },
    custom_overview: { type: "string", required: false, maxLength: 2000 },
    logo_url: { type: "string", required: false },
    brand_colors: { type: "object", required: false },
    social_media_links: { type: "object", required: false },
    contact_info: { type: "object", required: false },
    brand_guidelines: { type: "string", required: false, maxLength: 2000 },
    target_audience: { type: "object", required: false },
    brand_values: { type: "array", required: false },
    monthly_budget: { type: "number", required: false },
    currency: { type: "string", required: false },
  },
};

const updateBrand = async (req, res) => {
  try {
    const { brandId } = req.params;
    const userId = req.user.id;
    const updateData = req.body;

    const updatedBrand = await brandService.updateBrand(
      brandId,
      userId,
      updateData
    );

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        message: "Brand profile updated successfully",
        brand: updatedBrand,
      },
    });
  } catch (error) {
    console.error("Error updating brand:", error);

    if (error.message.includes("not authorized")) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.ACCESS_DENIED,
        err: "Not authorized to update this brand",
      });
    }

    if (error.message.includes("not found")) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.NO_RECORDS_FOUND,
        err: "Brand not found",
      });
    }

    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: error.message || "Failed to update brand profile",
    });
  }
};

/**
 * @memberof -BRAND-MANAGEMENT-module-
 * @name analyzeWebsite
 * @path {POST} /api/brands/analyze-website
 * @description Analyze a website and generate AI-powered brand overview
 */
const analyzeWebsiteValidation = {
  type: "object",
  required: true,
  properties: {
    website_url: { type: "string", required: true, minLength: 4 },
    brand_name: { type: "string", required: false },
  },
};

const analyzeWebsite = async (req, res) => {
  try {
    const { website_url, brand_name } = req.body;

    console.log(`Analyzing website: ${website_url}`);

    // Scrape website
    const scrapedData = await webScrapingService.scrapeWebsite(website_url);

    // Generate AI overview
    const aiOverview = await webScrapingService.generateBrandOverview(
      scrapedData,
      brand_name
    );

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        message: "Website analysis completed",
        ai_overview: aiOverview,
        scraped_data: {
          title: scrapedData.title,
          description: scrapedData.description,
          social_links: scrapedData.socialLinks,
          contact_info: scrapedData.contactInfo,
          headings: scrapedData.headings?.slice(0, 5),
          favicon: scrapedData.favicon,
          cached: scrapedData.cached || false,
        },
        confidence_score: aiOverview.confidence_score,
        analysis_timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Error analyzing website:", error);
    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.FAILED,
      err: error.message || "Website analysis failed",
    });
  }
};

/**
 * @memberof -BRAND-MANAGEMENT-module-
 * @name regenerateAIOverview
 * @path {POST} /api/brands/:brandId/regenerate-ai
 * @description Regenerate AI overview for existing brand
 */
const regenerateAIOverview = async (req, res) => {
  try {
    const { brandId } = req.params;
    const userId = req.user.id;

    const result = await brandService.regenerateAIOverview(brandId, userId);

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        message: "AI overview regenerated successfully",
        ai_overview: result.ai_overview,
        updated_at: result.brand.updated_at,
        scraped_data_available: !!result.scraped_data,
      },
    });
  } catch (error) {
    console.error("Error regenerating AI overview:", error);

    if (error.message.includes("not authorized")) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.ACCESS_DENIED,
        err: "Not authorized to update this brand",
      });
    }

    if (error.message.includes("Website URL is required")) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.INVALID_REQUEST,
        err: "Website URL is required for AI analysis",
      });
    }

    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: error.message || "Failed to regenerate AI overview",
    });
  }
};

/**
 * @memberof -BRAND-MANAGEMENT-module-
 * @name deleteBrand
 * @path {DELETE} /api/brands/:brandId
 * @description Delete brand profile (soft delete)
 */
const deleteBrand = async (req, res) => {
  try {
    const { brandId } = req.params;
    const userId = req.user.id;

    const result = await brandService.deleteBrand(brandId, userId);

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        message: "Brand profile deleted successfully",
        deleted: result.deleted,
      },
    });
  } catch (error) {
    console.error("Error deleting brand:", error);
    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: error.message || "Failed to delete brand profile",
    });
  }
};

/**
 * ADMIN ONLY ENDPOINTS
 */

/**
 * @memberof -BRAND-MANAGEMENT-module-
 * @name getAllBrands
 * @path {GET} /api/brands/admin/all
 * @description Get all brands with filtering and pagination (Admin only)
 */
const getAllBrandsValidation = {
  type: "object",
  required: false,
  properties: {
    page: { type: "string", required: false },
    limit: { type: "string", required: false },
    industry: { type: "string", required: false },
    verification_status: { type: "string", required: false },
    company_size: { type: "string", required: false },
    search: { type: "string", required: false },
  },
};

const getAllBrands = async (req, res) => {
  try {
    const filters = {};
    const pagination = {};

    if (req.query.industry) filters.industry = req.query.industry;
    if (req.query.verification_status)
      filters.verification_status = req.query.verification_status;
    if (req.query.company_size) filters.company_size = req.query.company_size;
    if (req.query.search) filters.search = req.query.search;

    if (req.query.page) pagination.page = parseInt(req.query.page);
    if (req.query.limit) pagination.limit = parseInt(req.query.limit);

    const result = await brandService.getAllBrands(filters, pagination);

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: result,
    });
  } catch (error) {
    console.error("Error getting all brands:", error);
    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: "Failed to get brands",
    });
  }
};

/**
 * @memberof -BRAND-MANAGEMENT-module-
 * @name updateVerificationStatus
 * @path {PUT} /api/brands/admin/:brandId/verification
 * @description Update brand verification status (Admin only)
 */
const updateVerificationValidation = {
  type: "object",
  required: true,
  properties: {
    status: { type: "string", required: true },
  },
};

const updateVerificationStatus = async (req, res) => {
  try {
    const { brandId } = req.params;
    const { status } = req.body;
    const adminUserId = req.user.id;

    const updatedBrand = await brandService.updateVerificationStatus(
      brandId,
      status,
      adminUserId
    );

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        message: `Brand verification status updated to ${status}`,
        brand: {
          id: updatedBrand.id,
          brand_name: updatedBrand.brand_name,
          verification_status: updatedBrand.verification_status,
          updated_at: updatedBrand.updated_at,
        },
      },
    });
  } catch (error) {
    console.error("Error updating verification status:", error);

    if (error.message.includes("Admin access required")) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.ACCESS_DENIED,
        err: "Admin access required",
      });
    }

    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: error.message || "Failed to update verification status",
    });
  }
};

/**
 * @memberof -BRAND-MANAGEMENT-module-
 * @name getBrandStats
 * @path {GET} /api/brands/admin/stats
 * @description Get brand statistics (Admin only)
 */
const getBrandStats = async (req, res) => {
  try {
    const stats = await brandService.getBrandStats();

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        statistics: {
          total_brands: parseInt(stats.total_brands),
          verified_brands: parseInt(stats.verified_brands),
          pending_brands: parseInt(stats.pending_brands),
          new_this_month: parseInt(stats.new_this_month),
          unique_industries: parseInt(stats.unique_industries),
          verification_rate:
            stats.total_brands > 0
              ? ((stats.verified_brands / stats.total_brands) * 100).toFixed(
                  1
                ) + "%"
              : "0%",
        },
      },
    });
  } catch (error) {
    console.error("Error getting brand stats:", error);
    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: "Failed to get brand statistics",
    });
  }
};

// Helper function to get brand ownership for middleware
const getBrandOwnerId = async (req) => {
  const brandId = req.params.brandId;
  const brand = await brandService.getBrandById(brandId);
  return brand ? brand.user_id : null;
};

// Apply authentication and route handlers
router.use(jwtAuth.securityHeaders());

// Public brand endpoints (require authentication)
router.post(
  "/create",
  jwtAuth.requireBrand(),
  jwtAuth.auditLog("CREATE_BRAND"),
  (req, res, next) =>
    validationOfAPI(req, res, next, createBrandValidation, "body"),
  createBrand
);

router.get("/profile", jwtAuth.requireBrand(), getBrandProfile);

router.get(
  "/:brandId",
  jwtAuth.requireAuth(),
  (req, res, next) =>
    validationOfAPI(req, res, next, getBrandByIdValidation, "params"),
  getBrandById
);

router.put(
  "/:brandId",
  jwtAuth.requireBrand(),
  jwtAuth.requireBrandOwnership(getBrandOwnerId),
  jwtAuth.auditLog("UPDATE_BRAND"),
  (req, res, next) =>
    validationOfAPI(req, res, next, updateBrandValidation, "body"),
  updateBrand
);

router.post(
  "/analyze-website",
  jwtAuth.requireBrand(),
  jwtAuth.rateLimit({ maxRequests: 10, windowMinutes: 60 }),
  (req, res, next) =>
    validationOfAPI(req, res, next, analyzeWebsiteValidation, "body"),
  analyzeWebsite
);

router.post(
  "/:brandId/regenerate-ai",
  jwtAuth.requireBrand(),
  jwtAuth.requireBrandOwnership(getBrandOwnerId),
  jwtAuth.rateLimit({ maxRequests: 5, windowMinutes: 60 }),
  regenerateAIOverview
);

router.delete(
  "/:brandId",
  jwtAuth.requireBrand(),
  jwtAuth.requireBrandOwnership(getBrandOwnerId),
  jwtAuth.auditLog("DELETE_BRAND"),
  deleteBrand
);

// Admin only endpoints
router.get(
  "/admin/all",
  jwtAuth.requireAdmin(),
  (req, res, next) =>
    validationOfAPI(req, res, next, getAllBrandsValidation, "query"),
  getAllBrands
);

router.put(
  "/admin/:brandId/verification",
  jwtAuth.requireAdmin(),
  jwtAuth.auditLog("UPDATE_BRAND_VERIFICATION"),
  (req, res, next) =>
    validationOfAPI(req, res, next, updateVerificationValidation, "body"),
  updateVerificationStatus
);

router.get("/admin/stats", jwtAuth.requireAdmin(), getBrandStats);

module.exports = router;
