const express = require('express');
const router = express.Router();
const __constants = require('../../config/constants');
const { pool } = require('../../lib/db/postgres');
const xml2js = require('xml2js');

const parser = new xml2js.Parser({ explicitArray: false });

/**
 * DocuSign Connect Webhook Handler
 * Receives envelope status updates (XML), updates contract status in DB accordingly.
 */
const docusignWebhookHandler = async (req, res) => {
  try {
    const xmlPayload = req.body;

    parser.parseString(xmlPayload, async (err, result) => {
      if (err) {
        console.error('[DocuSignWebhook] XML parse error:', err);
        return res.status(400).send('Invalid XML');
      }

      if (!result || !result.DocuSignEnvelopeInformation) {
        console.warn('[DocuSignWebhook] Missing DocuSignEnvelopeInformation in payload');
        return res.status(400).send('Bad Request');
      }

      const envelopeStatus = result.DocuSignEnvelopeInformation.EnvelopeStatus;
      if (!envelopeStatus) {
        console.warn('[DocuSignWebhook] Missing EnvelopeStatus in payload');
        return res.status(400).send('Bad Request');
      }

      const envelopeId = envelopeStatus.EnvelopeID;
      const status = envelopeStatus.Status?.toLowerCase();

      if (!envelopeId) {
        console.warn('[DocuSignWebhook] EnvelopeID missing');
        return res.status(400).send('Bad Request');
      }

      if (status === 'completed') {
        // Update DB to mark contract as signed
        const updateRes = await pool.query(
          'UPDATE contracts SET is_signed = TRUE, signed_at = NOW() WHERE docusign_envelope_id = $1',
          [envelopeId]
        );

        if (updateRes.rowCount === 0) {
          console.warn(`[DocuSignWebhook] No contract found for envelope ${envelopeId}`);
        } else {
          console.log(`[DocuSignWebhook] Contract updated as signed for envelope ${envelopeId}`);
        }
      }

      // Always respond 200 OK to acknowledge receipt
      res.status(200).send('OK');
    });
  } catch (err) {
    console.error('[DocuSignWebhook] Error processing webhook:', err);
    res.status(500).send('Server Error');
  }
};

// Middleware: parse raw XML text on this route
router.post('/webhook', express.text({ type: 'application/xml' }), docusignWebhookHandler);

module.exports = router;