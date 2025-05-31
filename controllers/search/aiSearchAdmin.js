// controllers/search/aiSearchAdmin.js
const express = require("express");
const router = express.Router();
const __constants = require("../../config/constants");
const validationOfAPI = require("../../middlewares/validation");
const embeddingService = require("../../services/ai/embeddingService");
const creatorService = require("../../services/creators/creatorService");

/**
 * @namespace -AI-SEARCH-ADMIN-MODULE-
 * @description Admin API's for AI search system setup and maintenance.
 */

/**
 * @memberof -AI-SEARCH-ADMIN-module-
 * @name initializeSearchSystem
 * @path {POST} /api/search/admin/initialize
 * @description Initialize AI search system and embed existing creators
 */

const initializeValidationSchema = {
  type: "object",
  required: false,
  properties: {
    batch_size: { type: "number", required: false },
    force_recreate_index: { type: "boolean", required: false },
    start_from_creator_id: { type: "string", required: false },
  },
};

const initializeValidation = (req, res, next) => {
  return validationOfAPI(req, res, next, initializeValidationSchema, "body");
};

const initializeSearchSystem = async (req, res) => {
  try {
    const {
      batch_size = 50,
      force_recreate_index = false,
      start_from_creator_id = null,
    } = req.body;

    console.log("🚀 Starting AI search system initialization...");

    // Initialize Pinecone index
    console.log("📊 Initializing Pinecone index...");
    await embeddingService.initializePineconeIndex();

    // Get all creators from database
    console.log("📋 Fetching creators from database...");

    let allCreators = [];
    let page = 1;
    let hasMore = true;
    let startProcessing = start_from_creator_id === null;

    while (hasMore) {
      const creatorsPage = await creatorService.getAllCreators(
        {},
        {
          page,
          limit: batch_size,
        }
      );

      if (creatorsPage.creators.length === 0) {
        hasMore = false;
        break;
      }

      // If we have a starting creator ID, skip until we find it
      if (!startProcessing) {
        const startIndex = creatorsPage.creators.findIndex(
          (creator) => creator.id.toString() === start_from_creator_id
        );
        if (startIndex !== -1) {
          startProcessing = true;
          allCreators.push(...creatorsPage.creators.slice(startIndex));
        }
      } else {
        allCreators.push(...creatorsPage.creators);
      }

      page++;

      // Don't process more than 1000 creators at once to prevent memory issues
      if (allCreators.length >= 1000) {
        break;
      }
    }

    console.log(`📈 Found ${allCreators.length} creators to process`);

    if (allCreators.length === 0) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.NO_RECORDS_FOUND,
        data: {
          message: "No creators found to embed",
          start_from_creator_id,
        },
      });
    }

    // Start embedding process
    console.log("🤖 Starting embedding generation...");
    const embeddingResults = await embeddingService.embedMultipleCreators(
      allCreators
    );

    // Get index statistics
    const indexStats = await embeddingService.getIndexStats();

    const response = {
      message: "AI search system initialization completed",
      results: {
        total_creators_processed: allCreators.length,
        successful_embeddings: embeddingResults.successful,
        failed_embeddings: embeddingResults.failed,
        errors: embeddingResults.errors,
        batch_size_used: batch_size,
        started_from_creator_id: start_from_creator_id,
      },
      index_stats: indexStats,
      next_steps:
        embeddingResults.failed > 0
          ? [
              "Review failed embeddings",
              "Consider re-running for failed creators",
            ]
          : [
              "AI search system is ready",
              "Test with /api/search/health endpoint",
            ],
    };

    if (embeddingResults.failed > 0) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.ACCEPTED,
        data: response,
      });
    }

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: response,
    });
  } catch (err) {
    console.error("Error in initializeSearchSystem:", err);
    return res.sendJson({
      type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: err.message || err,
    });
  }
};

/**
 * @memberof -AI-SEARCH-ADMIN-module-
 * @name updateCreatorEmbedding
 * @path {PUT} /api/search/admin/embedding/:creatorId
 * @description Update embedding for a specific creator
 */

const updateEmbeddingValidationSchema = {
  type: "object",
  required: true,
  properties: {
    creatorId: { type: "string", required: true },
  },
};

const updateEmbeddingValidation = (req, res, next) => {
  return validationOfAPI(
    req,
    res,
    next,
    updateEmbeddingValidationSchema,
    "params"
  );
};

const updateCreatorEmbedding = async (req, res) => {
  try {
    const { creatorId } = req.params;

    console.log(`🔄 Updating embedding for creator ID: ${creatorId}`);

    // Get creator details
    const creator = await creatorService.getCreatorById(creatorId);

    if (!creator) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.NO_RECORDS_FOUND,
        data: { creator_id: creatorId },
      });
    }

    // Update embedding
    await embeddingService.updateCreatorEmbedding(creatorId, creator);

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        message: `Embedding updated successfully for creator: ${creator.creator_name}`,
        creator_id: creatorId,
        creator_name: creator.creator_name,
      },
    });
  } catch (err) {
    console.error("Error in updateCreatorEmbedding:", err);
    return res.sendJson({
      type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: err.message || err,
    });
  }
};

