const express = require("express");
const router = express.Router();
const __constants = require("../../config/constants");
const validationOfAPI = require("../../middlewares/validation");
const creatorService = require("../../services/creators/creatorService");
const mockCreatorGenerator = require("../../services/creators/mockCreatorGenerator");

const validationSchema = {
  type: "object",
  required: false,
  properties: {
    count: { type: "string", required: false },
  },
};

const validation = (req, res, next) => {
  return validationOfAPI(req, res, next, validationSchema, "query");
};

const generateMockData = async (req, res) => {
  try {
    const count = parseInt(req.query.count) || 500;

    console.log(`Starting generation of ${count} mock creators...`);

    // Generate mock creators
    const mockCreators = mockCreatorGenerator.generateMultipleCreators(count);

    console.log("Mock creators generated, now inserting into database...");

    // Insert creators into database
    const insertedCreators = [];
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < mockCreators.length; i++) {
      try {
        const creatorId = await creatorService.createCreator(mockCreators[i]);
        insertedCreators.push(creatorId);
        successCount++;

        if (i % 50 === 0) {
          console.log(`Inserted ${i + 1}/${count} creators...`);
        }
      } catch (error) {
        console.error(`Error inserting creator ${i + 1}:`, error);
        errorCount++;
      }
    }

    console.log(
      `Mock data generation completed. Success: ${successCount}, Errors: ${errorCount}`
    );

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        message: `Generated ${successCount} creators successfully`,
        total_requested: count,
        successful_inserts: successCount,
        errors: errorCount,
        creator_ids: insertedCreators,
      },
    });
  } catch (err) {
    console.error("Error in generateMockData:", err);
    return res.sendJson({
      type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: err.message || err,
    });
  }
};

router.post("/generateMockData", validation, generateMockData);

module.exports = router;
