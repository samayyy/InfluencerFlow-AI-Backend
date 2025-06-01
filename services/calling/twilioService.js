// services/calling/twilioService.js
const twilio = require('twilio')
const __config = require('../../config')

class TwilioService {
  constructor () {
    this.client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    )
    this.fromNumber = process.env.TWILIO_PHONE_NUMBER
    this.webhookBaseUrl = process.env.WEBHOOK_BASE_URL || __config.base_url
  }

  // Validate phone number format
  validatePhoneNumber (phoneNumber) {
    // Remove all non-digit characters except +
    const cleaned = phoneNumber.replace(/[^\d+]/g, '')

    // Check if it's a valid format
    const phoneRegex = /^\+?[1-9]\d{1,14}$/
    if (!phoneRegex.test(cleaned)) {
      throw new Error('Invalid phone number format')
    }

    // Ensure it starts with + for international format
    return cleaned.startsWith('+') ? cleaned : `+1${cleaned}`
  }

  // Initiate outbound call with ElevenLabs integration
  async initiateCall (phoneNumber, options = {}) {
    try {
      const validatedNumber = this.validatePhoneNumber(phoneNumber)

      const {
        creatorId,
        callId,
        agentId,
        customMessage,
        timeout = 30,
        recordCall = true
      } = options

      console.log(`📞 Initiating call to ${validatedNumber}`)

      const callParams = {
        to: validatedNumber,
        from: this.fromNumber,
        timeout: timeout,
        statusCallback: `${this.webhookBaseUrl}/api/calling/status`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        statusCallbackMethod: 'POST'
      }

      // Add recording if enabled
      if (recordCall) {
        callParams.record = true
        callParams.recordingStatusCallback = `${this.webhookBaseUrl}/api/calling/recording`
        callParams.recordingStatusCallbackEvent = ['completed']
      }

      // Set webhook URL for call flow
      callParams.url = `${this.webhookBaseUrl}/api/calling/voice?callId=${callId}&creatorId=${creatorId}&agentId=${agentId}`
      callParams.method = 'POST'

      const call = await this.client.calls.create(callParams)

      console.log(`✅ Call initiated with SID: ${call.sid}`)

      return {
        success: true,
        callSid: call.sid,
        status: call.status,
        direction: call.direction,
        to: call.to,
        from: call.from
      }
    } catch (error) {
      console.error('Error initiating call:', error)
      throw new Error(`Twilio call failed: ${error.message}`)
    }
  }

  // Generate TwiML for voice webhook
  generateVoiceTwiML (options = {}) {
    const {
      agentId,
      creatorId,
      customMessage,
      connectToAgent = true,
      fallbackMode = false
    } = options

    const twiml = new twilio.twiml.VoiceResponse()

    // Always play custom message if provided
    if (customMessage) {
      twiml.say({
        voice: 'alice',
        language: 'en-US'
      }, customMessage)
    }

    if (connectToAgent && agentId && !fallbackMode) {
      // Connect to ElevenLabs stream
      const connect = twiml.connect()
      const stream = connect.stream({
        url: `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${agentId}`,
        name: 'ElevenLabsAgent'
      })

      // Add parameters for ElevenLabs
      stream.parameter({
        name: 'creator_id',
        value: creatorId || 'unknown'
      })

      stream.parameter({
        name: 'call_context',
        value: 'outbound_sales'
      })
    } else {
      // Fallback message or when ElevenLabs is not available
      const fallbackMessage = fallbackMode
        ? 'Thank you for your time. Our team will follow up with you soon via email with more details about potential collaboration opportunities. Have a great day!'
        : 'Thank you for your time. We will follow up with you soon. Goodbye!'

      twiml.say({
        voice: 'alice',
        language: 'en-US'
      }, fallbackMessage)

      twiml.hangup()
    }

    return twiml.toString()
  }

  // Get call details
  async getCallDetails (callSid) {
    try {
      const call = await this.client.calls(callSid).fetch()
      return {
        sid: call.sid,
        status: call.status,
        direction: call.direction,
        from: call.from,
        to: call.to,
        duration: call.duration,
        price: call.price,
        priceUnit: call.priceUnit,
        startTime: call.startTime,
        endTime: call.endTime,
        answeredBy: call.answeredBy
      }
    } catch (error) {
      console.error('Error fetching call details:', error)
      throw new Error(`Failed to fetch call details: ${error.message}`)
    }
  }

  // Get call recordings
  async getCallRecordings (callSid) {
    try {
      const recordings = await this.client.recordings.list({
        callSid: callSid,
        limit: 10
      })

      return recordings.map(recording => ({
        sid: recording.sid,
        duration: recording.duration,
        status: recording.status,
        uri: recording.uri,
        mediaUrl: `https://api.twilio.com${recording.uri.replace('.json', '.mp3')}`,
        dateCreated: recording.dateCreated
      }))
    } catch (error) {
      console.error('Error fetching recordings:', error)
      throw new Error(`Failed to fetch recordings: ${error.message}`)
    }
  }

  // Hangup active call
  async hangupCall (callSid) {
    try {
      const call = await this.client.calls(callSid).update({
        status: 'completed'
      })

      return {
        success: true,
        status: call.status,
        message: 'Call terminated successfully'
      }
    } catch (error) {
      console.error('Error hanging up call:', error)
      throw new Error(`Failed to hangup call: ${error.message}`)
    }
  }

  // Get account call logs
  async getCallLogs (options = {}) {
    try {
      const {
        limit = 20,
        startDate,
        endDate,
        status,
        to,
        from
      } = options

      const filters = { limit }

      if (startDate) filters.startTimeAfter = new Date(startDate)
      if (endDate) filters.startTimeBefore = new Date(endDate)
      if (status) filters.status = status
      if (to) filters.to = to
      if (from) filters.from = from

      const calls = await this.client.calls.list(filters)

      return calls.map(call => ({
        sid: call.sid,
        status: call.status,
        direction: call.direction,
        from: call.from,
        to: call.to,
        duration: call.duration,
        price: call.price,
        startTime: call.startTime,
        endTime: call.endTime
      }))
    } catch (error) {
      console.error('Error fetching call logs:', error)
      throw new Error(`Failed to fetch call logs: ${error.message}`)
    }
  }

  // Validate webhook signature for security
  validateWebhookSignature (signature, url, params) {
    try {
      return twilio.validateRequest(
        process.env.TWILIO_AUTH_TOKEN,
        signature,
        url,
        params
      )
    } catch (error) {
      console.error('Webhook signature validation failed:', error)
      return false
    }
  }

  // Health check
  async healthCheck () {
    try {
      // Try to fetch account details
      const account = await this.client.api.accounts.list({ limit: 1 })

      return {
        status: 'healthy',
        service: 'twilio',
        accountSid: process.env.TWILIO_ACCOUNT_SID?.slice(-4),
        fromNumber: this.fromNumber,
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        service: 'twilio',
        error: error.message,
        timestamp: new Date().toISOString()
      }
    }
  }
}

module.exports = new TwilioService()
