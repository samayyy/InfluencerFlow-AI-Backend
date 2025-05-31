const express = require("express");
const router = express.Router();
const __constants = require("../../config/constants");
const validationOfAPI = require("../../middlewares/validation");
const creatorService = require("../../services/creators/creatorService");

/**
 * @namespace -CREATORS-MODULE-
 * @description API's related to CREATORS module.
 */

/**
 * @memberof -CREATORS-module-
 * @name getAllCreators
 * @path {GET} /api/creators/getAllCreators
 * @description Get all creators with optional filtering and pagination
 * @response {string} ContentType=application/json - Response content type.
 * @response {object} data - Array of creators with pagination info
 * @code {200} if successful
 */

const validationSchema = {
  type: "object",
  required: false,
  properties: {
    page: { type: "string", required: false },
    limit: { type: "string", required: false },
    niche: { type: "string", required: false },
    tier: { type: "string", required: false },
    platform: { type: "string", required: false },
    min_followers: { type: "string", required: false },
    max_followers: { type: "string", required: false },
    min_engagement: { type: "string", required: false },
  },
};

const validation = (req, res, next) => {
  return validationOfAPI(req, res, next, validationSchema, "query");
};

const getAllCreators = async (req, res) => {
  try {
    const filters = {};
    const pagination = {};

    // Extract filters from query params
    if (req.query.niche) filters.niche = req.query.niche;
    if (req.query.tier) filters.tier = req.query.tier;
    if (req.query.platform) filters.platform = req.query.platform;
    if (req.query.min_followers)
      filters.min_followers = parseInt(req.query.min_followers);
    if (req.query.max_followers)
      filters.max_followers = parseInt(req.query.max_followers);
    if (req.query.min_engagement)
      filters.min_engagement = parseFloat(req.query.min_engagement);

    // Extract pagination
    if (req.query.page) pagination.page = parseInt(req.query.page);
    if (req.query.limit) pagination.limit = parseInt(req.query.limit);

    const result = await creatorService.getAllCreators(filters, pagination);

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: result,
    });
  } catch (err) {
    console.error("Error in getAllCreators:", err);
    return res.sendJson({
      type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: err.message || err,
    });
  }
};

router.get("/getAllCreators", validation, getAllCreators);

module.exports = router;
