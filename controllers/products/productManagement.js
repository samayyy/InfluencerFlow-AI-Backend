// controllers/products/productManagement.js
const express = require('express')
const router = express.Router()
const __constants = require('../../config/constants')
const validationOfAPI = require('../../middlewares/validation')
const jwtAuth = require('../../middlewares/auth/jwtAuthMiddleware')
const productService = require('../../services/products/productService')
const brandService = require('../../services/brands/brandService')

/**
 * @namespace -PRODUCT-MANAGEMENT-MODULE-
 * @description API's related to product management with AI-powered analysis.
 */

/**
 * @memberof -PRODUCT-MANAGEMENT-module-
 * @name createProduct
 * @path {POST} /api/products/create
 * @description Create a new product with optional AI-powered analysis
 */
const createProductValidation = {
  type: 'object',
  required: true,
  properties: {
    brand_id: { type: 'string', required: true },
    product_name: {
      type: 'string',
      required: true,
      minLength: 2,
      maxLength: 255
    },
    product_url: { type: 'string', required: false, minLength: 4 },
    category: { type: 'string', required: false, maxLength: 100 },
    subcategory: { type: 'string', required: false, maxLength: 100 },
    price: { type: 'number', required: false },
    currency: { type: 'string', required: false },
    description: { type: 'string', required: false, maxLength: 2000 },
    custom_overview: { type: 'string', required: false, maxLength: 2000 },
    product_images: { type: 'array', required: false },
    key_features: { type: 'array', required: false },
    target_audience: { type: 'object', required: false },
    launch_date: { type: 'string', required: false }
  }
}

const createProduct = async (req, res) => {
  try {
    const userId = req.user.id
    const productData = req.body
    const brandId = productData.brand_id

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
        err: 'Not authorized to add products to this brand'
      })
    }

    console.log(
      `Creating product for brand ${brandId}: ${productData.product_name}`
    )

    const product = await productService.createProduct(
      brandId,
      userId,
      productData
    )

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        message: 'Product created successfully',
        product: {
          id: product.id,
          product_name: product.product_name,
          product_slug: product.product_slug,
          product_url: product.product_url,
          category: product.category,
          price: product.price,
          currency: product.currency,
          ai_analysis_available: product.ai_analysis_available,
          created_at: product.created_at
        },
        ai_overview: product.ai_generated_overview
          ? JSON.parse(product.ai_generated_overview)
          : null,
        scraped_data_available: !!product.scraped_data
      }
    })
  } catch (error) {
    console.error('Error creating product:', error)
    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: error.message || 'Failed to create product'
    })
  }
}

/**
 * @memberof -PRODUCT-MANAGEMENT-module-
 * @name getProductById
 * @path {GET} /api/products/:productId
 * @description Get specific product by ID
 */
const getProductByIdValidation = {
  type: 'object',
  required: true,
  properties: {
    productId: { type: 'string', required: true }
  }
}

const getProductById = async (req, res) => {
  try {
    const { productId } = req.params
    const userId = req.user.id
    const userRole = req.user.role

    const product = await productService.getProductById(
      productId,
      userId,
      userRole
    )

    if (!product) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.NO_RECORDS_FOUND,
        err: 'Product not found'
      })
    }

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        product: product
      }
    })
  } catch (error) {
    console.error('Error getting product by ID:', error)
    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: 'Failed to get product details'
    })
  }
}

/**
 * @memberof -PRODUCT-MANAGEMENT-module-
 * @name getMyProducts
 * @path {GET} /api/products/my-products
 * @description Get current user's products
 */
const getMyProductsValidation = {
  type: 'object',
  required: false,
  properties: {
    page: { type: 'string', required: false },
    limit: { type: 'string', required: false }
  }
}

const getMyProducts = async (req, res) => {
  try {
    const userId = req.user.id
    const pagination = {}

    if (req.query.page) pagination.page = parseInt(req.query.page)
    if (req.query.limit) pagination.limit = parseInt(req.query.limit)

    const result = await productService.getUserProducts(userId, pagination)

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: result
    })
  } catch (error) {
    console.error('Error getting user products:', error)
    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: 'Failed to get products'
    })
  }
}

