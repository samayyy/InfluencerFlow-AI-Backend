// controllers/calling/calls.js
const express = require('express')
const router = express.Router()
const __constants = require('../../config/constants')
const validationOfAPI = require('../../middlewares/validation')
const callService = require('../../services/calling/callService')
const twilioService = require('../../services/calling/twilioService')
const elevenLabsService = require('../../services/calling/elevenLabsService')
const axios = require('axios')

/**
 * @namespace -CALLING-MODULE-
 * @description API's for initiating and managing calls with ElevenLabs AI agents
 */

/**
 * @memberof -CALLING-module-
 * @name initiateCall
 * @path {POST} /api/calling/initiate
 * @description Initiate an outbound call to a creator
 */

const initiateCallValidationSchema = {
    type: 'object',
    required: true,
    properties: {
      creator_id: { type: 'string', required: true },
      phone_number: { type: 'string', required: true },
      campaign_id: { type: 'string', required: false }, // ✅ NEW: Optional campaign ID
      agent_id: { type: 'string', required: false },
      custom_message: { type: 'string', required: false },
      notes: { type: 'string', required: false }
    }
  }

const initiateCallValidation = (req, res, next) => {
  return validationOfAPI(req, res, next, initiateCallValidationSchema, 'body')
}

const initiateCall = async (req, res) => {
    try {
      const {
        creator_id,
        phone_number,
        campaign_id, // ✅ NEW: Campaign ID for dynamic prompts
        agent_id,
        custom_message,
        notes
      } = req.body
  
      console.log(`🚀 Initiating call to creator ${creator_id} at ${phone_number}${campaign_id ? ` for campaign ${campaign_id}` : ''}`)
  
      // Validate phone number format
      try {
        twilioService.validatePhoneNumber(phone_number)
      } catch (error) {
        return res.sendJson({
          type: __constants.RESPONSE_MESSAGES.INVALID_REQUEST,
          err: [`Invalid phone number format: ${error.message}`]
        })
      }
  
      // Check if agent exists (if provided)
      if (agent_id) {
        try {
          await elevenLabsService.getAgent(agent_id)
        } catch (error) {
          return res.sendJson({
            type: __constants.RESPONSE_MESSAGES.INVALID_REQUEST,
            err: [`Invalid ElevenLabs agent ID: ${error.message}`]
          })
        }
      }
  
      // ✅ NEW: Validate campaign exists if campaign_id is provided
      if (campaign_id) {
        try {
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
  
          const campaignCheck = await pool.query(
            'SELECT id, campaign_name, status FROM campaigns WHERE id = $1 AND is_active = true',
            [campaign_id]
          )
  
          if (campaignCheck.rows.length === 0) {
            await pool.end()
            return res.sendJson({
              type: __constants.RESPONSE_MESSAGES.INVALID_REQUEST,
              err: [`Campaign with ID ${campaign_id} not found or is inactive`]
            })
          }
  
          const campaign = campaignCheck.rows[0]
          
          // Optional: Check if campaign is in a valid status for calling
          if (campaign.status === 'completed' || campaign.status === 'cancelled') {
            await pool.end()
            return res.sendJson({
              type: __constants.RESPONSE_MESSAGES.INVALID_REQUEST,
              err: [`Cannot initiate calls for campaign with status: ${campaign.status}`]
            })
          }
  
          await pool.end()
          console.log(`✅ Campaign validated: ${campaign.campaign_name}`)
        } catch (error) {
          console.error('Error validating campaign:', error)
          return res.sendJson({
            type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
            err: [`Failed to validate campaign: ${error.message}`]
          })
        }
      }
  
      // Initiate the call with campaign context
      const result = await callService.initiateCall({
        creatorId: creator_id,
        phoneNumber: phone_number,
        campaignId: campaign_id, // ✅ NEW: Pass campaign ID
        agentId: agent_id,
        customMessage: custom_message,
        notes: notes,
        initiatedByUserId: req.user?.id || null
      })
  
      // ✅ UPDATED: Enhanced response with campaign context
      const responseData = {
        message: 'Call initiated successfully',
        call_details: result,
        estimated_cost: '$0.02-0.05 per minute',
        next_steps: [
          'Monitor call status via webhooks',
          'Check call details using call ID',
          'Review conversation insights after completion'
        ]
      }
  
      // Add campaign-specific guidance if campaign_id was provided
      if (campaign_id && result.campaignContext) {
        responseData.campaign_context = result.campaignContext
        responseData.dynamic_prompt_info = {
          message: 'Call initiated with campaign-specific AI agent prompt',
          benefits: [
            'Personalized conversation based on campaign details',
            'Brand-specific talking points included',
            'Campaign budget and objectives considered',
            'Creator-specific pricing context applied'
          ]
        }
        responseData.next_steps.unshift('AI agent will discuss the specific campaign opportunity')
      }
  
      res.sendJson({
        type: __constants.RESPONSE_MESSAGES.SUCCESS,
        data: responseData
      })
    } catch (err) {
      console.error('Error initiating call:', err)
      return res.sendJson({
        type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR,
        err: err.message || err
      })
    }
  }
  
  /**
   * @memberof -CALLING-module-
   * @name initiateCampaignCall
   * @path {POST} /api/calling/campaigns/:campaignId/call
   * @description Initiate call to a creator for a specific campaign (convenience endpoint)
   */
  
  const initiateCampaignCallValidationSchema = {
    type: 'object',
    required: true,
    properties: {
      creator_id: { type: 'string', required: true },
      phone_number: { type: 'string', required: true },
      agent_id: { type: 'string', required: false },
      custom_message: { type: 'string', required: false },
      notes: { type: 'string', required: false }
    }
  }
  
  const campaignIdValidationSchema = {
    type: 'object',
    required: true,
    properties: {
      campaignId: { type: 'string', required: true }
    }
  }
  
  const initiateCampaignCallValidation = (req, res, next) => {
    return validationOfAPI(req, res, next, initiateCampaignCallValidationSchema, 'body')
  }
  
  const campaignIdValidation = (req, res, next) => {
    return validationOfAPI(req, res, next, campaignIdValidationSchema, 'params')
  }
  
  const initiateCampaignCall = async (req, res) => {
    try {
      const { campaignId } = req.params
      const {
        creator_id,
        phone_number,
        agent_id,
        custom_message,
        notes
      } = req.body
  
      console.log(`🚀 Initiating campaign call: Campaign ${campaignId} to creator ${creator_id}`)
  
      // Forward to the main initiateCall function with campaign_id
      req.body.campaign_id = campaignId
      
      return await initiateCall(req, res)
    } catch (err) {
      console.error('Error initiating campaign call:', err)
      return res.sendJson({
        type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR,
        err: err.message || err
      })
    }
  }
  
  /**
   * @memberof -CALLING-module-
   * @name getCallDetails
   * @path {GET} /api/calling/calls/:callId
   * @description Get detailed information about a specific call
   */
  
  const callIdValidationSchema = {
    type: 'object',
    required: true,
    properties: {
      callId: { type: 'string', required: true }
    }
  }
  
  const callIdValidation = (req, res, next) => {
    return validationOfAPI(req, res, next, callIdValidationSchema, 'params')
  }
  
  const getCallDetails = async (req, res) => {
    try {
      const { callId } = req.params
  
      const call = await callService.getCallById(callId)
  
      if (!call) {
        return res.sendJson({
          type: __constants.RESPONSE_MESSAGES.NO_RECORDS_FOUND,
          err: [`Call with ID ${callId} not found`]
        })
      }
  
      // Get additional Twilio details if available
      let twilioDetails = null
      if (call.call_sid) {
        try {
          twilioDetails = await twilioService.getCallDetails(call.call_sid)
        } catch (error) {
          console.warn('Could not fetch Twilio details:', error.message)
        }
      }
  
      // Get ElevenLabs conversation details if available
      let conversationDetails = null
      if (call.elevenlabs_conversation_id) {
        try {
          conversationDetails = await elevenLabsService.getConversation(call.elevenlabs_conversation_id)
        } catch (error) {
          console.warn('Could not fetch ElevenLabs conversation:', error.message)
        }
      }
  
      // ✅ NEW: Get campaign details if call was made for a campaign
      let campaignDetails = null
      if (call.campaign_id) {
        try {
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
  
          const campaignResult = await pool.query(
            'SELECT id, campaign_name, campaign_type, status, brand_id FROM campaigns WHERE id = $1',
            [call.campaign_id]
          )
  
          if (campaignResult.rows.length > 0) {
            campaignDetails = campaignResult.rows[0]
          }
  
          await pool.end()
        } catch (error) {
          console.warn('Could not fetch campaign details:', error.message)
        }
      }
  
      res.sendJson({
        type: __constants.RESPONSE_MESSAGES.SUCCESS,
        data: {
          call: call,
          campaign_details: campaignDetails, // ✅ NEW: Include campaign context
          twilio_details: twilioDetails,
          conversation_details: conversationDetails,
          insights: {
            call_outcome: call.call_outcome,
            sentiment_score: call.sentiment_score,
            follow_up_required: call.follow_up_required,
            key_topics: call.key_topics
          }
        }
      })
    } catch (err) {
      console.error('Error getting call details:', err)
      return res.sendJson({
        type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR,
        err: err.message || err
      })
    }
  }
  
  /**
   * @memberof -CALLING-module-
   * @name getAllCalls
   * @path {GET} /api/calling/calls
   * @description Get list of calls with filtering and pagination
   */
  
  const getCallsValidationSchema = {
    type: 'object',
    required: false,
    properties: {
      page: { type: 'string', required: false },
      limit: { type: 'string', required: false },
      creator_id: { type: 'string', required: false },
      campaign_id: { type: 'string', required: false }, // ✅ NEW: Filter by campaign
      status: { type: 'string', required: false },
      outcome: { type: 'string', required: false },
      start_date: { type: 'string', required: false },
      end_date: { type: 'string', required: false }
    }
  }
  const sendDocuSign = async (req, res) => {
    try {
        const callId = req.params.id
        console.log(callId)
        const callDetails = await axios.get(`${process.env.BASE_URL}/api/calling/calls/${callId}`)
        console.log(callDetails.data.data)
        const data = await axios.post(
            `${process.env.BASE_URL}/api/docusign/generateAndSend`,
            {
              creatorId: callDetails.data.data.call.creator_id,
              transcript: callDetails.data.data.conversation_details.transcript[0].message
            },
            {
              headers: {
                Authorization: `Bearer ${process.env.DOCUSIGN_ACCESS_TOKEN}`
              }
            }
          )
          
        res.sendJson({
            type: __constants.RESPONSE_MESSAGES.SUCCESS,
            data: data
        })
        // if(callDetails.data.data.conversationDetails.analysis.call_successful == 'succesful') {
        //     const data = await axios.post('http://localhost:3005/api/docusign/generateAndSend', {
        //         creatorId: callDetails.data.data.call.creator_id,
        //         transcript: callDetails.data.data.conversationDetails.transcript[0].message
        //     })
        //     res.sendJson({
        //         type: __constants.RESPONSE_MESSAGES.SUCCESS,
        //         data: data
        //     })
        // }
        // res.sendJson({
        //     type: __constants.RESPONSE_MESSAGES.SUCCESS,
        //     data: `Onboarding Creator with id ${callDetails.data.data.call.creator_id} was Unsuccesful`
        // })

    } catch (err) {
        console.error('Error sending document:', err)
        return res.sendJson({
          type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR,
          err: err.message || err
        })
      }
  }
  
  const getCallsValidation = (req, res, next) => {
    return validationOfAPI(req, res, next, getCallsValidationSchema, 'query')
  }


