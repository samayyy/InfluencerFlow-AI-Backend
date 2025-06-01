const express = require('express')
const router = express.Router()
const __constants = require('../../config/constants')
const validationOfAPI = require('../../middlewares/validation')
const creatorService = require('../../services/creators/creatorService')

const validationSchema = {
  type: 'object',
  required: true,
  properties: {
    query: { type: 'string', required: true, minLength: 2 },
    niche: { type: 'string', required: false },
    tier: { type: 'string', required: false },
    page: { type: 'string', required: false },
    limit: { type: 'string', required: false }
  }
}

const validation = (req, res, next) => {
  return validationOfAPI(req, res, next, validationSchema, 'query')
}

const searchCreators = async (req, res) => {
  try {
    const { query } = req.query

    const filters = {}
    if (req.query.niche) filters.niche = req.query.niche
    if (req.query.tier) filters.tier = req.query.tier

    const pagination = {}
    if (req.query.page) pagination.page = parseInt(req.query.page)
    if (req.query.limit) pagination.limit = parseInt(req.query.limit)

    const creators = await creatorService.searchCreators(query, filters, pagination)

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: creators
    })
  } catch (err) {
    console.error('Error in searchCreators:', err)
    return res.sendJson({
      type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: err.message || err
    })
  }
}

router.get('/searchCreators', validation, searchCreators)

module.exports = router
