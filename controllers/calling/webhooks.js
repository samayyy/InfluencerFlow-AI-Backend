// controllers/calling/webhooks.js
const express = require('express')
const router = express.Router()
const __constants = require('../../config/constants')
const twilioService = require('../../services/calling/twilioService')
const callService = require('../../services/calling/callService')
const elevenLabsService = require('../../services/calling/elevenLabsService')
const crypto = require('crypto'); // ✅ REQUIRED


/**
 * @namespace -CALLING-WEBHOOKS-MODULE-
 * @description Webhook endpoints for Twilio call events and voice handling
 */

/**
 * @memberof -CALLING-WEBHOOKS-module-
 * @name voiceWebhook
 * @path {POST} /api/calling/voice
 * @description Handle incoming voice calls and connect to ElevenLabs (fallback mode)
 */
const voiceWebhook = async (req, res) => {
  try {
    const { CallSid, From, To, CallStatus } = req.body
    const { callId, creatorId, agentId, customMessage } = req.query

    console.log(`🎙️ Voice webhook received (Twilio fallback mode):`, {
      CallSid,
      From,
      To,
      CallStatus,
      callId,
      agentId
    })

    // Validate webhook signature for security
    const signature = req.headers['x-twilio-signature']
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`

    if (process.env.NODE_ENV === 'production') {
      const isValid = twilioService.validateWebhookSignature(signature, url, req.body)
      if (!isValid) {
        console.error('Invalid Twilio webhook signature')
        return res.status(403).send('Invalid signature')
      }
    }

    // ✅ UPDATED: This webhook is now primarily for Twilio fallback calls
    // ElevenLabs outbound calls are handled directly via their API
    
    let twimlOptions = {
      agentId: agentId,
      creatorId: creatorId,
      customMessage: customMessage || "Hello! Thank you for your interest. We're connecting you with our AI assistant to discuss potential collaboration opportunities.",
      connectToAgent: false, // Default to false for fallback mode
      fallbackMode: true
    };

    // For fallback Twilio calls, try to create ElevenLabs conversation if possible
    let conversationData = null;
    let elevenlabsSuccess = false;
    
    if (agentId && creatorId) {
      try {
        // Try the deprecated createConversation method for webhook compatibility
        conversationData = await elevenLabsService.createConversation({
          agentId: agentId,
          creatorId: creatorId,
          phoneNumber: From,
          callContext: 'outbound_sales_fallback',
          metadata: {
            call_sid: CallSid,
            call_id: callId,
            webhook_mode: true
          }
        })

        elevenlabsSuccess = conversationData && conversationData.status !== 'fallback_created'

        // Check if we got a real conversation (not mock)
        elevenlabsSuccess = conversationData && 
                           conversationData.status !== 'mock_created' && 
                           conversationData.status !== 'fallback_created';
        
        if (elevenlabsSuccess) {
          console.log(`✅ ElevenLabs fallback conversation created: ${conversationData.conversationId}`);
          twimlOptions.connectToAgent = true;
          twimlOptions.conversationId = conversationData.conversationId;
          twimlOptions.fallbackMode = false;
        } else {
          console.log(`⚠️ ElevenLabs not available, using basic TwiML: ${conversationData?.note || 'Unknown issue'}`);
        }
      } catch (error) {
        console.error('Failed to create ElevenLabs conversation in webhook:', error);
        elevenlabsSuccess = false;
      }
    }

    // Generate TwiML response
    const twimlResponse = twilioService.generateVoiceTwiML(twimlOptions);

    // Update call status if we have call ID
    if (callId && CallSid) {
      try {
        await callService.updateCallStatus(CallSid, 'in-progress', {
          elevenlabsConversationId: conversationData?.conversationId,
          from: From,
          to: To,
          webhook_processed: true,
          elevenlabs_success: elevenlabsSuccess
        });
      } catch (error) {
        console.error('Failed to update call status in webhook:', error);
        // Don't fail the webhook
      }
    }

    // Return TwiML
    res.type('text/xml')
    res.send(twimlResponse)
  } catch (error) {
    console.error('Error in voice webhook:', error)

    // Return basic TwiML to prevent call failure
    const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">We apologize, but we're experiencing technical difficulties. Please try again later. Goodbye.</Say>
  <Hangup/>
</Response>`

    res.type('text/xml')
    res.send(errorTwiml)
  }
}

