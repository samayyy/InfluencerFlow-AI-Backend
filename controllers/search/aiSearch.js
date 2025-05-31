// controllers/search/aiSearch.js
const express = require("express");
const router = express.Router();
const __constants = require("../../config/constants");
const validationOfAPI = require("../../middlewares/validation");
const aiSearchOrchestrator = require("../../services/search/aiSearchOrchestrator");

/**
 * @namespace -AI-SEARCH-MODULE-
 * @description API's related to AI-powered creator search.
 */

/**
 * @memberof -AI-SEARCH-module-
 * @name aiSearch
 * @path {POST} /api/search/aiSearch
 * @description AI-powered natural language search for creators
 * @response {string} ContentType=application/json - Response content type.
 * @response {object} data - Search results with metadata
 * @code {200} if successful
 */

const aiSearchValidationSchema = {
  type: "object",
  required: true,
  properties: {
    query: { type: "string", required: true, minLength: 2 },
    filters: { type: "object", required: false },
    max_results: { type: "number", required: false },
    use_hybrid_search: { type: "boolean", required: false },
    include_metadata: { type: "boolean", required: false },
  },
};

const aiSearchValidation = (req, res, next) => {
  return validationOfAPI(req, res, next, aiSearchValidationSchema, "body");
};

const aiSearch = async (req, res) => {
  try {
    const {
      query,
      filters = {},
      max_results = 20,
      use_hybrid_search = true,
      include_metadata = true,
    } = req.body;

    // Additional validation
    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.INVALID_REQUEST,
        err: "Query is required and must be a non-empty string",
      });
    }

    console.log(
      `🔍 AI Search request: "${query.substring(0, 100)}${
        query.length > 100 ? "..." : ""
      }"`
    );

    const searchOptions = {
      filters: filters || {},
      maxResults: Math.min(max_results, 50), // Cap at 50 results
      useHybridSearch: use_hybrid_search,
      includeMetadata: include_metadata,
      user_agent: req.get("User-Agent"),
      ip_address: req.ip,
      session_id: req.sessionID || req.ip,
    };

    const searchResults = await aiSearchOrchestrator.search(
      query,
      searchOptions
    );

    if (!searchResults) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
        err: "Search returned no response",
      });
    }

    if (!searchResults.success) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.FAILED,
        err: searchResults.errors || [searchResults.error],
        data: {
          suggestions: searchResults.suggestions,
          fallback_suggestion: searchResults.fallback_suggestion,
        },
      });
    }

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        results: searchResults.results || [],
        metadata: searchResults.metadata || {},
        suggestions: searchResults.suggestions || [],
        search_id: `search_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`,
      },
    });
  } catch (err) {
    console.error("Error in aiSearch:", err);
    return res.sendJson({
      type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: err.message || err,
    });
  }
};

/**
 * @memberof -AI-SEARCH-module-
 * @name getSearchSuggestions
 * @path {GET} /api/search/suggestions
 * @description Get AI-powered search suggestions based on partial query
 */

const suggestionsValidationSchema = {
  type: "object",
  required: false,
  properties: {
    q: { type: "string", required: true, minLength: 1 },
    filters: { type: "string", required: false }, // JSON string
    limit: { type: "string", required: false },
  },
};

const suggestionsValidation = (req, res, next) => {
  return validationOfAPI(req, res, next, suggestionsValidationSchema, "query");
};

const getSearchSuggestions = async (req, res) => {
  try {
    const { q, filters: filtersStr, limit = "8" } = req.query;

    let filters = {};
    if (filtersStr) {
      try {
        filters = JSON.parse(filtersStr);
      } catch (e) {
        console.warn("Invalid filters JSON:", filtersStr);
      }
    }

    const suggestions = await aiSearchOrchestrator.getSearchSuggestions(q, {
      filters,
      maxSuggestions: parseInt(limit),
    });

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: suggestions,
    });
  } catch (err) {
    console.error("Error in getSearchSuggestions:", err);
    return res.sendJson({
      type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: err.message || err,
    });
  }
};