const getAllCalls = async (req, res) => {
    try {
      const filters = {}
      const pagination = {}
  
      // Extract filters
      if (req.query.creator_id) filters.creatorId = req.query.creator_id
      if (req.query.campaign_id) filters.campaignId = req.query.campaign_id
      if (req.query.status) filters.status = req.query.status
      if (req.query.outcome) filters.outcome = req.query.outcome
      if (req.query.start_date) filters.startDate = req.query.start_date
      if (req.query.end_date) filters.endDate = req.query.end_date
      if (req.query.call_method) filters.callMethod = req.query.call_method
  
      // ✅ NEW: Handle conversation details parameter
      if (req.query.include_conversation_details !== undefined) {
        // Convert string to boolean
        filters.includeConversationDetails = req.query.include_conversation_details !== 'false'
      }
  
      // Extract pagination
      if (req.query.page) pagination.page = parseInt(req.query.page)
      if (req.query.limit) pagination.limit = parseInt(req.query.limit)
  
      // ✅ PERFORMANCE WARNING: Log if including conversation details with large limit
      if (filters.includeConversationDetails !== false && pagination.limit > 50) {
        console.warn(`⚠️ Large request: fetching conversation details for ${pagination.limit} calls may be slow`)
      }
  
      const startTime = Date.now();
      const result = await callService.getCalls(filters, pagination)
      const endTime = Date.now();
  
      // ✅ NEW: Enhanced response with performance info
      const response = {
        type: __constants.RESPONSE_MESSAGES.SUCCESS,
        data: {
          calls: result.calls,
          pagination: result.pagination,
          filters_applied: filters,
          campaign_stats: result.campaign_stats,
          conversation_details_included: result.conversation_details_included,
          performance: {
            query_time_ms: endTime - startTime,
            calls_returned: result.calls.length,
            ...result.performance_info
          }
        }
      }
  
      // ✅ NEW: Add usage tips in response
      if (!result.conversation_details_included) {
        response.data.tip = "Add ?include_conversation_details=true to get Twilio and ElevenLabs conversation details for each call"
      }
  
      res.sendJson(response)
    } catch (err) {
      console.error('Error getting calls:', err)
      return res.sendJson({
        type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR,
        err: err.message || err
      })
    }
  }
  
  /**
   * @memberof -CALLING-module-
   * @name getCampaignCalls
   * @path {GET} /api/calling/campaigns/:campaignId/calls
   * @description Get all calls for a specific campaign
   */
  
  const getCampaignCalls = async (req, res) => {
    try {
      const { campaignId } = req.params
      const pagination = {}
  
      // Extract pagination
      if (req.query.page) pagination.page = parseInt(req.query.page)
      if (req.query.limit) pagination.limit = parseInt(req.query.limit)
  
      const filters = { campaignId: campaignId }
  
      const result = await callService.getCalls(filters, pagination)
  
      // ✅ NEW: Add campaign summary to response
      let campaignSummary = null
      if (result.calls.length > 0) {
        try {
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
  
          const campaignResult = await pool.query(
            'SELECT id, campaign_name, campaign_type, status FROM campaigns WHERE id = $1',
            [campaignId]
          )
  
          if (campaignResult.rows.length > 0) {
            campaignSummary = campaignResult.rows[0]
          }
  
          await pool.end()
        } catch (error) {
          console.warn('Could not fetch campaign summary:', error.message)
        }
      }
  
      res.sendJson({
        type: __constants.RESPONSE_MESSAGES.SUCCESS,
        data: {
          campaign_summary: campaignSummary,
          calls: result.calls,
          pagination: result.pagination,
          filters_applied: filters
        }
      })
    } catch (err) {
      console.error('Error getting campaign calls:', err)
      return res.sendJson({
        type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR,
        err: err.message || err
      })
    }
  }