/**
 * @memberof -PRODUCT-MANAGEMENT-module-
 * @name getProductsByBrand
 * @path {GET} /api/products/brand/:brandId
 * @description Get products by brand ID
 */
const getProductsByBrandValidation = {
  type: 'object',
  required: true,
  properties: {
    brandId: { type: 'string', required: true }
  }
}

const getProductsByBrand = async (req, res) => {
  try {
    const { brandId } = req.params
    const userId = req.user.id
    const userRole = req.user.role

    const pagination = {}
    if (req.query.page) pagination.page = parseInt(req.query.page)
    if (req.query.limit) pagination.limit = parseInt(req.query.limit)

    // Check if user can access this brand's products
    const brand = await brandService.getBrandById(brandId)
    if (!brand) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.NO_RECORDS_FOUND,
        err: 'Brand not found'
      })
    }

    // Only brand owners and admins can see all product details
    if (brand.user_id !== userId && userRole !== 'admin') {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.ACCESS_DENIED,
        err: 'Not authorized to view these products'
      })
    }

    const result = await productService.getProductsByBrandId(
      brandId,
      pagination
    )

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: result
    })
  } catch (error) {
    console.error('Error getting products by brand:', error)
    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: 'Failed to get brand products'
    })
  }
}

/**
 * @memberof -PRODUCT-MANAGEMENT-module-
 * @name updateProduct
 * @path {PUT} /api/products/:productId
 * @description Update product details
 */
const updateProductValidation = {
  type: 'object',
  required: false,
  properties: {
    product_name: {
      type: 'string',
      required: false,
      minLength: 2,
      maxLength: 255
    },
    product_url: { type: 'string', required: false, minLength: 4 },
    category: { type: 'string', required: false, maxLength: 100 },
    subcategory: { type: 'string', required: false, maxLength: 100 },
    price: { type: 'number', required: false },
    currency: { type: 'string', required: false },
    description: { type: 'string', required: false, maxLength: 2000 },
    custom_overview: { type: 'string', required: false, maxLength: 2000 },
    product_images: { type: 'array', required: false },
    key_features: { type: 'array', required: false },
    target_audience: { type: 'object', required: false },
    launch_date: { type: 'string', required: false }
  }
}

const updateProduct = async (req, res) => {
  try {
    const { productId } = req.params
    const userId = req.user.id
    const updateData = req.body

    const updatedProduct = await productService.updateProduct(
      productId,
      userId,
      updateData
    )

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        message: 'Product updated successfully',
        product: updatedProduct
      }
    })
  } catch (error) {
    console.error('Error updating product:', error)

    if (error.message.includes('not authorized')) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.ACCESS_DENIED,
        err: 'Not authorized to update this product'
      })
    }

    if (error.message.includes('not found')) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.NO_RECORDS_FOUND,
        err: 'Product not found'
      })
    }

    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: error.message || 'Failed to update product'
    })
  }
}

/**
 * @memberof -PRODUCT-MANAGEMENT-module-
 * @name analyzeProductUrl
 * @path {POST} /api/products/analyze-url
 * @description Analyze a product URL and generate AI-powered overview
 */
const analyzeProductUrlValidation = {
  type: 'object',
  required: true,
  properties: {
    product_url: { type: 'string', required: true, minLength: 4 },
    product_name: { type: 'string', required: false },
    category: { type: 'string', required: false },
    price: { type: 'number', required: false },
    description: { type: 'string', required: false },
    key_features: { type: 'array', required: false }
  }
}

const analyzeProductUrl = async (req, res) => {
  try {
    const productData = req.body

    console.log(`Analyzing product URL: ${productData.product_url}`)

    // Import the web scraping service and generate overview
    const webScrapingService = require('../../services/ai/webScrapingService')

    // Scrape product URL
    const scrapedData = await webScrapingService.scrapeWebsite(
      productData.product_url
    )

    // Generate AI overview
    const aiOverview = await productService.generateProductOverview(
      productData,
      scrapedData
    )

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        message: 'Product URL analysis completed',
        ai_overview: aiOverview,
        scraped_data: {
          title: scrapedData.title,
          description: scrapedData.description,
          headings: scrapedData.headings?.slice(0, 5),
          contact_info: scrapedData.contactInfo,
          cached: scrapedData.cached || false
        },
        confidence_score: aiOverview.confidence_score,
        analysis_timestamp: new Date().toISOString()
      }
    })
  } catch (error) {
    console.error('Error analyzing product URL:', error)
    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.FAILED,
      err: error.message || 'Product URL analysis failed'
    })
  }
}

