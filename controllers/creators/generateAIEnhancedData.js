const express = require("express");
const router = express.Router();
const __constants = require("../../config/constants");
const validationOfAPI = require("../../middlewares/validation");
const creatorService = require("../../services/creators/creatorService");
const aiEnhancedGenerator = require("../../services/creators/aiEnhancedMockGenerator");

const validationSchema = {
  type: "object",
  required: false,
  properties: {
    count: { type: "string", required: false },
    ai_percentage: { type: "string", required: false },
    mode: { type: "string", required: false }, // 'full_ai', 'mixed', 'sample'
  },
};

const validation = (req, res, next) => {
  return validationOfAPI(req, res, next, validationSchema, "query");
};

const generateAIEnhancedData = async (req, res) => {
  try {
    const count = parseInt(req.query.count) || 50;
    const aiPercentage = parseInt(req.query.ai_percentage) || 20;
    const mode = req.query.mode || "mixed";

    console.log(`🤖 Starting AI-enhanced creator generation...`);
    console.log(`   Mode: ${mode}`);
    console.log(`   Count: ${count}`);
    if (mode === "mixed") console.log(`   AI Enhancement: ${aiPercentage}%`);

    let creators;

    switch (mode) {
      case "full_ai":
        creators = await aiEnhancedGenerator.generateMultipleAIEnhancedCreators(
          count
        );
        break;
      case "sample":
        // Just generate a few AI-enhanced creators for testing
        creators = await aiEnhancedGenerator.generateMultipleAIEnhancedCreators(
          Math.min(count, 5)
        );
        break;
      case "mixed":
      default:
        creators = await aiEnhancedGenerator.generateMixedDataset(
          count,
          aiPercentage
        );
        break;
    }

    console.log("🗄️ Inserting creators into database...");

    const insertResults = {
      successful: 0,
      failed: 0,
      ai_enhanced: 0,
      creator_ids: [],
    };

    for (let i = 0; i < creators.length; i++) {
      try {
        const creator = creators[i];
        let creatorId;

        if (creator.ai_enhanced) {
          creatorId = await creatorService.createAIEnhancedCreator(creator);
          insertResults.ai_enhanced++;
        } else {
          creatorId = await creatorService.createCreator(creator);
        }

        insertResults.creator_ids.push(creatorId);
        insertResults.successful++;

        if (i % 25 === 0) {
          console.log(`   Inserted ${i + 1}/${creators.length} creators...`);
        }
      } catch (error) {
        console.error(`Error inserting creator ${i + 1}:`, error);
        insertResults.failed++;
      }
    }

    console.log(`✅ AI-enhanced creator generation completed!`);
    console.log(`   Successful: ${insertResults.successful}`);
    console.log(`   AI-Enhanced: ${insertResults.ai_enhanced}`);
    console.log(`   Failed: ${insertResults.failed}`);

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        message: `Generated ${insertResults.successful} creators with AI enhancement`,
        summary: {
          total_requested: count,
          successful_inserts: insertResults.successful,
          ai_enhanced_creators: insertResults.ai_enhanced,
          regular_creators:
            insertResults.successful - insertResults.ai_enhanced,
          failed_inserts: insertResults.failed,
          mode: mode,
          ai_percentage: mode === "mixed" ? aiPercentage : 100,
        },
        creator_ids: insertResults.creator_ids,
        performance_note:
          "AI-enhanced creators have more realistic bios, content examples, brand collaborations, and personality profiles",
      },
    });
  } catch (err) {
    console.error("Error in generateAIEnhancedData:", err);
    return res.sendJson({
      type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: err.message || err,
    });
  }
};

router.post("/generateAIEnhancedData", validation, generateAIEnhancedData);

module.exports = router;
