// controllers/campaigns/campaignManagement.js
const express = require('express')
const router = express.Router()
const __constants = require('../../config/constants')
const validationOfAPI = require('../../middlewares/validation')
const jwtAuth = require('../../middlewares/auth/jwtAuthMiddleware')
const campaignService = require('../../services/campaigns/campaignService')
const brandService = require('../../services/brands/brandService')

/**
 * @namespace -CAMPAIGN-MANAGEMENT-MODULE-
 * @description API's related to campaign management with AI-powered influencer recommendations.
 */

/**
 * @memberof -CAMPAIGN-MANAGEMENT-module-
 * @name createCampaign
 * @path {POST} /api/campaigns/create
 * @description Create a new campaign with AI-powered influencer recommendations
 */
const createCampaignValidation = {
  type: 'object',
  required: true,
  properties: {
    campaign_name: {
      type: 'string',
      required: true,
      minLength: 3,
      maxLength: 255
    },
    campaign_type: { type: 'string', required: true },
    product_id: { type: 'string', required: false },
    description: { type: 'string', required: false, maxLength: 2000 },
    objectives: { type: 'string', required: false, maxLength: 1000 },
    target_audience: { type: 'object', required: false },
    budget: { type: 'number', required: false },
    currency: { type: 'string', required: false },
    start_date: { type: 'string', required: false },
    end_date: { type: 'string', required: false },
    requirements: { type: 'object', required: false },
    content_guidelines: { type: 'string', required: false, maxLength: 2000 },
    hashtags: { type: 'array', required: false },
    mention_requirements: { type: 'string', required: false, maxLength: 500 },
    approval_required: { type: 'boolean', required: false }
  }
}

const createCampaign = async (req, res) => {
  try {
    const userId = req.user.id
    const campaignData = req.body
    const brandData =  await brandService.getBrandByUserId(userId)
    const brandId = brandData ? brandData.id : null

    // Validate campaign type
    const validCampaignTypes = [
      'sponsored_post',
      'brand_ambassador',
      'product_review',
      'event_coverage',
      'content_collaboration'
    ]
    if (!validCampaignTypes.includes(campaignData.campaign_type)) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.INVALID_REQUEST,
        err:
          'Invalid campaign type. Must be one of: ' +
          validCampaignTypes.join(', ')
      })
    }

    // Verify brand ownership
    const brand = await brandService.getBrandById(brandId)
    if (!brand) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.NO_RECORDS_FOUND,
        err: 'Brand not found'
      })
    }

    if (brand.user_id !== userId) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.ACCESS_DENIED,
        err: 'Not authorized to create campaigns for this brand'
      })
    }

    console.log(
      `Creating campaign for brand ${brandId}: ${campaignData.campaign_name}`
    )

    const campaign = await campaignService.createCampaign(
      brandId,
      userId,
      campaignData
    )

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        message: 'Campaign created successfully',
        campaign: {
          id: campaign.id,
          campaign_name: campaign.campaign_name,
          campaign_slug: campaign.campaign_slug,
          campaign_type: campaign.campaign_type,
          status: campaign.status,
          budget: campaign.budget,
          currency: campaign.currency,
          created_at: campaign.created_at
        },
        ai_recommendations: campaign.ai_recommendations
          ? {
            total_found: campaign.ai_recommendations.total_found,
            recommendations_count:
                campaign.ai_recommendations.recommendations?.length || 0,
            search_query_used: campaign.ai_recommendations.search_query_used
          }
          : null,
        brand_info: campaign.brand_data,
        product_info: campaign.product_data
      }
    })
  } catch (error) {
    console.error('Error creating campaign:', error)
    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: error.message || 'Failed to create campaign'
    })
  }
}

/**
 * @memberof -CAMPAIGN-MANAGEMENT-module-
 * @name getCampaignById
 * @path {GET} /api/campaigns/:campaignId
 * @description Get specific campaign by ID
 */
const getCampaignByIdValidation = {
  type: 'object',
  required: true,
  properties: {
    campaignId: { type: 'string', required: true }
  }
}