/**
 * @memberof -CALLING-module-
 * @name terminateCall
 * @path {POST} /api/calling/calls/:callId/terminate
 * @description Terminate an active call
 */

const terminateCall = async (req, res) => {
  try {
    const { callId } = req.params

    const result = await callService.terminateCall(callId)

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: result
    })
  } catch (err) {
    console.error('Error terminating call:', err)
    return res.sendJson({
      type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: err.message || err
    })
  }
}

/**
 * @memberof -CALLING-module-
 * @name getCallRecordings
 * @path {GET} /api/calling/calls/:callId/recordings
 * @description Get recordings for a specific call
 */

const getCallRecordings = async (req, res) => {
  try {
    const { callId } = req.params

    const recordings = await callService.getCallRecordings(callId)

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: recordings
    })
  } catch (err) {
    console.error('Error getting call recordings:', err)
    return res.sendJson({
      type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: err.message || err
    })
  }
}

/**
 * @memberof -CALLING-module-
 * @name getCallAnalytics
 * @path {GET} /api/calling/analytics
 * @description Get call analytics and performance metrics
 */

const analyticsValidationSchema = {
  type: 'object',
  required: false,
  properties: {
    start_date: { type: 'string', required: false },
    end_date: { type: 'string', required: false },
    creator_id: { type: 'string', required: false }
  }
}

