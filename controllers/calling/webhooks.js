// controllers/calling/webhooks.js
const express = require('express')
const router = express.Router()
const __constants = require('../../config/constants')
const twilioService = require('../../services/calling/twilioService')
const callService = require('../../services/calling/callService')
const elevenLabsService = require('../../services/calling/elevenLabsService')

/**
 * @namespace -CALLING-WEBHOOKS-MODULE-
 * @description Webhook endpoints for Twilio call events and voice handling
 */

/**
 * @memberof -CALLING-WEBHOOKS-module-
 * @name voiceWebhook
 * @path {POST} /api/calling/voice
 * @description Handle incoming voice calls and connect to ElevenLabs
 */
const voiceWebhook = async (req, res) => {
  try {
    const { CallSid, From, To, CallStatus } = req.body
    const { callId, creatorId, agentId, customMessage } = req.query

    console.log('🎙️ Voice webhook received:', {
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

    // Create or get conversation from ElevenLabs
    let conversationData = null
    let elevenlabsSuccess = false

    if (agentId && creatorId) {
      try {
        conversationData = await elevenLabsService.createConversation({
          agentId: agentId,
          creatorId: creatorId,
          phoneNumber: From,
          callContext: 'outbound_sales',
          metadata: {
            call_sid: CallSid,
            call_id: callId
          }
        })

        elevenlabsSuccess = conversationData && conversationData.status !== 'fallback_created'

        if (elevenlabsSuccess) {
          console.log(`✅ ElevenLabs conversation created: ${conversationData.conversationId}`)
        } else {
          console.log(`⚠️ ElevenLabs fallback mode: ${conversationData?.note || 'Unknown issue'}`)
        }
      } catch (error) {
        console.error('Failed to create ElevenLabs conversation:', error)
        // Continue without ElevenLabs - use basic TwiML response
        elevenlabsSuccess = false
      }
    }

    // Generate TwiML response
    let twimlOptions

    if (elevenlabsSuccess && conversationData) {
      // Full ElevenLabs integration
      twimlOptions = {
        agentId: agentId,
        creatorId: creatorId,
        customMessage: customMessage,
        connectToAgent: true,
        conversationId: conversationData.conversationId
      }
    } else {
      // Fallback to basic message (for development/testing)
      twimlOptions = {
        agentId: agentId,
        creatorId: creatorId,
        customMessage: customMessage || 'Hello! Thank you for testing our calling system. This is a development test call. We will be in touch soon with more information about collaboration opportunities.',
        connectToAgent: false,
        fallbackMode: true
      }
    }

    const twimlResponse = twilioService.generateVoiceTwiML(twimlOptions)

    // Update call status if we have call ID
    if (callId && CallSid) {
      try {
        await callService.updateCallStatus(CallSid, 'in-progress', {
          elevenlabsConversationId: conversationData?.conversationId,
          from: From,
          to: To
        })
      } catch (error) {
        console.error('Failed to update call status:', error)
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
        twilio_status: CallStatus
      })

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
          // This will be handled in the callService.updateCallStatus if conversation ID is available
          console.log(`🔍 Processing completed call insights for ${CallSid}`)
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
 * @name streamWebhook
 * @path {POST} /api/calling/stream
 * @description Handle ElevenLabs stream events
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
    const webhookUrl = `${req.protocol}://${req.get('host')}/api/calling/test-webhook`

    res.json({
      success: true,
      status: 'healthy',
      webhooks: {
        voice: `${req.protocol}://${req.get('host')}/api/calling/voice`,
        status: `${req.protocol}://${req.get('host')}/api/calling/status`,
        recording: `${req.protocol}://${req.get('host')}/api/calling/recording`,
        stream: `${req.protocol}://${req.get('host')}/api/calling/stream`,
        test: webhookUrl
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
router.post('/voice', voiceWebhook)
router.post('/status', statusWebhook)
router.post('/recording', recordingWebhook)
router.post('/stream', streamWebhook)
router.post('/test-webhook', testWebhook)
router.get('/webhook-health', healthCheck)

module.exports = router