const getCampaignById = async (req, res) => {
  try {
    const { campaignId } = req.params
    const userId = req.user.id
    const userRole = req.user.role

    const campaign = await campaignService.getCampaignById(
      campaignId,
      userId,
      userRole
    )

    if (!campaign) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.NO_RECORDS_FOUND,
        err: 'Campaign not found'
      })
    }

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        campaign: campaign
      }
    })
  } catch (error) {
    console.error('Error getting campaign by ID:', error)
    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: 'Failed to get campaign details'
    })
  }
}

/**
 * @memberof -CAMPAIGN-MANAGEMENT-module-
 * @name getMyCampaigns
 * @path {GET} /api/campaigns/my-campaigns
 * @description Get current user's campaigns
 */
const getMyCampaignsValidation = {
  type: 'object',
  required: false,
  properties: {
    page: { type: 'string', required: false },
    limit: { type: 'string', required: false }
  }
}

const getMyCampaigns = async (req, res) => {
  try {
    const userId = req.user.id
    const pagination = {}

    if (req.query.page) pagination.page = parseInt(req.query.page)
    if (req.query.limit) pagination.limit = parseInt(req.query.limit)

    const result = await campaignService.getUserCampaigns(userId, pagination)

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: result
    })
  } catch (error) {
    console.error('Error getting user campaigns:', error)
    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: 'Failed to get campaigns'
    })
  }
}

/**
 * @memberof -CAMPAIGN-MANAGEMENT-module-
 * @name getCampaignsByBrand
 * @path {GET} /api/campaigns/brand/:brandId
 * @description Get campaigns by brand ID
 */
const getCampaignsByBrandValidation = {
  type: 'object',
  required: true,
  properties: {
    brandId: { type: 'string', required: true }
  }
}

const getCampaignsByBrand = async (req, res) => {
  try {
    const { brandId } = req.params
    const userId = req.user.id

    const pagination = {}
    if (req.query.page) pagination.page = parseInt(req.query.page)
    if (req.query.limit) pagination.limit = parseInt(req.query.limit)

    const result = await campaignService.getCampaignsByBrandId(
      brandId,
      userId,
      pagination
    )

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: result
    })
  } catch (error) {
    console.error('Error getting campaigns by brand:', error)

    if (error.message.includes('not authorized')) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.ACCESS_DENIED,
        err: 'Not authorized to view these campaigns'
      })
    }

    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: 'Failed to get brand campaigns'
    })
  }
}

/**
 * @memberof -CAMPAIGN-MANAGEMENT-module-
 * @name updateCampaign
 * @path {PUT} /api/campaigns/:campaignId
 * @description Update campaign details
 */
const updateCampaignValidation = {
  type: 'object',
  required: false,
  properties: {
    campaign_name: {
      type: 'string',
      required: false,
      minLength: 3,
      maxLength: 255
    },
    campaign_type: { type: 'string', required: false },
    status: { type: 'string', required: false },
    product_id: { type: 'string', required: false },
    description: { type: 'string', required: false, maxLength: 2000 },
    objectives: { type: 'string', required: false, maxLength: 1000 },
    target_audience: { type: 'object', required: false },
    budget: { type: 'number', required: false },
    currency: { type: 'string', required: false },
    start_date: { type: 'string', required: false },
    end_date: { type: 'string', required: false },
    requirements: { type: 'object', required: false },
    content_guidelines: { type: 'string', required: false, maxLength: 2000 },
    hashtags: { type: 'array', required: false },
    mention_requirements: { type: 'string', required: false, maxLength: 500 },
    approval_required: { type: 'boolean', required: false },
    selected_influencers: { type: 'array', required: false },
    performance_metrics: { type: 'object', required: false }
  }
}