const analyticsValidation = (req, res, next) => {
  return validationOfAPI(req, res, next, analyticsValidationSchema, 'query')
}

const getCallAnalytics = async (req, res) => {
  try {
    const filters = {}

    if (req.query.start_date) filters.startDate = req.query.start_date
    if (req.query.end_date) filters.endDate = req.query.end_date
    if (req.query.creator_id) filters.creatorId = req.query.creator_id

    const analytics = await callService.getCallAnalytics(filters)

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        analytics: analytics,
        filters_applied: filters,
        generated_at: new Date().toISOString()
      }
    })
  } catch (err) {
    console.error('Error getting call analytics:', err)
    return res.sendJson({
      type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: err.message || err
    })
  }
}

/**
 * @memberof -CALLING-module-
 * @name getConversationInsights
 * @path {GET} /api/calling/calls/:callId/insights
 * @description Get AI conversation insights for a completed call
 */

const getConversationInsights = async (req, res) => {
  try {
    const { callId } = req.params

    const call = await callService.getCallById(callId)

    if (!call) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.NO_RECORDS_FOUND,
        err: [`Call with ID ${callId} not found`]
      })
    }

    if (!call.elevenlabs_conversation_id) {
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.NO_RECORDS_FOUND,
        data: {
          message: 'No conversation data available for this call',
          call_status: call.status,
          call_outcome: call.call_outcome
        }
      })
    }

    // Get detailed conversation analysis
    const insights = await elevenLabsService.analyzeConversation(call.elevenlabs_conversation_id)

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        call_id: callId,
        conversation_id: call.elevenlabs_conversation_id,
        insights: insights,
        call_summary: {
          duration_seconds: call.duration_seconds,
          status: call.status,
          outcome: call.call_outcome,
          cost_usd: call.cost_usd
        }
      }
    })
  } catch (err) {
    console.error('Error getting conversation insights:', err)
    return res.sendJson({
      type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: err.message || err
    })
  }
}