/**
 * @memberof -AI-SEARCH-module-
 * @name advancedSearch
 * @path {POST} /api/search/advanced
 * @description Advanced multi-criteria search with specific focus areas
 */

const advancedSearchValidationSchema = {
  type: "object",
  required: true,
  properties: {
    content_focus: { type: "string", required: false },
    audience_focus: { type: "string", required: false },
    brand_focus: { type: "string", required: false },
    budget_range: { type: "object", required: false },
    performance_metrics: { type: "object", required: false },
    filters: { type: "object", required: false },
    max_results: { type: "number", required: false },
  },
};

const advancedSearchValidation = (req, res, next) => {
  return validationOfAPI(
    req,
    res,
    next,
    advancedSearchValidationSchema,
    "body"
  );
};

const advancedSearch = async (req, res) => {
  try {
    const searchCriteria = req.body;

    console.log(`🎯 Advanced search request:`, Object.keys(searchCriteria));

    const results = await aiSearchOrchestrator.advancedSearch(searchCriteria, {
      filters: searchCriteria.filters || {},
    });

    if (!results.success) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.FAILED,
        err: results.error,
      });
    }

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: results,
    });
  } catch (err) {
    console.error("Error in advancedSearch:", err);
    return res.sendJson({
      type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: err.message || err,
    });
  }
};

/**
 * @memberof -AI-SEARCH-module-
 * @name findSimilarCreators
 * @path {GET} /api/search/similar/:creatorId
 * @description Find creators similar to a specific creator
 */

const similarValidationSchema = {
  type: "object",
  required: true,
  properties: {
    creatorId: { type: "string", required: true },
  },
};

const similarValidation = (req, res, next) => {
  return validationOfAPI(req, res, next, similarValidationSchema, "params");
};

const findSimilarCreators = async (req, res) => {
  try {
    const { creatorId } = req.params;
    const {
      limit = "10",
      filters: filtersStr = "{}",
      include_original = "false",
    } = req.query;

    let filters = {};
    try {
      filters = JSON.parse(filtersStr);
    } catch (e) {
      console.warn("Invalid filters JSON:", filtersStr);
    }

    console.log(`👥 Finding creators similar to ID: ${creatorId}`);

    // Use the vector search service directly for similarity search
    const vectorSearchService = require("../../services/search/vectorSearchService");
    await vectorSearchService.initialize();

    const results = await vectorSearchService.findSimilarCreators(creatorId, {
      topK: parseInt(limit),
      filters,
      includeOriginal: include_original === "true",
    });

    // Enrich with creator data
    const aiSearchOrchestrator = require("../../services/search/aiSearchOrchestrator");
    const enrichedResults =
      await aiSearchOrchestrator.enrichResultsWithCreatorData(
        results.results,
        parseInt(limit)
      );

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        results: enrichedResults,
        reference_creator_id: creatorId,
        total_matches: results.total_matches,
        search_type: "similarity",
      },
    });
  } catch (err) {
    console.error("Error in findSimilarCreators:", err);
    return res.sendJson({
      type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: err.message || err,
    });
  }
};

/**
 * @memberof -AI-SEARCH-module-
 * @name searchHealthCheck
 * @path {GET} /api/search/health
 * @description Health check for AI search system
 */

const searchHealthCheck = async (req, res) => {
  try {
    const healthStatus = await aiSearchOrchestrator.healthCheck();

    const responseType =
      healthStatus.status === "healthy"
        ? __constants.RESPONSE_MESSAGES.SUCCESS
        : __constants.RESPONSE_MESSAGES.FAILED;

    res.sendJson({
      type: responseType,
      data: healthStatus,
    });
  } catch (err) {
    console.error("Error in searchHealthCheck:", err);
    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: err.message || err,
    });
  }
};

// Route definitions
router.post("/aiSearch", aiSearchValidation, aiSearch);
router.get("/suggestions", suggestionsValidation, getSearchSuggestions);
router.post("/advanced", advancedSearchValidation, advancedSearch);
router.get("/similar/:creatorId", similarValidation, findSimilarCreators);
router.get("/health", searchHealthCheck);

module.exports = router;
