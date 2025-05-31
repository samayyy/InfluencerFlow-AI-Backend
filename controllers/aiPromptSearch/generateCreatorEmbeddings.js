// routes/creator/creatorRoute.js
const express = require('express');
const router = express.Router();
const CreatorService = require('../../services/aiPromptSearch/aiPromptSearch');
const __constants = require('../../config/constants'); // You can customize this or use plain strings
const validationOfAPI = require('../../middlewares/validation');

/**
 * @namespace -CreatorSearch-
 * @description API for creating creator embeddings
 */

const validationSchema = {
  type: 'object',
  required: [],
  properties: {
  }
};

const validation = (req, res, next) => {
  return validationOfAPI(req, res, next, validationSchema, 'body');
};

/**
 * @memberof -CreatorSearch-
 * @name searchByPrompt
 * @path {POST} /api/creator/search
 * @description Get relevant creators based on natural language prompt
 */
router.get('/createEmbeddings', validation, async (req, res) => {
  try {
    const embeddings = await CreatorService.setupAndGenerateAllEmbeddings();

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: embeddings
    });
  } catch (err) {
    console.error('❌ Error in creator search:', err);
    res.sendJson({
      type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: err.err || err.message || err
    });
  }
});

module.exports = router;