/**
 * @memberof -CALLING-module-
 * @name healthCheck
 * @path {GET} /api/calling/health
 * @description Health check for the calling system
 */

const healthCheck = async (req, res) => {
  try {
    const health = await callService.healthCheck()

    const responseType = health.status === 'healthy'
      ? __constants.RESPONSE_MESSAGES.SUCCESS
      : __constants.RESPONSE_MESSAGES.FAILED

    res.sendJson({
      type: responseType,
      data: health
    })
  } catch (err) {
    console.error('Error in calling health check:', err)
    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: err.message || err
    })
  }
}

/**
 * @memberof -CALLING-module-
 * @name getElevenLabsAgents
 * @path {GET} /api/calling/agents
 * @description Get available ElevenLabs AI agents
 */

const getElevenLabsAgents = async (req, res) => {
  try {
    const agents = await elevenLabsService.getAgents()

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        agents: agents,
        default_agent_id: process.env.ELEVENLABS_AGENT_ID,
        total_agents: agents?.length || 0
      }
    })
  } catch (err) {
    console.error('Error getting ElevenLabs agents:', err)
    return res.sendJson({
      type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: err.message || err
    })
  }
}

/**
 * @memberof -CALLING-module-
 * @name testCallSetup
 * @path {POST} /api/calling/test
 * @description Test call system setup without making actual call
 */

