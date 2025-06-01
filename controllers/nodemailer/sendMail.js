const express = require("express");
const router = express.Router();
const __constants = require("../../config/constants");
const creatorsQueries = require("../../queries/mails/mails_queries");
const validationOfAPI = require("../../middlewares/validation");
const MailService = require("../../services/nodemailer/nodemailer");
// const Pool = require('../../lib/db/postgres').pool()

/**
 * @namespace -MAIL-MODULE-
 * @description APIs related to sending brand collaboration emails.
 */

/**
 * @memberof -MAIL-module-
 * @name sendBrandCollab
 * @path {POST} /api/mail/sendBrandCollab
 * @description Sends a personalized collaboration email to the selected creator
 * @body {string} creatorId.required - The ID of the creator
 * @body {string} brandName.required - The name of the brand
 * @response {string} ContentType=application/json - Response content type
 * @response {object} message - Status message
 * @code {200} if successful
 */

const validationSchema = {
  type: "object",
  required: true,
  properties: {
    creatorIds: {
      type: "array",
      items: { type: "string" },
      minItems: 1,
    },
    brandName: { type: "string" },
  },
};

const validation = (req, res, next) => {
  return validationOfAPI(req, res, next, validationSchema, "body");
};

const sendBrandCollab = async (req, res) => {
  try {
    const { creatorIds, brandName } = req.body;

    const notFoundIds = [];

    for (const id of creatorIds) {
      const creatorRes = await creatorsQueries.getAllCreators(id);

      if (!creatorRes.rows.length) {
        notFoundIds.push(id);
        continue;
      }

      const creator = creatorRes.rows[0];

      // Send email
      await MailService.sendBrandCollabEmail({
        to: creator.email,
        name: creator.creator_name,
        brandName,
        niche: creator.niche || "N/A",
        platform: creator.primary_platform || "N/A",
      });
    }

    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        message: "Emails sent successfully",
        notFound: notFoundIds.length ? notFoundIds : undefined,
      },
    });
  } catch (err) {
    console.error("Error in sendBrandCollab:", err);
    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: err.message || err,
    });
  }
};

router.post("/sendBrandCollab", validation, sendBrandCollab);

module.exports = router;