/**
 * @memberof -PRODUCT-MANAGEMENT-module-
 * @name regenerateProductOverview
 * @path {POST} /api/products/:productId/regenerate-ai
 * @description Regenerate AI overview for existing product
 */
const regenerateProductOverview = async (req, res) => {
  try {
    const { productId } = req.params
    const userId = req.user.id

    const result = await productService.regenerateProductOverview(
      productId,
      userId
    )

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        message: 'Product AI overview regenerated successfully',
        ai_overview: result.ai_overview,
        updated_at: result.product.updated_at,
        scraped_data_available: !!result.scraped_data
      }
    })
  } catch (error) {
    console.error('Error regenerating product overview:', error)

    if (error.message.includes('not authorized')) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.ACCESS_DENIED,
        err: 'Not authorized to update this product'
      })
    }

    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: error.message || 'Failed to regenerate product overview'
    })
  }
}

/**
 * @memberof -PRODUCT-MANAGEMENT-module-
 * @name deleteProduct
 * @path {DELETE} /api/products/:productId
 * @description Delete product (soft delete)
 */
const deleteProduct = async (req, res) => {
  try {
    const { productId } = req.params
    const userId = req.user.id

    const result = await productService.deleteProduct(productId, userId)

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        message: 'Product deleted successfully',
        deleted: result.deleted
      }
    })
  } catch (error) {
    console.error('Error deleting product:', error)
    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: error.message || 'Failed to delete product'
    })
  }
}

/**
 * @memberof -PRODUCT-MANAGEMENT-module-
 * @name searchProducts
 * @path {GET} /api/products/search
 * @description Search products across all brands
 */
const searchProductsValidation = {
  type: 'object',
  required: true,
  properties: {
    q: { type: 'string', required: true, minLength: 2 },
    category: { type: 'string', required: false },
    min_price: { type: 'string', required: false },
    max_price: { type: 'string', required: false },
    brand_id: { type: 'string', required: false },
    page: { type: 'string', required: false },
    limit: { type: 'string', required: false }
  }
}

const searchProducts = async (req, res) => {
  try {
    const { q: searchTerm } = req.query

    const filters = {}
    if (req.query.category) filters.category = req.query.category
    if (req.query.min_price) { filters.min_price = parseFloat(req.query.min_price) }
    if (req.query.max_price) { filters.max_price = parseFloat(req.query.max_price) }
    if (req.query.brand_id) filters.brand_id = req.query.brand_id

    const pagination = {}
    if (req.query.page) pagination.page = parseInt(req.query.page)
    if (req.query.limit) pagination.limit = parseInt(req.query.limit)

    const result = await productService.searchProducts(
      searchTerm,
      filters,
      pagination
    )

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: result
    })
  } catch (error) {
    console.error('Error searching products:', error)
    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: 'Product search failed'
    })
  }
}

/**
 * @memberof -PRODUCT-MANAGEMENT-module-
 * @name getProductStats
 * @path {GET} /api/products/stats
 * @description Get product statistics for current user
 */
const getProductStats = async (req, res) => {
  try {
    const userId = req.user.id
    const stats = await productService.getProductStats(userId)

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        statistics: stats
      }
    })
  } catch (error) {
    console.error('Error getting product stats:', error)
    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: 'Failed to get product statistics'
    })
  }
}

/**
 * ADMIN ONLY ENDPOINTS
 */

/**
 * @memberof -PRODUCT-MANAGEMENT-module-
 * @name getAllProducts
 * @path {GET} /api/products/admin/all
 * @description Get all products with filtering (Admin only)
 */
const getAllProductsValidation = {
  type: 'object',
  required: false,
  properties: {
    page: { type: 'string', required: false },
    limit: { type: 'string', required: false },
    category: { type: 'string', required: false },
    brand_id: { type: 'string', required: false },
    search: { type: 'string', required: false }
  }
}

