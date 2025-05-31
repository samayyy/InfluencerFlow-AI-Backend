// routes/creator/creatorRoute.js
const express = require('express');
const router = express.Router();
const CreatorService = require('../../services/aiPromptSearch/aiPromptSearch2');
const __constants = require('../../config/constants'); // You can customize this or use plain strings
const validationOfAPI = require('../../middlewares/validation');

/**
 * @namespace -CreatorSearch-
 * @description API for semantic creator discovery
 */

const validationSchema = {
  type: 'object',
  required: ['prompt'],
  properties: {
    prompt: { type: 'string' }
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
router.post('/search', validation, async (req, res) => {
  try {
    const { prompt } = req.body;
    const creators = await CreatorService.searchByPrompt(prompt);

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: creators
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