/**
 * @memberof -CALLING-WEBHOOKS-module-
 * @name statusWebhook
 * @path {POST} /api/calling/status
 * @description Handle call status updates from Twilio
 */
const statusWebhook = async (req, res) => {
  try {
    const {
      CallSid,
      CallStatus,
      CallDuration,
      From,
      To,
      Direction,
      AnsweredBy,
      Timestamp
    } = req.body

    console.log('📊 Status webhook received:', {
      CallSid,
      CallStatus,
      CallDuration,
      AnsweredBy
    })

    // Validate webhook signature
    const signature = req.headers['x-twilio-signature']
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`

    if (process.env.NODE_ENV === 'production') {
      const isValid = twilioService.validateWebhookSignature(signature, url, req.body)
      if (!isValid) {
        console.error('Invalid Twilio webhook signature')
        return res.status(403).send('Invalid signature')
      }
    }

    // Map Twilio status to our internal status
    let internalStatus = CallStatus
    let outcome = null

    switch (CallStatus) {
      case 'completed':
        outcome = 'completed'
        break
      case 'busy':
        outcome = 'busy'
        internalStatus = 'failed'
        break
      case 'no-answer':
        outcome = 'no-answer'
        internalStatus = 'failed'
        break
      case 'failed':
        outcome = 'failed'
        internalStatus = 'failed'
        break
      case 'canceled':
        outcome = 'canceled'
        internalStatus = 'failed'
        break
      default:
        // Keep status as-is for 'initiated', 'ringing', 'in-progress'
        break
    }

    // Update call status in database
    try {
      await callService.updateCallStatus(CallSid, internalStatus, {
        outcome: outcome,
        answered_by: AnsweredBy,
        call_duration: CallDuration,
        direction: Direction,
        timestamp: Timestamp,
        twilio_status: CallStatus,
        webhook_source: 'twilio_status'
      });

      console.log(`✅ Call status updated: ${CallSid} -> ${internalStatus}`)
    } catch (error) {
      console.error('Failed to update call status:', error)
      // Don't fail the webhook response
    }

    // If call completed, try to get conversation insights
    if (CallStatus === 'completed' && CallDuration > 0) {
      // Run asynchronously to not delay webhook response
      setImmediate(async () => {
        try {
          console.log(`🔍 Processing completed call insights for ${CallSid}`);
          // Call completion processing is handled in callService.updateCallStatus
        } catch (error) {
          console.error('Error processing call completion insights:', error)
        }
      })
    }

    res.status(200).send('OK')
  } catch (error) {
    console.error('Error in status webhook:', error)
    res.status(500).send('Internal Server Error')
  }
}

/**
 * @memberof -CALLING-WEBHOOKS-module-
 * @name recordingWebhook
 * @path {POST} /api/calling/recording
 * @description Handle call recording completion
 */
const recordingWebhook = async (req, res) => {
  try {
    const {
      CallSid,
      RecordingSid,
      RecordingUrl,
      RecordingStatus,
      RecordingDuration,
      RecordingChannels,
      RecordingSource
    } = req.body

    console.log('🎵 Recording webhook received:', {
      CallSid,
      RecordingSid,
      RecordingStatus,
      RecordingDuration
    })

    // Validate webhook signature
    const signature = req.headers['x-twilio-signature']
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`

    if (process.env.NODE_ENV === 'production') {
      const isValid = twilioService.validateWebhookSignature(signature, url, req.body)
      if (!isValid) {
        console.error('Invalid Twilio webhook signature')
        return res.status(403).send('Invalid signature')
      }
    }

    if (RecordingStatus === 'completed' && RecordingUrl) {
      try {
        // Update call record with recording URL
        const { Pool } = require('pg')
        const __config = require('../../config')

        const pool = new Pool({
          user: __config.postgres.user,
          host: __config.postgres.host,
          database: __config.postgres.database,
          password: __config.postgres.password,
          port: __config.postgres.port,
          ssl: { rejectUnauthorized: false }
        })

        await pool.query(
          'UPDATE calls SET call_recording_url = $1 WHERE call_sid = $2',
          [RecordingUrl, CallSid]
        )

        console.log(`✅ Recording URL saved for call ${CallSid}`)

        await pool.end()
      } catch (error) {
        console.error('Failed to save recording URL:', error)
      }
    }

    res.status(200).send('OK')
  } catch (error) {
    console.error('Error in recording webhook:', error)
    res.status(500).send('Internal Server Error')
  }
}

