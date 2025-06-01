const express = require('express');
const router = express.Router();
const __constants = require('../../config/constants');
const creatorsQueries = require('../../queries/mails/mails_queries');
const ContractService = require('../../services/docusign/docusign');
const validationOfAPI = require('../../middlewares/validation');
const { pool } = require('../../lib/db/postgres');

const contractService = new ContractService();

const validationSchema = {
  type: 'object',
  required: ['creatorId'],
  properties: {
    creatorId: { type: 'string' },
  },
};

const validation = (req, res, next) =>
  validationOfAPI(req, res, next, validationSchema, 'query');

const checkSignatureStatusHandler = async (req, res) => {
  try {
    const { creatorId } = req.query;

    // Validate creator exists
    const creatorRes = await creatorsQueries.getAllCreators(creatorId);
    if (!creatorRes.rows.length) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.NOT_FOUND,
        err: `No creator found with ID ${creatorId}`,
      });
    }

    // Fetch all contracts for this creator
    const contractRes = await pool.query(
      `SELECT * FROM contracts WHERE creator_id = $1 ORDER BY created_at DESC`,
      [creatorId]
    );

    if (!contractRes.rows.length) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.NOT_FOUND,
        err: 'No contracts found for this creator',
      });
    }

    const results = [];

    for (const contract of contractRes.rows) {
      const envelopeId = contract.docusign_envelope_id;

      let envelopeStatus = null;
      try {
        envelopeStatus = await contractService.checkSignatureStatus(envelopeId);
      } catch (err) {
        console.warn(`[DocuSign] Could not fetch status for envelope ${envelopeId}:`, err.message);
        envelopeStatus = 'error';
      }

      // Update DB if newly signed
      if (envelopeStatus === 'completed' && !contract.is_signed) {
        await pool.query(
          `UPDATE contracts SET is_signed = TRUE, signed_at = NOW() WHERE docusign_envelope_id = $1`,
          [envelopeId]
        );
      }

      results.push({
        envelopeId,
        envelopeStatus,
        isSigned: envelopeStatus === 'completed' ? true : contract.is_signed,
        signedAt:
          envelopeStatus === 'completed'
            ? new Date().toISOString()
            : contract.signed_at,
      });
    }

    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        creatorId,
        contracts: results,
      },
    });
  } catch (err) {
    console.error('[checkSignatureStatusHandler] Error:', err);
    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: err.message || err,
    });
  }
};

router.get('/checkSignatureStatus', validation, checkSignatureStatusHandler);

module.exports = router;