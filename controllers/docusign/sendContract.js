const express = require("express");
const router = express.Router();
const __constants = require("../../config/constants");
const creatorsQueries = require("../../queries/mails/mails_queries");
const validationOfAPI = require("../../middlewares/validation");
const ContractService = require("../../services/docusign/docusign");

const contractService = new ContractService();

const validationSchema = {
  type: "object",
  required: ["creatorId", "transcript"],
  properties: {
    creatorId: { type: "string" },
    transcript: { type: "string" },
  },
};

const validation = (req, res, next) =>
  validationOfAPI(req, res, next, validationSchema, "body");

const generateAndSendContract = async (req, res) => {
  console.log("[generateAndSendContract] Request body:", req.body);

  try {
    const { creatorId, transcript } = req.body;

    const creatorRes = await creatorsQueries.getAllCreators(creatorId);

    if (!creatorRes.rows.length) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.NOT_FOUND,
        err: `No creator found with ID ${creatorId}`,
      });
    }

    const creator = creatorRes.rows[0];

    const enrichedTranscript = `
${transcript}

Creator email: ${creator.email}
Creator name: ${creator.creator_name}
`;

    const envelopeSummary = await contractService.generateAndSendContract(
      enrichedTranscript,
      creatorId
    );

    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        message: "Contract sent via DocuSign",
        envelopeId: envelopeSummary.envelopeId,
        status: envelopeSummary.status,
      },
    });
  } catch (err) {
    console.error("[generateAndSendContract] Error:", err);
    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: err.message || err,
    });
  }
};

router.post("/generateAndSend", validation, generateAndSendContract);

module.exports = router;