const testCallSetup = async (req, res) => {
  try {
    const { phone_number, agent_id } = req.body

    const tests = {
      phone_validation: false,
      twilio_connection: false,
      elevenlabs_connection: false,
      agent_validation: false,
      database_connection: false
    }

    const results = []

    // Test phone number validation
    try {
      const validatedNumber = twilioService.validatePhoneNumber(phone_number || '+1234567890')
      tests.phone_validation = true
      results.push(`✅ Phone validation: ${validatedNumber}`)
    } catch (error) {
      results.push(`❌ Phone validation failed: ${error.message}`)
    }

    // Test Twilio connection
    try {
      const twilioHealth = await twilioService.healthCheck()
      tests.twilio_connection = twilioHealth.status === 'healthy'
      results.push(`✅ Twilio: ${twilioHealth.status}`)
    } catch (error) {
      results.push(`❌ Twilio connection failed: ${error.message}`)
    }

    // Test ElevenLabs connection
    try {
      const elevenLabsHealth = await elevenLabsService.healthCheck()
      tests.elevenlabs_connection = elevenLabsHealth.status === 'healthy'
      results.push(`✅ ElevenLabs: ${elevenLabsHealth.status}`)
    } catch (error) {
      results.push(`❌ ElevenLabs connection failed: ${error.message}`)
    }

    // Test agent validation
    if (agent_id) {
      try {
        await elevenLabsService.getAgent(agent_id)
        tests.agent_validation = true
        results.push(`✅ Agent validation: ${agent_id}`)
      } catch (error) {
        results.push(`❌ Agent validation failed: ${error.message}`)
      }
    }

    // Test database connection
    try {
      const dbHealth = await callService.healthCheck()
      tests.database_connection = dbHealth.status === 'healthy'
      results.push(`✅ Database: ${dbHealth.status}`)
    } catch (error) {
      results.push(`❌ Database connection failed: ${error.message}`)
    }

    const allTestsPassed = Object.values(tests).every(test => test === true)

    res.sendJson({
      type: allTestsPassed ? __constants.RESPONSE_MESSAGES.SUCCESS : __constants.RESPONSE_MESSAGES.FAILED,
      data: {
        system_ready: allTestsPassed,
        test_results: tests,
        details: results,
        next_steps: allTestsPassed
          ? ['System ready for calls', 'Use /api/calling/initiate to make calls']
          : ['Fix failed components', 'Run test again']
      }
    })
  } catch (err) {
    console.error('Error in test setup:', err)
    return res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: err.message || err
    })
  }
}

// Route definitions
router.post('/initiate', initiateCallValidation, initiateCall)

// ✅ NEW: Campaign-specific call initiation endpoint
router.post('/campaigns/:campaignId/call', 
  campaignIdValidation, 
  initiateCampaignCallValidation, 
  initiateCampaignCall
)

// ✅ NEW: Get calls for a specific campaign
router.get('/campaigns/:campaignId/calls', 
  campaignIdValidation, 
  getCampaignCalls
)
// router.post('/initiate', initiateCallValidation, initiateCall)
router.get('/calls/:callId', callIdValidation, getCallDetails)
router.get('/sendToDocuSign/:id', sendDocuSign)
router.get('/calls', getCallsValidation, getAllCalls)
router.post('/calls/:callId/terminate', callIdValidation, terminateCall)
router.get('/calls/:callId/recordings', callIdValidation, getCallRecordings)
router.get('/calls/:callId/insights', callIdValidation, getConversationInsights)
router.get('/analytics', analyticsValidation, getCallAnalytics)
router.get('/agents', getElevenLabsAgents)
router.get('/health', healthCheck)
router.post('/test', testCallSetup)

module.exports = router