const updateCampaign = async (req, res) => {
  try {
    const { campaignId } = req.params
    const userId = req.user.id
    const updateData = req.body

    // Validate campaign type if provided
    if (updateData.campaign_type) {
      const validCampaignTypes = [
        'sponsored_post',
        'brand_ambassador',
        'product_review',
        'event_coverage',
        'content_collaboration'
      ]
      if (!validCampaignTypes.includes(updateData.campaign_type)) {
        return res.sendJson({
          type: __constants.RESPONSE_MESSAGES.INVALID_REQUEST,
          err:
            'Invalid campaign type. Must be one of: ' +
            validCampaignTypes.join(', ')
        })
      }
    }

    // Validate status if provided
    if (updateData.status) {
      const validStatuses = [
        'draft',
        'active',
        'paused',
        'completed',
        'cancelled'
      ]
      if (!validStatuses.includes(updateData.status)) {
        return res.sendJson({
          type: __constants.RESPONSE_MESSAGES.INVALID_REQUEST,
          err: 'Invalid status. Must be one of: ' + validStatuses.join(', ')
        })
      }
    }

    const updatedCampaign = await campaignService.updateCampaign(
      campaignId,
      userId,
      updateData
    )

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        message: 'Campaign updated successfully',
        campaign: updatedCampaign
      }
    })
  } catch (error) {
    console.error('Error updating campaign:', error)

    if (error.message.includes('not authorized')) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.ACCESS_DENIED,
        err: 'Not authorized to update this campaign'
      })
    }

    if (error.message.includes('not found')) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.NO_RECORDS_FOUND,
        err: 'Campaign not found'
      })
    }

    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: error.message || 'Failed to update campaign'
    })
  }
}

/**
 * @memberof -CAMPAIGN-MANAGEMENT-module-
 * @name getCampaignRecommendations
 * @path {GET} /api/campaigns/:campaignId/recommendations
 * @description Get AI-powered influencer recommendations for campaign
 */
const getCampaignRecommendations = async (req, res) => {
  try {
    const { campaignId } = req.params
    const userId = req.user.id
    const { fresh = false, limit = 20 } = req.query

    const campaign = await campaignService.getCampaignById(
      campaignId,
      userId,
      'brand'
    )

    if (!campaign) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.NO_RECORDS_FOUND,
        err: 'Campaign not found'
      })
    }

    if (campaign.brand_owner_id !== userId) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.ACCESS_DENIED,
        err: 'Not authorized to view recommendations for this campaign'
      })
    }

    let recommendations

    if (fresh === 'true' || !campaign.ai_recommended_influencers) {
      // Generate fresh recommendations
      console.log(
        `Generating fresh recommendations for campaign: ${campaign.campaign_name}`
      )
      const result = await campaignService.regenerateInfluencerRecommendations(
        campaignId,
        userId
      )
      recommendations = result.recommendations
    } else {
      // Use existing recommendations
      recommendations = campaign.ai_recommended_influencers
    }

    // Apply limit if specified
    if (recommendations && recommendations.recommendations) {
      recommendations.recommendations = recommendations.recommendations.slice(
        0,
        parseInt(limit)
      )
    }

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        campaign_id: campaignId,
        campaign_name: campaign.campaign_name,
        recommendations: recommendations,
        generated_fresh: fresh === 'true',
        timestamp: new Date().toISOString()
      }
    })
  } catch (error) {
    console.error('Error getting campaign recommendations:', error)
    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: error.message || 'Failed to get influencer recommendations'
    })
  }
}

/**
 * @memberof -CAMPAIGN-MANAGEMENT-module-
 * @name regenerateRecommendations
 * @path {POST} /api/campaigns/:campaignId/regenerate-recommendations
 * @description Regenerate AI-powered influencer recommendations
 */
const regenerateRecommendations = async (req, res) => {
  try {
    const { campaignId } = req.params
    const userId = req.user.id

    const result = await campaignService.regenerateInfluencerRecommendations(
      campaignId,
      userId
    )

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        message: 'Influencer recommendations regenerated successfully',
        campaign_id: campaignId,
        recommendations: result.recommendations,
        updated_at: result.campaign.updated_at
      }
    })
  } catch (error) {
    console.error('Error regenerating recommendations:', error)

    if (error.message.includes('not authorized')) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.ACCESS_DENIED,
        err: 'Not authorized to update this campaign'
      })
    }

    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: error.message || 'Failed to regenerate recommendations'
    })
  }
}