/**
 * @memberof -CALLING-WEBHOOKS-module-
 * @name elevenLabsWebhook
 * @path {POST} /api/calling/elevenlabs-webhook
 * @description Handle ElevenLabs conversation events (NEW)
 */
const elevenLabsWebhook = async (req, res) => {
  try {
    const { event, conversation_id, call_sid, data } = req.body;

    console.log(`🎤 ElevenLabs webhook received:`, {
      event,
      conversation_id,
      call_sid,
      timestamp: new Date().toISOString()
    });

    // Handle different ElevenLabs events
    switch (event) {
      case 'conversation.started':
        console.log(`▶️ ElevenLabs conversation started: ${conversation_id}`);
        if (call_sid) {
          await callService.updateCallStatus(call_sid, 'in-progress', {
            elevenlabsConversationId: conversation_id,
            event_source: 'elevenlabs_webhook'
          });
        }
        break;

      case 'conversation.ended':
        console.log(`⏹️ ElevenLabs conversation ended: ${conversation_id}`);
        if (call_sid) {
          await callService.updateCallStatus(call_sid, 'completed', {
            outcome: 'completed',
            event_source: 'elevenlabs_webhook',
            end_reason: data?.end_reason
          });
        }
        break;

      case 'call.status_changed':
        console.log(`📞 ElevenLabs call status changed: ${data?.status}`);
        if (call_sid && data?.status) {
          let mappedStatus = data.status;
          let outcome = null;

          // Map ElevenLabs statuses to our internal statuses
          switch (data.status) {
            case 'ringing':
              mappedStatus = 'ringing';
              break;
            case 'answered':
              mappedStatus = 'in-progress';
              break;
            case 'completed':
              mappedStatus = 'completed';
              outcome = 'completed';
              break;
            case 'failed':
            case 'busy':
            case 'no-answer':
              mappedStatus = 'failed';
              outcome = data.status;
              break;
          }

          await callService.updateCallStatus(call_sid, mappedStatus, {
            outcome: outcome,
            event_source: 'elevenlabs_webhook',
            elevenlabs_status: data.status
          });
        }
        break;

      case 'conversation.message':
        // Log conversation messages for analytics
        console.log(`💬 ElevenLabs message: ${conversation_id}`);
        break;

      default:
        console.log(`❓ Unknown ElevenLabs event: ${event}`);
    }

    res.status(200).json({ success: true, event_processed: event });

  } catch (error) {
    console.error('Error in ElevenLabs webhook:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * @memberof -CALLING-WEBHOOKS-module-
 * @name streamWebhook
 * @path {POST} /api/calling/stream
 * @description Handle ElevenLabs stream events (for manual Twilio integration)
 */
const streamWebhook = async (req, res) => {
  try {
    const { event, streamSid, callSid, track } = req.body

    console.log('🌊 Stream webhook received:', {
      event,
      streamSid,
      callSid,
      track
    })

    // Handle different stream events
    switch (event) {
      case 'connected':
        console.log(`📡 Stream connected: ${streamSid}`)
        break
      case 'start':
        console.log(`▶️ Stream started: ${streamSid}`)
        break
      case 'media':
        // Media events are frequent - only log if debugging
        if (process.env.DEBUG_STREAM_MEDIA === 'true') {
          console.log(`🎵 Media event for stream: ${streamSid}`)
        }
        break
      case 'stop':
        console.log(`⏹️ Stream stopped: ${streamSid}`)
        break
      default:
        console.log(`❓ Unknown stream event: ${event}`)
    }

    res.status(200).send('OK')
  } catch (error) {
    console.error('Error in stream webhook:', error)
    res.status(500).send('Internal Server Error')
  }
}

// /**
//  * @memberof -CALLING-WEBHOOKS-module-
//  * @name postCallData
//  * @path {POST} /api/calling/postCallData
//  * @description Post Call Data
//  */
// const postCallData = async (req, res) => {
//   try {
//     console.log('🧪 Post Call Data called:')
//     console.log('Headers:', req.headers)
//     console.log('Body:', req.body)
//     console.log('Query:', req.query)
//     const webhookSecret = process.env.ELEVENLABS_POST_CALL_WEBHOOK_SECRET
//     const signatureHeader = req.headers['elevenlabs-signature'];
//     if (!signatureHeader) return res.status(400).send('Missing signature');

//     if (!req.rawBody) {
//         console.error('❌ rawBody is undefined');
//         return res.status(400).send('Missing raw body for HMAC validation');
//     }

//     console.log('🔍 Raw body string:', req.rawBody.toString());

//     const receivedSignature = signatureHeader.split('v0=')[1];

//     const expectedSignature = crypto
//         .createHmac('sha256', webhookSecret)
//         .update(req.rawBody) // <--- must be Buffer or string
//         .digest('hex');

//     console.log('🧾 Received Signature:', receivedSignature);
//     console.log('🧾 Expected Signature:', expectedSignature);
        

//     const isValid = crypto.timingSafeEqual(
//         Buffer.from(receivedSignature),
//         Buffer.from(expectedSignature)
//     );

//     if (!isValid) {
//         console.error('❌ Invalid signature');
//         return res.status(401).send('Invalid signature');
//     }

//     console.log('✅ Verified webhook:', req.body);

//     res.json({
//       success: true,
//       message: 'Post Call Data webhook received successfully',
//       timestamp: new Date().toISOString(),
//       data: {
//         headers: req.headers,
//         body: req.body,
//         query: req.query
//       }
//     })
//   } catch (error) {
//     console.error('Error in test webhook:', error)
//     res.status(500).json({
//       success: false,
//       error: error.message
//     })
//   }
// }

/**
 * @memberof -CALLING-WEBHOOKS-module-
 * @name testWebhook
 * @path {POST} /api/calling/test-webhook
 * @description Test webhook endpoint for development
 */
const testWebhook = async (req, res) => {
  try {
    console.log('🧪 Test webhook called:')
    console.log('Headers:', req.headers)
    console.log('Body:', req.body)
    console.log('Query:', req.query)

    res.json({
      success: true,
      message: 'Test webhook received successfully',
      timestamp: new Date().toISOString(),
      data: {
        headers: req.headers,
        body: req.body,
        query: req.query
      }
    })
  } catch (error) {
    console.error('Error in test webhook:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
}

/**
 * @memberof -CALLING-WEBHOOKS-module-
 * @name healthCheck
 * @path {GET} /api/calling/webhook-health
 * @description Webhook system health check
 */
const healthCheck = async (req, res) => {
  try {
    // Check if webhook URL is accessible
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    
    res.json({
      success: true,
      status: 'healthy',
      webhooks: {
        // Twilio webhooks (for fallback calls)
        twilio_voice: `${baseUrl}/api/calling/voice`,
        twilio_status: `${baseUrl}/api/calling/status`,
        twilio_recording: `${baseUrl}/api/calling/recording`,
        twilio_stream: `${baseUrl}/api/calling/stream`,
        
        // ElevenLabs webhooks (for direct calls)
        elevenlabs_events: `${baseUrl}/api/calling/elevenlabs-webhook`,
        
        // Testing
        test: `${baseUrl}/api/calling/test-webhook`
      },
      integration_methods: {
        primary: 'elevenlabs_outbound_api',
        fallback: 'twilio_manual_integration'
      },
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Error in webhook health check:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
}

// Route definitions
router.post("/voice", voiceWebhook); // Twilio voice webhook (fallback)
router.post("/status", statusWebhook); // Twilio status webhook
router.post("/recording", recordingWebhook); // Twilio recording webhook
router.post("/stream", streamWebhook); // Twilio stream webhook (fallback)
router.post("/elevenlabs-webhook", elevenLabsWebhook); // ✅ NEW: ElevenLabs events
router.post("/test-webhook", testWebhook); // Testing
router.get("/webhook-health", healthCheck); // Health check
// router.post("/postCallData", postCallData) // Post Call Data

module.exports = router