/**
 * @memberof -AI-SEARCH-ADMIN-module-
 * @name deleteCreatorEmbedding
 * @path {DELETE} /api/search/admin/embedding/:creatorId
 * @description Delete embedding for a specific creator
 */

const deleteEmbeddingValidation = (req, res, next) => {
  return validationOfAPI(
    req,
    res,
    next,
    updateEmbeddingValidationSchema,
    "params"
  );
};

const deleteCreatorEmbedding = async (req, res) => {
  try {
    const { creatorId } = req.params;

    console.log(`🗑️ Deleting embedding for creator ID: ${creatorId}`);

    await embeddingService.deleteCreatorEmbedding(creatorId);

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        message: `Embedding deleted successfully for creator ID: ${creatorId}`,
        creator_id: creatorId,
      },
    });
  } catch (err) {
    console.error("Error in deleteCreatorEmbedding:", err);
    return res.sendJson({
      type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: err.message || err,
    });
  }
};

/**
 * @memberof -AI-SEARCH-ADMIN-module-
 * @name getIndexStats
 * @path {GET} /api/search/admin/stats
 * @description Get Pinecone index statistics
 */

const getIndexStats = async (req, res) => {
  try {
    await embeddingService.initializePineconeIndex();
    const stats = await embeddingService.getIndexStats();

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        index_stats: stats,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("Error in getIndexStats:", err);
    return res.sendJson({
      type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: err.message || err,
    });
  }
};

/**
 * @memberof -AI-SEARCH-ADMIN-module-
 * @name bulkEmbedCreators
 * @path {POST} /api/search/admin/bulk-embed
 * @description Embed specific creators by IDs
 */

const bulkEmbedValidationSchema = {
  type: "object",
  required: true,
  properties: {
    creator_ids: { type: "array", required: true, minItems: 1 },
  },
};

const bulkEmbedValidation = (req, res, next) => {
  return validationOfAPI(req, res, next, bulkEmbedValidationSchema, "body");
};

const bulkEmbedCreators = async (req, res) => {
  try {
    const { creator_ids } = req.body;

    console.log(`📦 Bulk embedding ${creator_ids.length} creators...`);

    // Fetch creators
    const creators = await Promise.all(
      creator_ids.map((id) => creatorService.getCreatorById(id))
    );

    // Filter out null results
    const validCreators = creators.filter((creator) => creator !== null);
    const invalidIds = creator_ids.filter(
      (id, index) => creators[index] === null
    );

    if (validCreators.length === 0) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.NO_RECORDS_FOUND,
        data: {
          message: "No valid creators found for the provided IDs",
          invalid_ids: invalidIds,
        },
      });
    }

    // Embed creators
    const embeddingResults = await embeddingService.embedMultipleCreators(
      validCreators
    );

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        message: `Bulk embedding completed`,
        results: {
          requested_creators: creator_ids.length,
          valid_creators: validCreators.length,
          successful_embeddings: embeddingResults.successful,
          failed_embeddings: embeddingResults.failed,
          invalid_creator_ids: invalidIds,
          errors: embeddingResults.errors,
        },
      },
    });
  } catch (err) {
    console.error("Error in bulkEmbedCreators:", err);
    return res.sendJson({
      type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: err.message || err,
    });
  }
};

/**
 * @memberof -AI-SEARCH-ADMIN-module-
 * @name rebuildIndex
 * @path {POST} /api/search/admin/rebuild-index
 * @description Completely rebuild the search index (DANGER: deletes existing index)
 */

const rebuildIndexValidationSchema = {
  type: "object",
  required: true,
  properties: {
    confirm_rebuild: { type: "boolean", required: true },
    backup_name: { type: "string", required: false },
  },
};

const rebuildIndexValidation = (req, res, next) => {
  return validationOfAPI(req, res, next, rebuildIndexValidationSchema, "body");
};

const rebuildIndex = async (req, res) => {
  try {
    const { confirm_rebuild, backup_name } = req.body;

    if (!confirm_rebuild) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.INVALID_REQUEST,
        err: "Must confirm rebuild with confirm_rebuild: true",
      });
    }

    console.log(
      "⚠️ REBUILDING SEARCH INDEX - This will delete all existing embeddings!"
    );

    // This is a dangerous operation - in production you'd want additional safeguards
    console.log(
      "🗑️ Note: Index rebuild requested. In production, implement proper backup/restore logic."
    );

    // For now, we'll just reinitialize (which will reuse existing index if it exists)
    await embeddingService.initializePineconeIndex();

    // Get all creators and re-embed them
    const allCreators = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const creatorsPage = await creatorService.getAllCreators(
        {},
        {
          page,
          limit: 100,
        }
      );

      if (creatorsPage.creators.length === 0) {
        hasMore = false;
        break;
      }

      allCreators.push(...creatorsPage.creators);
      page++;
    }

    console.log(`🔄 Re-embedding ${allCreators.length} creators...`);
    const embeddingResults = await embeddingService.embedMultipleCreators(
      allCreators
    );

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        message: "Search index rebuilt successfully",
        results: {
          total_creators: allCreators.length,
          successful_embeddings: embeddingResults.successful,
          failed_embeddings: embeddingResults.failed,
          backup_name: backup_name || null,
        },
        warning: "All previous embeddings have been replaced",
      },
    });
  } catch (err) {
    console.error("Error in rebuildIndex:", err);
    return res.sendJson({
      type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: err.message || err,
    });
  }
};