/**
 * @memberof -CAMPAIGN-MANAGEMENT-module-
 * @name previewInfluencerMatch
 * @path {POST} /api/campaigns/preview-influencer-match
 * @description Preview influencer recommendations without creating campaign
 */
const previewInfluencerMatchValidation = {
  type: 'object',
  required: true,
  properties: {
    campaign_data: { type: 'object', required: true },
    brand_id: { type: 'string', required: true },
    product_id: { type: 'string', required: false },
    max_results: { type: 'number', required: false }
  }
}

const previewInfluencerMatch = async (req, res) => {
  try {
    const { campaign_data, brand_id, product_id, max_results = 15 } = req.body
    const userId = req.user.id

    // Verify brand ownership
    const brand = await brandService.getBrandById(brand_id)
    if (!brand) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.NO_RECORDS_FOUND,
        err: 'Brand not found'
      })
    }

    if (brand.user_id !== userId) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.ACCESS_DENIED,
        err: 'Not authorized to preview matches for this brand'
      })
    }

    // Get product data if specified
    let productData = null
    if (product_id) {
      const productService = require('../../services/products/productService')
      productData = await productService.getProductById(
        product_id,
        userId,
        'brand'
      )
    }

    console.log(`Previewing influencer matches for brand: ${brand.brand_name}`)

    const recommendations = await campaignService.getInfluencerRecommendations(
      campaign_data,
      brand,
      productData,
      { maxResults: max_results, includeScores: true }
    )

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        message: 'Influencer match preview generated successfully',
        preview: {
          total_matches: recommendations.total_found,
          recommendations:
            recommendations.recommendations?.slice(0, max_results) || [],
          search_strategy: {
            query_used: recommendations.search_query_used,
            filters_applied: recommendations.filters_applied
          },
          preview_note:
            'This is a preview. Create a campaign to save and manage these recommendations.'
        }
      }
    })
  } catch (error) {
    console.error('Error previewing influencer match:', error)
    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: error.message || 'Failed to preview influencer matches'
    })
  }
}

/**
 * @memberof -CAMPAIGN-MANAGEMENT-module-
 * @name deleteCampaign
 * @path {DELETE} /api/campaigns/:campaignId
 * @description Delete campaign (soft delete)
 */
const deleteCampaign = async (req, res) => {
  try {
    const { campaignId } = req.params
    const userId = req.user.id

    const result = await campaignService.deleteCampaign(campaignId, userId)

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        message: 'Campaign deleted successfully',
        deleted: result.deleted
      }
    })
  } catch (error) {
    console.error('Error deleting campaign:', error)
    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: error.message || 'Failed to delete campaign'
    })
  }
}

/**
 * @memberof -CAMPAIGN-MANAGEMENT-module-
 * @name getCampaignStats
 * @path {GET} /api/campaigns/stats
 * @description Get campaign statistics for current user
 */
const getCampaignStats = async (req, res) => {
  try {
    const userId = req.user.id
    const stats = await campaignService.getCampaignStats(userId)

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        statistics: stats
      }
    })
  } catch (error) {
    console.error('Error getting campaign stats:', error)
    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: 'Failed to get campaign statistics'
    })
  }
}

/**
 * ADMIN ONLY ENDPOINTS
 */

/**
 * @memberof -CAMPAIGN-MANAGEMENT-module-
 * @name getAllCampaigns
 * @path {GET} /api/campaigns/admin/all
 * @description Get all campaigns with filtering (Admin only)
 */
const getAllCampaignsValidation = {
  type: 'object',
  required: false,
  properties: {
    page: { type: 'string', required: false },
    limit: { type: 'string', required: false },
    status: { type: 'string', required: false },
    campaign_type: { type: 'string', required: false },
    brand_id: { type: 'string', required: false }
  }
}