const getAllProducts = async (req, res) => {
  try {
    const { search } = req.query

    const filters = {}
    if (req.query.category) filters.category = req.query.category
    if (req.query.brand_id) filters.brand_id = req.query.brand_id

    const pagination = {}
    if (req.query.page) pagination.page = parseInt(req.query.page)
    if (req.query.limit) pagination.limit = parseInt(req.query.limit)

    let result
    if (search) {
      result = await productService.searchProducts(search, filters, pagination)
    } else {
      // This would need a new method in productService to get all products
      result = await productService.searchProducts('', filters, pagination)
    }

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: result
    })
  } catch (error) {
    console.error('Error getting all products:', error)
    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: 'Failed to get products'
    })
  }
}

/**
 * @memberof -PRODUCT-MANAGEMENT-module-
 * @name getGlobalProductStats
 * @path {GET} /api/products/admin/stats
 * @description Get global product statistics (Admin only)
 */
const getGlobalProductStats = async (req, res) => {
  try {
    const stats = await productService.getProductStats() // No userId = global stats

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        statistics: stats
      }
    })
  } catch (error) {
    console.error('Error getting global product stats:', error)
    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: 'Failed to get global product statistics'
    })
  }
}

// Helper function to get product ownership for middleware
const getProductOwnerId = async (req) => {
  const productId = req.params.productId
  const product = await productService.getProductById(productId)
  return product ? product.brand_owner_id : null
}

// Apply authentication and route handlers
router.use(jwtAuth.securityHeaders())

// Public product endpoints (require authentication)
router.post(
  '/create',
  jwtAuth.requireBrand(),
  jwtAuth.auditLog('CREATE_PRODUCT'),
  (req, res, next) =>
    validationOfAPI(req, res, next, createProductValidation, 'body'),
  createProduct
)

router.get(
  '/my-products',
  jwtAuth.requireBrand(),
  (req, res, next) =>
    validationOfAPI(req, res, next, getMyProductsValidation, 'query'),
  getMyProducts
)

router.get(
  '/search',
  jwtAuth.requireAuth(),
  (req, res, next) =>
    validationOfAPI(req, res, next, searchProductsValidation, 'query'),
  searchProducts
)

router.get('/stats', jwtAuth.requireBrand(), getProductStats)

router.get(
  '/brand/:brandId',
  jwtAuth.requireAuth(),
  (req, res, next) =>
    validationOfAPI(req, res, next, getProductsByBrandValidation, 'params'),
  getProductsByBrand
)

router.get(
  '/:productId',
  jwtAuth.requireAuth(),
  (req, res, next) =>
    validationOfAPI(req, res, next, getProductByIdValidation, 'params'),
  getProductById
)

router.put(
  '/:productId',
  jwtAuth.requireBrand(),
  jwtAuth.requireOwnership(getProductOwnerId),
  jwtAuth.auditLog('UPDATE_PRODUCT'),
  (req, res, next) =>
    validationOfAPI(req, res, next, updateProductValidation, 'body'),
  updateProduct
)

router.post(
  '/analyze-url',
  jwtAuth.requireBrand(),
  jwtAuth.rateLimit({ maxRequests: 10, windowMinutes: 60 }),
  (req, res, next) =>
    validationOfAPI(req, res, next, analyzeProductUrlValidation, 'body'),
  analyzeProductUrl
)

router.post(
  '/:productId/regenerate-ai',
  jwtAuth.requireBrand(),
  jwtAuth.requireOwnership(getProductOwnerId),
  jwtAuth.rateLimit({ maxRequests: 5, windowMinutes: 60 }),
  regenerateProductOverview
)

router.delete(
  '/:productId',
  jwtAuth.requireBrand(),
  jwtAuth.requireOwnership(getProductOwnerId),
  jwtAuth.auditLog('DELETE_PRODUCT'),
  deleteProduct
)

// Admin only endpoints
router.get(
  '/admin/all',
  jwtAuth.requireAdmin(),
  (req, res, next) =>
    validationOfAPI(req, res, next, getAllProductsValidation, 'query'),
  getAllProducts
)

router.get('/admin/stats', jwtAuth.requireAdmin(), getGlobalProductStats)

module.exports = router