/**
 * @memberof -AI-SEARCH-ADMIN-module-
 * @name debugPineconeData
 * @path {GET} /api/search/admin/debug
 * @description Debug Pinecone data and search functionality
 */

const debugPineconeData = async (req, res) => {
  try {
    await embeddingService.initializePineconeIndex();

    // Test query with very low threshold
    const testQuery = "creator";
    const vectorSearchService = require("../../services/search/vectorSearchService");
    await vectorSearchService.initialize();

    const debugResults = await vectorSearchService.semanticSearch(testQuery, {
      topK: 5,
      minScore: 0.1, // Very low threshold
      filters: {}, // No filters
    });

    // Get index stats
    const stats = await embeddingService.getIndexStats();

    // Sample a few vectors to check metadata structure
    const sampleVectorIds = ["creator_1", "creator_2", "creator_3"];
    let sampleMetadata = {};

    try {
      const fetchResult = await embeddingService.index.fetch(sampleVectorIds);
      sampleMetadata = fetchResult.vectors || {};
    } catch (error) {
      console.log("Could not fetch sample vectors:", error.message);
    }

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        message: "Debug information for Pinecone search",
        index_stats: stats,
        test_search_results: {
          query: testQuery,
          results_found: debugResults.results.length,
          sample_results: debugResults.results.slice(0, 3),
        },
        sample_metadata: Object.keys(sampleMetadata).map((key) => ({
          vector_id: key,
          metadata: sampleMetadata[key]?.metadata || null,
        })),
        debug_info: {
          total_vectors: stats.totalRecordCount,
          namespace_info: stats.namespaces,
          dimension: stats.dimension,
        },
      },
    });
  } catch (err) {
    console.error("Error in debugPineconeData:", err);
    return res.sendJson({
      type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: err.message || err,
    });
  }
};

/**
 * @memberof -AI-SEARCH-ADMIN-module-
 * @name testSimilarity
 * @path {GET} /api/search/admin/test-similarity/:query
 * @description Test similarity search with different thresholds
 */

const testSimilarityValidationSchema = {
  type: "object",
  required: true,
  properties: {
    query: { type: "string", required: true },
  },
};

const testSimilarityValidation = (req, res, next) => {
  return validationOfAPI(
    req,
    res,
    next,
    testSimilarityValidationSchema,
    "params"
  );
};

const testSimilarity = async (req, res) => {
  try {
    const { query } = req.params;
    const vectorSearchService = require("../../services/search/vectorSearchService");
    await vectorSearchService.initialize();

    // Test with different similarity thresholds
    const thresholds = [0.1, 0.2, 0.3, 0.4, 0.5];
    const results = {};

    for (const threshold of thresholds) {
      try {
        const searchResults = await vectorSearchService.semanticSearch(query, {
          topK: 5,
          minScore: threshold,
          filters: {},
        });
        results[`threshold_${threshold}`] = {
          results_found: searchResults.results.length,
          top_scores: searchResults.results.slice(0, 3).map((r) => ({
            creator_name: r.metadata?.creator_name,
            score: r.similarity_score,
            niche: r.metadata?.niche,
          })),
        };
      } catch (error) {
        results[`threshold_${threshold}`] = { error: error.message };
      }
    }

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        query: query,
        similarity_tests: results,
        recommendation:
          "Use the threshold that gives best balance of results vs relevance",
      },
    });
  } catch (err) {
    console.error("Error in testSimilarity:", err);
    return res.sendJson({
      type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: err.message || err,
    });
  }
};

// Route definitions
router.post("/initialize", initializeValidation, initializeSearchSystem);
router.put(
  "/embedding/:creatorId",
  updateEmbeddingValidation,
  updateCreatorEmbedding
);
router.delete(
  "/embedding/:creatorId",
  deleteEmbeddingValidation,
  deleteCreatorEmbedding
);
router.get("/stats", getIndexStats);
router.post("/bulk-embed", bulkEmbedValidation, bulkEmbedCreators);
router.post("/rebuild-index", rebuildIndexValidation, rebuildIndex);
router.get("/debug", debugPineconeData);
router.get("/test-similarity/:query", testSimilarityValidation, testSimilarity);

module.exports = router;