const getAllCampaigns = async (req, res) => {
  try {
    // This would need a new method in campaignService
    // For now, return placeholder response
    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        campaigns: [],
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          pages: 0
        },
        note: 'Admin campaign listing - implementation pending'
      }
    })
  } catch (error) {
    console.error('Error getting all campaigns:', error)
    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: 'Failed to get campaigns'
    })
  }
}

/**
 * @memberof -CAMPAIGN-MANAGEMENT-module-
 * @name getGlobalCampaignStats
 * @path {GET} /api/campaigns/admin/stats
 * @description Get global campaign statistics (Admin only)
 */
const getGlobalCampaignStats = async (req, res) => {
  try {
    const stats = await campaignService.getCampaignStats() // No userId = global stats

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        statistics: stats
      }
    })
  } catch (error) {
    console.error('Error getting global campaign stats:', error)
    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: 'Failed to get global campaign statistics'
    })
  }
}

// Helper function to get campaign ownership for middleware
const getCampaignOwnerId = async (req) => {
  const campaignId = req.params.campaignId
  const campaign = await campaignService.getCampaignById(campaignId)
  return campaign ? campaign.brand_owner_id : null
}

// Apply authentication and route handlers
router.use(jwtAuth.securityHeaders())

// Public campaign endpoints (require authentication)
router.post(
  '/create',
  jwtAuth.requireBrand(),
  jwtAuth.auditLog('CREATE_CAMPAIGN'),
  (req, res, next) =>
    validationOfAPI(req, res, next, createCampaignValidation, 'body'),
  createCampaign
)

router.get(
  '/my-campaigns',
  jwtAuth.requireBrand(),
  (req, res, next) =>
    validationOfAPI(req, res, next, getMyCampaignsValidation, 'query'),
  getMyCampaigns
)

router.get('/stats', jwtAuth.requireBrand(), getCampaignStats)

router.post(
  '/preview-influencer-match',
  jwtAuth.requireBrand(),
  jwtAuth.rateLimit({ maxRequests: 10, windowMinutes: 60 }),
  (req, res, next) =>
    validationOfAPI(req, res, next, previewInfluencerMatchValidation, 'body'),
  previewInfluencerMatch
)

router.get(
  '/brand/:brandId',
  jwtAuth.requireAuth(),
  (req, res, next) =>
    validationOfAPI(req, res, next, getCampaignsByBrandValidation, 'params'),
  getCampaignsByBrand
)

router.get(
  '/:campaignId',
  jwtAuth.requireAuth(),
  (req, res, next) =>
    validationOfAPI(req, res, next, getCampaignByIdValidation, 'params'),
  getCampaignById
)

router.put(
  '/:campaignId',
  jwtAuth.requireBrand(),
  jwtAuth.requireOwnership(getCampaignOwnerId),
  jwtAuth.auditLog('UPDATE_CAMPAIGN'),
  (req, res, next) =>
    validationOfAPI(req, res, next, updateCampaignValidation, 'body'),
  updateCampaign
)

router.get(
  '/:campaignId/recommendations',
  jwtAuth.requireBrand(),
  jwtAuth.requireOwnership(getCampaignOwnerId),
  getCampaignRecommendations
)

router.post(
  '/:campaignId/regenerate-recommendations',
  jwtAuth.requireBrand(),
  jwtAuth.requireOwnership(getCampaignOwnerId),
  jwtAuth.rateLimit({ maxRequests: 5, windowMinutes: 60 }),
  regenerateRecommendations
)

router.delete(
  '/:campaignId',
  jwtAuth.requireBrand(),
  jwtAuth.requireOwnership(getCampaignOwnerId),
  jwtAuth.auditLog('DELETE_CAMPAIGN'),
  deleteCampaign
)

// Admin only endpoints
router.get(
  '/admin/all',
  jwtAuth.requireAdmin(),
  (req, res, next) =>
    validationOfAPI(req, res, next, getAllCampaignsValidation, 'query'),
  getAllCampaigns
)

router.get('/admin/stats', jwtAuth.requireAdmin(), getGlobalCampaignStats)

module.exports = router
