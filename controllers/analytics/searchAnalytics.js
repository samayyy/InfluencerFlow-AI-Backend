// controllers/analytics/searchAnalytics.js
const express = require('express')
const router = express.Router()
const __constants = require('../../config/constants')
const validationOfAPI = require('../../middlewares/validation')
const searchAnalyticsService = require('../../services/analytics/searchAnalyticsService')

/**
 * @namespace -SEARCH-ANALYTICS-MODULE-
 * @description API's for search analytics and performance monitoring.
 */

/**
 * @memberof -SEARCH-ANALYTICS-module-
 * @name getSearchAnalytics
 * @path {GET} /api/analytics/search
 * @description Get search analytics for a date range
 * @response {string} ContentType=application/json - Response content type.
 * @response {object} data - Analytics data with metrics and trends
 * @code {200} if successful
 */

const analyticsValidationSchema = {
  type: 'object',
  required: false,
  properties: {
    start_date: { type: 'string', required: false },
    end_date: { type: 'string', required: false },
    days: { type: 'string', required: false }
  }
}

const analyticsValidation = (req, res, next) => {
  return validationOfAPI(req, res, next, analyticsValidationSchema, 'query')
}

const getSearchAnalytics = async (req, res) => {
  try {
    const { start_date, end_date, days = '7' } = req.query

    let startDate, endDate

    if (start_date) {
      startDate = start_date
      endDate = end_date || start_date
    } else {
      // Default to last N days
      const daysBack = parseInt(days)
      endDate = new Date().toISOString().split('T')[0]
      startDate = new Date(Date.now() - (daysBack - 1) * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    }

    const analytics = await searchAnalyticsService.getAnalytics(startDate, endDate)

    if (analytics.error) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.FAILED,
        err: analytics.error
      })
    }

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: analytics
    })
  } catch (err) {
    console.error('Error in getSearchAnalytics:', err)
    return res.sendJson({
      type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: err.message || err
    })
  }
}

/**
 * @memberof -SEARCH-ANALYTICS-module-
 * @name getRealTimeStats
 * @path {GET} /api/analytics/search/realtime
 * @description Get real-time search statistics
 * @response {string} ContentType=application/json - Response content type.
 * @response {object} data - Real-time stats and system status
 * @code {200} if successful
 */

const getRealTimeStats = async (req, res) => {
  try {
    const stats = await searchAnalyticsService.getRealTimeStats()

    if (stats.error) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.FAILED,
        err: stats.error
      })
    }

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: stats
    })
  } catch (err) {
    console.error('Error in getRealTimeStats:', err)
    return res.sendJson({
      type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: err.message || err
    })
  }
}

/**
 * @memberof -SEARCH-ANALYTICS-module-
 * @name getPerformanceReport
 * @path {GET} /api/analytics/search/report
 * @description Generate search performance report
 * @response {string} ContentType=application/json - Response content type.
 * @response {object} data - Performance report with trends and recommendations
 * @code {200} if successful
 */

const reportValidationSchema = {
  type: 'object',
  required: false,
  properties: {
    days: { type: 'string', required: false }
  }
}

const reportValidation = (req, res, next) => {
  return validationOfAPI(req, res, next, reportValidationSchema, 'query')
}

const getPerformanceReport = async (req, res) => {
  try {
    const { days = '7' } = req.query

    const report = await searchAnalyticsService.generatePerformanceReport(parseInt(days))

    if (report.error) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.FAILED,
        err: report.error
      })
    }

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: report
    })
  } catch (err) {
    console.error('Error in getPerformanceReport:', err)
    return res.sendJson({
      type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: err.message || err
    })
  }
}

/**
 * @memberof -SEARCH-ANALYTICS-module-
 * @name logResultInteraction
 * @path {POST} /api/analytics/search/interaction
 * @description Log user interaction with search results for relevance feedback
 * @response {string} ContentType=application/json - Response content type.
 * @response {object} data - Confirmation of logged interaction
 * @code {200} if successful
 */

const interactionValidationSchema = {
  type: 'object',
  required: true,
  properties: {
    search_id: { type: 'string', required: true },
    creator_id: { type: 'string', required: true },
    type: { type: 'string', required: true },
    rank: { type: 'number', required: false },
    session_id: { type: 'string', required: false }
  }
}

const interactionValidation = (req, res, next) => {
  return validationOfAPI(req, res, next, interactionValidationSchema, 'body')
}

const logResultInteraction = async (req, res) => {
  try {
    const interactionData = {
      ...req.body,
      session_id: req.body.session_id || req.ip,
      timestamp: new Date()
    }

    await searchAnalyticsService.logResultInteraction(interactionData)

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        message: 'Interaction logged successfully',
        interaction_id: `int_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      }
    })
  } catch (err) {
    console.error('Error in logResultInteraction:', err)
    return res.sendJson({
      type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: err.message || err
    })
  }
}

/**
 * @memberof -SEARCH-ANALYTICS-module-
 * @name getSearchTrends
 * @path {GET} /api/analytics/search/trends
 * @description Get search trends and popular queries
 * @response {string} ContentType=application/json - Response content type.
 * @response {object} data - Search trends and popular query patterns
 * @code {200} if successful
 */

const trendsValidationSchema = {
  type: 'object',
  required: false,
  properties: {
    period: { type: 'string', required: false }, // 'today', 'week', 'month'
    limit: { type: 'string', required: false }
  }
}

const trendsValidation = (req, res, next) => {
  return validationOfAPI(req, res, next, trendsValidationSchema, 'query')
}

const getSearchTrends = async (req, res) => {
  try {
    const { period = 'week', limit = '10' } = req.query

    // This would be implemented in the analytics service
    const trends = {
      period,
      popular_queries: [
        { query_pattern: 'tech_gaming creators', count: 45, avg_results: 12 },
        { query_pattern: 'beauty_fashion under $500', count: 32, avg_results: 8 },
        { query_pattern: 'fitness influencers', count: 28, avg_results: 15 },
        { query_pattern: 'travel bloggers', count: 22, avg_results: 10 },
        { query_pattern: 'food creators', count: 18, avg_results: 14 }
      ].slice(0, parseInt(limit)),
      trending_niches: ['tech_gaming', 'beauty_fashion', 'fitness_health'],
      peak_search_times: ['14:00-16:00', '19:00-21:00'],
      generated_at: new Date().toISOString()
    }

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: trends
    })
  } catch (err) {
    console.error('Error in getSearchTrends:', err)
    return res.sendJson({
      type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: err.message || err
    })
  }
}

// Route definitions
router.get('/search', analyticsValidation, getSearchAnalytics)
router.get('/search/realtime', getRealTimeStats)
router.get('/search/report', reportValidation, getPerformanceReport)
router.get('/search/trends', trendsValidation, getSearchTrends)
router.post('/search/interaction', interactionValidation, logResultInteraction)

module.exports = router
