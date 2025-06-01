// services/calling/callService.js
const { Pool } = require('pg')
const __config = require('../../config')
const twilioService = require('./twilioService')
const elevenLabsService = require('./elevenLabsService')
const axios = require('axios')

class CallService {
  constructor () {
    this.pool = new Pool({
      user: __config.postgres.user,
      host: __config.postgres.host,
      database: __config.postgres.database,
      password: __config.postgres.password,
      port: __config.postgres.port,
      ssl: { rejectUnauthorized: false }
    })
  }

  // ✅ UPDATED: Use ElevenLabs outbound call API directly with campaign-based prompts
  async initiateCall(callData) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN')

      const {
        creatorId,
        phoneNumber,
        campaignId, // ✅ NEW: Campaign ID for dynamic prompts
        agentId,
        customMessage,
        notes,
        initiatedByUserId
      } = callData

      // Validate required fields
      if (!creatorId || !phoneNumber) {
        throw new Error('Creator ID and phone number are required')
      }

      // Check if creator exists
      const creatorQuery = 'SELECT id, creator_name, email FROM creators WHERE id = $1'
      const creatorResult = await client.query(creatorQuery, [creatorId])

      if (creatorResult.rows.length === 0) {
        throw new Error(`Creator with ID ${creatorId} not found`)
      }

      const creator = creatorResult.rows[0]

      // ✅ NEW: Fetch campaign data if campaignId is provided
      let campaignData = null;
      let creatorRecommendationData = null;
      let dynamicPrompt = null;

      if (campaignId) {
        const campaignQuery = `
          SELECT c.*, b.brand_name, b.industry, p.product_name, p.category as product_category
          FROM campaigns c
          JOIN brands b ON c.brand_id = b.id
          LEFT JOIN products p ON c.product_id = p.id
          WHERE c.id = $1 AND c.is_active = true
        `;
        
        const campaignResult = await client.query(campaignQuery, [campaignId]);
        
        if (campaignResult.rows.length > 0) {
          campaignData = campaignResult.rows[0];
          
          // Parse ai_recommended_influencers to find this specific creator's data
          if (campaignData.ai_recommended_influencers) {
            const aiRecommendations = typeof campaignData.ai_recommended_influencers === 'string' 
              ? JSON.parse(campaignData.ai_recommended_influencers)
              : campaignData.ai_recommended_influencers;
            
            // Find the creator in recommendations
            if (aiRecommendations.recommendations) {
              console.log("Creator", creatorId)
              console.log("Recommendations found", aiRecommendations.recommendations[0].creator_data)
              creatorRecommendationData = aiRecommendations.recommendations.find(rec => {
                console.log('Checking recommendation:', rec.creator_data.id);
                return rec.creator_data && rec.creator_data.id === creatorId;
              });
            }
          }
          
          // Generate dynamic system prompt based on campaign data
          dynamicPrompt = await this.generateCampaignSystemPrompt(
            campaignData, 
            creator, 
            creatorRecommendationData
          );
          console.log("DYNAMIC PROMPT", dynamicPrompt)
        }
      }

      console.log(`🚀 Initiating ElevenLabs outbound call to ${creator.creator_name}`);
      if (campaignData) {
        console.log(`📋 Campaign: ${campaignData.campaign_name}`);
      }

      let elevenLabsResponse;
      let callMethod = 'elevenlabs';

      try {
        // Try ElevenLabs outbound call first with dynamic prompt
        elevenLabsResponse = await elevenLabsService.initiateOutboundCall({
          agentId: agentId || process.env.ELEVENLABS_AGENT_ID,
          phoneNumber: phoneNumber,
          customInstructions: customMessage,
          dynamicPrompt: dynamicPrompt, // ✅ NEW: Pass dynamic prompt
          metadata: {
            creator_id: creatorId,
            creator_name: creator.creator_name,
            campaign_id: campaignId,
            campaign_name: campaignData?.campaign_name,
            initiated_by: initiatedByUserId
          },
          creatorPricing: creatorRecommendationData?.estimated_cost // ✅ NEW: Pass pricing data
        });

        console.log(`✅ ElevenLabs outbound call initiated:`, elevenLabsResponse);

      } catch (elevenLabsError) {
        console.warn(`⚠️ ElevenLabs outbound call failed, falling back to Twilio: ${elevenLabsError.message}`);
        
        // Fallback to manual Twilio + ElevenLabs integration
        callMethod = 'twilio_fallback';
        
        elevenLabsResponse = await twilioService.initiateCall(phoneNumber, {
          creatorId,
          campaignId, // ✅ NEW: Pass campaign ID to Twilio fallback
          agentId: agentId || process.env.ELEVENLABS_AGENT_ID,
          customMessage,
          timeout: 30,
          recordCall: true
        });
      }

      // Create call record in database
      const insertCallQuery = `
        INSERT INTO calls (
          creator_id, campaign_id, phone_number, status, call_sid, 
          elevenlabs_conversation_id, call_method, notes, initiated_by_user_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, created_at
      `

      const callResult = await client.query(insertCallQuery, [
        creatorId,
        campaignId || null, // ✅ NEW: Store campaign ID
        phoneNumber,
        'initiated',
        elevenLabsResponse.callSid || elevenLabsResponse.callSid || null,
        elevenLabsResponse.conversationId || null,
        callMethod,
        notes || `Outbound call to ${creator.creator_name} via ${callMethod}${campaignData ? ` for campaign: ${campaignData.campaign_name}` : ''}`,
        initiatedByUserId
      ])

      const callId = callResult.rows[0].id

      // Log initial event with campaign context
      await this.logCallEvent(client, callId, 'initiated', {
        creator_name: creator.creator_name,
        phone_number: phoneNumber,
        agent_id: agentId || process.env.ELEVENLABS_AGENT_ID,
        call_method: callMethod,
        campaign_context: campaignData ? {
          campaign_id: campaignId,
          campaign_name: campaignData.campaign_name,
          campaign_type: campaignData.campaign_type,
          brand_name: campaignData.brand_name
        } : null,
        dynamic_prompt_used: !!dynamicPrompt,
        elevenlabs_response: elevenLabsResponse
      });

      await client.query("COMMIT");

      console.log(`✅ Call record created: ID ${callId}, Method: ${callMethod}`);

      return {
        success: true,
        callId: callId,
        callSid: elevenLabsResponse.callSid,
        conversationId: elevenLabsResponse.conversationId,
        status: 'initiated',
        callMethod: callMethod,
        message: `Call initiated to ${creator.creator_name} via ${callMethod}${campaignData ? ` for campaign: ${campaignData.campaign_name}` : ''}`,
        creatorName: creator.creator_name,
        phoneNumber: phoneNumber,
        campaignContext: campaignData ? {
          campaign_name: campaignData.campaign_name,
          brand_name: campaignData.brand_name
        } : null,
        elevenLabsResponse: elevenLabsResponse
      };

    } catch (error) {
      await client.query('ROLLBACK')
      console.error('Error initiating call:', error)
      throw error
    } finally {
      client.release()
    }
  }

  // ✅ NEW: Generate dynamic system prompt based on campaign data
  async generateCampaignSystemPrompt(campaignData, creator, creatorRecommendationData) {
    try {
      const {
        campaign_name,
        campaign_type,
        description,
        objectives,
        budget,
        brand_name,
        industry,
        product_name,
        product_category
      } = campaignData;

      console.log("creatorRecommendationData", creatorRecommendationData)

      // Extract pricing information from creator recommendation data
      let suggestedPricing = '$500-$1000'; // Default range
      if (creatorRecommendationData?.estimated_cost) {
        const cost = creatorRecommendationData.estimated_cost;
        if (cost.cost && cost.cost !== 'Contact for pricing') {
          suggestedPricing = `$${Math.round(cost.cost * 0.8)}-$${Math.round(cost.cost * 1.2)}`;
        }
      }

      // Generate campaign-specific details for the prompt
      const campaignDetails = [];

      const budgetFit = creatorRecommendationData.score_breakdown.budget_fit
    //   const contentFit = creatorRecommendationData.score_breakdown.content_fit
      const contentFit = 0.7

      if(contentFit >= 0.7) {
        suggestedPricing = `$${Math.round(creatorRecommendationData.estimated_cost.cost)}-$${Math.round(creatorRecommendationData.estimated_cost.cost * 1.5)}`;
      }

      
      if (campaign_type === 'sponsored_post') {
        campaignDetails.push('we\'re looking for sponsored social media posts');
      } else if (campaign_type === 'product_review') {
        campaignDetails.push('we\'re seeking authentic product reviews');
      } else if (campaign_type === 'brand_ambassador') {
        campaignDetails.push('we\'re interested in a long-term brand ambassador partnership');
      } else if (campaign_type === 'event_coverage') {
        campaignDetails.push('we need event coverage and documentation');
      } else {
        campaignDetails.push('we have a collaboration opportunity');
      }

      if (product_name) {
        campaignDetails.push(`featuring our ${product_name}${product_category ? ` in the ${product_category} category` : ''}`);
      }

      if (description) {
        campaignDetails.push(`The campaign focuses on: ${description.substring(0, 100)}${description.length > 100 ? '...' : ''}`);
      }

      // Build the dynamic prompt
      const dynamicPrompt = `You are Lynda, a street-smart, charismatic creator outreach specialist for ${brand_name}, a ${industry || 'leading'} brand. You specialize in onboarding Instagram and YouTube creators for paid brand collaborations.

Current Campaign: "${campaign_name}"
Campaign Type: ${campaign_type.replace('_', ' ')}
${campaignDetails.length > 0 ? 'Campaign Details: ' + campaignDetails.join(', ') + '.' : ''}
Budget Fit Score: ${budgetFit}
Content Fit Score: ${contentFit}

You're calling ${creator.creator_name} because they're a perfect fit for this campaign based on their content style and audience demographics.

Your conversation style: casual, sharp, and confident—with zero pitch-talk or robotic scripts. Build trust fast by relating to creators' content grind and asking chill, qualifying questions like "You open to collabs these days?" or "What's your usual ballpark for something like this?"

Budget Range: ${suggestedPricing} (never state this upfront—let them share their rates first)
${objectives ? `Campaign Goals: ${objectives.substring(0, 150)}${objectives.length > 150 ? '...' : ''}` : ''}. Be strict with the budget.

Negotiation style: relaxed, real-talk approach. "Totally hear you—thing is, the brand's budget for this tier is more like X, but I'm tryna make it work."

Your goal: get them excited about working with ${brand_name}, understand their rates and availability, and if there's mutual interest, send over campaign details and contracts via email. It is your responsibility to close all negotiations on the call itself. If the creator is not complying within the budget range, then go back and forth with them until you reach a middle ground that works for both parties. If it doesn't work out, then politely decline and thank them for their time. If it works out, then send them the campaign details and contract via email. No need to ask them for their email id.

If they're not feeling it, keep it light: "All good—maybe we circle back next time, yeah?"

Key points to cover:
- Their content quality and audience fit
- ${campaign_type.replace('_', ' ')} opportunity details
- Timeline and deliverables
- Compensation discussion
- Next steps if interested

Never overpromise, never overexplain, and never repeat yourself—just smooth, real negotiation that respects both ${brand_name}'s goals and ${creator.creator_name}'s value.`;

      return dynamicPrompt;

    } catch (error) {
      console.error('Error generating campaign system prompt:', error);
      
      // Return default prompt as fallback
      return `You are Lynda, a street-smart, charismatic creator outreach specialist for a top influencer marketing agency. You specialize in onboarding Instagram and YouTube creators for paid brand collaborations. You're calling ${creator.creator_name} about a collaboration opportunity. Keep it casual, professional, and focused on finding mutual value.`;
    }
  }
  
  // Update call status
  async updateCallStatus (callSid, status, additionalData = {}) {
    const client = await this.pool.connect()

    try {
      // Get call details from Twilio if it's a Twilio call
      let twilioCallDetails = null;
      try {
        twilioCallDetails = await twilioService.getCallDetails(callSid)
      } catch (error) {
        console.warn('Could not fetch Twilio call details (might be ElevenLabs-only call):', error.message);
      }

      // Update call record
      const updateFields = ['status = $2', 'updated_at = NOW()']
      const values = [callSid, status]
      let paramIndex = 3

      if (twilioCallDetails) {
        if (twilioCallDetails.duration) {
          updateFields.push(`duration_seconds = $${paramIndex}`)
          values.push(parseInt(twilioCallDetails.duration))
          paramIndex++
        }

        if (twilioCallDetails.price) {
          updateFields.push(`cost_usd = $${paramIndex}`)
          values.push(parseFloat(twilioCallDetails.price))
          paramIndex++
        }
      }

      if (additionalData.outcome) {
        updateFields.push(`call_outcome = $${paramIndex}`)
        values.push(additionalData.outcome)
        paramIndex++
      }

      if (additionalData.elevenlabsConversationId) {
        updateFields.push(`elevenlabs_conversation_id = $${paramIndex}`);
        values.push(additionalData.elevenlabsConversationId);
        paramIndex++;
      }

      const updateQuery = `
        UPDATE calls 
        SET ${updateFields.join(', ')}
        WHERE call_sid = $1 OR elevenlabs_conversation_id = $1
        RETURNING id, creator_id, campaign_id, elevenlabs_conversation_id
      `;

      const result = await this.pool.query(updateQuery, values);

      if (result.rows.length === 0) {
        throw new Error(`Call with SID/Conversation ID ${callSid} not found`);
      }

      const callId = result.rows[0].id;
      const conversationId = result.rows[0].elevenlabs_conversation_id;

      // Log status change event
      await this.logCallEvent(client, callId, status, {
        twilio_data: twilioCallDetails,
        ...additionalData
      })

      // If call completed, get conversation insights
      if (status === 'completed' && conversationId) {
        try {
          await this.processCallCompletion(client, callId, conversationId);
        } catch (error) {
          console.error('Error processing call completion:', error)
          // Don't fail the status update if insights fail
        }
      }

      return {
        success: true,
        callId: callId,
        status: status,
        twilioData: twilioCallDetails
      }
    } catch (error) {
      console.error('Error updating call status:', error)
      throw error
    } finally {
      client.release()
    }
  }

  // Process call completion and gather insights
  async processCallCompletion (client, callId, conversationId) {
    try {
      // Get conversation analysis from ElevenLabs
      const analysis = await elevenLabsService.analyzeConversation(conversationId)

      // Update call with conversation summary
      await client.query(
        `UPDATE calls 
         SET conversation_summary = $1
         WHERE id = $2`,
        [analysis.summary, callId]
      );

      // Insert analytics data
      const analyticsQuery = `
        INSERT INTO call_analytics (
          call_id, talk_time_seconds, sentiment_score, 
          conversation_quality_score, key_topics, 
          follow_up_required, next_action
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `

      const sentimentScore = analysis.sentiment === 'positive' ? 0.7
        : analysis.sentiment === 'negative' ? -0.3 : 0

      const qualityScore = analysis.analysis?.customerEngagement
        ? analysis.analysis.customerEngagement / 10
        : 0.5

      const followUpRequired = sentimentScore > 0.3 ||
                              analysis.topics.includes('collaboration')

      const nextAction = followUpRequired ? 'schedule_follow_up' : 'no_action_needed'

      await client.query(analyticsQuery, [
        callId,
        analysis.duration || 0,
        sentimentScore,
        qualityScore,
        analysis.topics || [],
        followUpRequired,
        nextAction
      ])

      console.log(`✅ Call completion processed for call ID: ${callId}`)
    } catch (error) {
      console.error('Error processing call completion:', error)
      throw error
    }
  }

  // Log call events
  async logCallEvent (client, callId, eventType, eventData = {}) {
    try {
      const query = `
        INSERT INTO call_events (call_id, event_type, event_data, timestamp)
        VALUES ($1, $2, $3, NOW())
      `

      await client.query(query, [callId, eventType, eventData])
    } catch (error) {
      console.error('Error logging call event:', error)
      // Don't throw - event logging shouldn't break main flow
    }
  }

  // Get call details by ID
  async getCallById (callId) {
    try {
      const query = `
        SELECT 
          c.*,
          cr.creator_name,
          ca.sentiment_score,
          ca.conversation_quality_score,
          ca.key_topics,
          ca.follow_up_required,
          ca.next_action
        FROM calls c
        LEFT JOIN creators cr ON c.creator_id = cr.id
        LEFT JOIN call_analytics ca ON c.id = ca.call_id
        WHERE c.id = $1
      `

      const result = await this.pool.query(query, [callId])

      if (result.rows.length === 0) {
        return null
      }

      const call = result.rows[0]

      // Get call events
      const eventsQuery = `
        SELECT event_type, event_data, timestamp
        FROM call_events 
        WHERE call_id = $1 
        ORDER BY timestamp ASC
      `

      const eventsResult = await this.pool.query(eventsQuery, [callId])
      call.events = eventsResult.rows

      return call
    } catch (error) {
      console.error('Error fetching call details:', error)
      throw error
    }
  }

    // Get calls with filtering and pagination (including campaign filtering)
    async getCalls (filters = {}, pagination = {}) {
        try {
        const { page = 1, limit = 20 } = pagination
        const offset = (page - 1) * limit

        let whereClause = 'WHERE 1=1'
        const values = []
        let paramCount = 0

        // Build filters
        if (filters.creatorId) {
            paramCount++
            whereClause += ` AND c.creator_id = $${paramCount}`
            values.push(filters.creatorId)
        }

        if (filters.campaignId) { // ✅ NEW: Campaign filter
            paramCount++
            whereClause += ` AND c.campaign_id = $${paramCount}`
            values.push(filters.campaignId)
        }

        if (filters.status) {
            paramCount++
            whereClause += ` AND c.status = $${paramCount}`
            values.push(filters.status)
        }

        if (filters.outcome) {
            paramCount++
            whereClause += ` AND c.call_outcome = $${paramCount}`
            values.push(filters.outcome)
        }

        if (filters.callMethod) {
            paramCount++;
            whereClause += ` AND c.call_method = $${paramCount}`;
            values.push(filters.callMethod);
        }

        if (filters.startDate) {
            paramCount++
            whereClause += ` AND c.created_at >= $${paramCount}`
            values.push(filters.startDate)
        }

        if (filters.endDate) {
            paramCount++
            whereClause += ` AND c.created_at <= $${paramCount}`
            values.push(filters.endDate)
        }

        // ✅ UPDATED: Enhanced query with campaign information
        const query = `
            SELECT 
            c.*,
            cr.creator_name,
            ca.sentiment_score,
            ca.conversation_quality_score,
            ca.follow_up_required,
            camp.campaign_name,
            camp.campaign_type,
            camp.status as campaign_status,
            b.brand_name
            FROM calls c
            LEFT JOIN creators cr ON c.creator_id = cr.id
            LEFT JOIN call_analytics ca ON c.id = ca.call_id
            LEFT JOIN campaigns camp ON c.campaign_id = camp.id
            LEFT JOIN brands b ON camp.brand_id = b.id
            ${whereClause}
            ORDER BY c.created_at DESC
            LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
        `

        values.push(limit, offset)

        const result = await this.pool.query(query, values)

        // Get total count with same filters
        const countQuery = `
            SELECT COUNT(*) as total
            FROM calls c
            LEFT JOIN campaigns camp ON c.campaign_id = camp.id
            ${whereClause}
        `

        const countResult = await this.pool.query(countQuery, values.slice(0, -2))
        const total = parseInt(countResult.rows[0].total)

        // ✅ NEW: Add campaign statistics if filtering by campaign
        let campaignStats = null
        if (filters.campaignId) {
            try {
            const statsQuery = `
                SELECT 
                COUNT(*) as total_calls,
                COUNT(CASE WHEN c.status = 'completed' THEN 1 END) as completed_calls,
                COUNT(CASE WHEN c.call_outcome = 'completed' THEN 1 END) as successful_calls,
                AVG(c.duration_seconds) as avg_duration,
                SUM(c.cost_usd) as total_cost,
                COUNT(DISTINCT c.creator_id) as unique_creators
                FROM calls c
                WHERE c.campaign_id = $1
            `
            
            const statsResult = await this.pool.query(statsQuery, [filters.campaignId])
            const stats = statsResult.rows[0]
            
            campaignStats = {
                total_calls: parseInt(stats.total_calls) || 0,
                completed_calls: parseInt(stats.completed_calls) || 0,
                successful_calls: parseInt(stats.successful_calls) || 0,
                success_rate: stats.total_calls > 0 
                ? ((stats.successful_calls / stats.total_calls) * 100).toFixed(2) + '%'
                : '0%',
                avg_duration_minutes: stats.avg_duration 
                ? (parseFloat(stats.avg_duration) / 60).toFixed(2)
                : 0,
                total_cost_usd: parseFloat(stats.total_cost || 0).toFixed(2),
                unique_creators: parseInt(stats.unique_creators) || 0
            }
            } catch (error) {
            console.warn('Could not fetch campaign statistics:', error.message)
            }
        }

        return {
            calls: result.rows,
            pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
            },
            campaign_stats: campaignStats // ✅ NEW: Include campaign stats if relevant
        }
        } catch (error) {
        console.error('Error fetching calls:', error)
        throw error
        }
    }
    // Get call analytics/statistics with campaign support
    async getCallAnalytics (filters = {}) {
        try {
        let whereClause = 'WHERE 1=1'
        const values = []
        let paramCount = 0

        if (filters.startDate) {
            paramCount++
            whereClause += ` AND c.created_at >= $${paramCount}`
            values.push(filters.startDate)
        }

        if (filters.endDate) {
            paramCount++
            whereClause += ` AND c.created_at <= $${paramCount}`
            values.push(filters.endDate)
        }

        if (filters.callMethod) {
            paramCount++;
            whereClause += ` AND c.call_method = $${paramCount}`;
            values.push(filters.callMethod);
        }

        // ✅ NEW: Campaign filtering
        if (filters.campaignId) {
            paramCount++;
            whereClause += ` AND c.campaign_id = $${paramCount}`;
            values.push(filters.campaignId);
        }

        // ✅ UPDATED: Enhanced analytics query with campaign data
        const analyticsQuery = `
            SELECT 
            COUNT(*) as total_calls,
            COUNT(CASE WHEN c.status = 'completed' THEN 1 END) as completed_calls,
            COUNT(CASE WHEN c.call_outcome = 'completed' THEN 1 END) as successful_calls,
            AVG(c.duration_seconds) as avg_duration,
            SUM(c.cost_usd) as total_cost,
            AVG(ca.sentiment_score) as avg_sentiment,
            COUNT(CASE WHEN ca.follow_up_required = true THEN 1 END) as follow_ups_needed,
            
            -- Method breakdown
            COUNT(CASE WHEN c.call_method = 'elevenlabs' THEN 1 END) as elevenlabs_calls,
            COUNT(CASE WHEN c.call_method = 'twilio_fallback' THEN 1 END) as twilio_fallback_calls,
            
            -- Outcome breakdown
            COUNT(CASE WHEN c.call_outcome = 'completed' THEN 1 END) as outcome_completed,
            COUNT(CASE WHEN c.call_outcome = 'no-answer' THEN 1 END) as outcome_no_answer,
            COUNT(CASE WHEN c.call_outcome = 'busy' THEN 1 END) as outcome_busy,
            COUNT(CASE WHEN c.call_outcome = 'failed' THEN 1 END) as outcome_failed,
            
            -- Status breakdown
            COUNT(CASE WHEN c.status = 'initiated' THEN 1 END) as status_initiated,
            COUNT(CASE WHEN c.status = 'ringing' THEN 1 END) as status_ringing,
            COUNT(CASE WHEN c.status = 'in-progress' THEN 1 END) as status_in_progress,
            COUNT(CASE WHEN c.status = 'completed' THEN 1 END) as status_completed,
            COUNT(CASE WHEN c.status = 'failed' THEN 1 END) as status_failed,
            
            -- ✅ NEW: Campaign-specific metrics
            COUNT(DISTINCT c.campaign_id) as unique_campaigns,
            COUNT(DISTINCT c.creator_id) as unique_creators,
            COUNT(CASE WHEN c.campaign_id IS NOT NULL THEN 1 END) as campaign_calls,
            COUNT(CASE WHEN c.campaign_id IS NULL THEN 1 END) as non_campaign_calls
            
            FROM calls c
            LEFT JOIN call_analytics ca ON c.id = ca.call_id
            ${whereClause}
        `

        const result = await this.pool.query(analyticsQuery, values)
        const stats = result.rows[0]

        // Calculate derived metrics
        const totalCalls = parseInt(stats.total_calls) || 0;
        const completedCalls = parseInt(stats.completed_calls) || 0;
        const successfulCalls = parseInt(stats.successful_calls) || 0;
        const elevenLabsCalls = parseInt(stats.elevenlabs_calls) || 0;
        const twilioFallbackCalls = parseInt(stats.twilio_fallback_calls) || 0;
        const campaignCalls = parseInt(stats.campaign_calls) || 0;
        const nonCampaignCalls = parseInt(stats.non_campaign_calls) || 0;

        // ✅ NEW: Get campaign breakdown if not filtering by specific campaign
        let campaignBreakdown = null;
        if (!filters.campaignId && totalCalls > 0) {
            try {
            const campaignBreakdownQuery = `
                SELECT 
                camp.id,
                camp.campaign_name,
                camp.campaign_type,
                COUNT(c.id) as call_count,
                COUNT(CASE WHEN c.call_outcome = 'completed' THEN 1 END) as successful_calls,
                AVG(c.duration_seconds) as avg_duration,
                SUM(c.cost_usd) as total_cost
                FROM calls c
                JOIN campaigns camp ON c.campaign_id = camp.id
                ${whereClause.replace('WHERE 1=1', 'WHERE c.campaign_id IS NOT NULL')}
                GROUP BY camp.id, camp.campaign_name, camp.campaign_type
                ORDER BY call_count DESC
                LIMIT 10
            `;

            const campaignResult = await this.pool.query(campaignBreakdownQuery, values);
            campaignBreakdown = campaignResult.rows.map(row => ({
                campaign_id: row.id,
                campaign_name: row.campaign_name,
                campaign_type: row.campaign_type,
                call_count: parseInt(row.call_count),
                successful_calls: parseInt(row.successful_calls),
                success_rate: row.call_count > 0 
                ? ((row.successful_calls / row.call_count) * 100).toFixed(2) + '%'
                : '0%',
                avg_duration_minutes: row.avg_duration 
                ? (parseFloat(row.avg_duration) / 60).toFixed(2)
                : 0,
                total_cost_usd: parseFloat(row.total_cost || 0).toFixed(2)
            }));
            } catch (error) {
            console.warn('Could not fetch campaign breakdown:', error.message);
            }
        }

        return {
            overview: {
            total_calls: totalCalls,
            completed_calls: completedCalls,
            successful_calls: successfulCalls,
            completion_rate: totalCalls > 0 ? ((completedCalls / totalCalls) * 100).toFixed(2) + '%' : '0%',
            success_rate: totalCalls > 0 ? ((successfulCalls / totalCalls) * 100).toFixed(2) + '%' : '0%',
            avg_duration_minutes: stats.avg_duration ? (parseFloat(stats.avg_duration) / 60).toFixed(2) : 0,
            total_cost_usd: parseFloat(stats.total_cost || 0).toFixed(2),
            avg_sentiment: parseFloat(stats.avg_sentiment || 0).toFixed(2),
            follow_ups_needed: parseInt(stats.follow_ups_needed) || 0,
            unique_creators: parseInt(stats.unique_creators) || 0
            },
            call_methods: {
            elevenlabs_direct: elevenLabsCalls,
            twilio_fallback: twilioFallbackCalls,
            elevenlabs_success_rate: totalCalls > 0 ? ((elevenLabsCalls / totalCalls) * 100).toFixed(2) + '%' : '0%'
            },
            // ✅ NEW: Campaign vs non-campaign call breakdown
            campaign_distribution: {
            campaign_calls: campaignCalls,
            non_campaign_calls: nonCampaignCalls,
            campaign_call_percentage: totalCalls > 0 ? ((campaignCalls / totalCalls) * 100).toFixed(2) + '%' : '0%',
            unique_campaigns: parseInt(stats.unique_campaigns) || 0
            },
            outcomes: {
            completed: parseInt(stats.outcome_completed) || 0,
            no_answer: parseInt(stats.outcome_no_answer) || 0,
            busy: parseInt(stats.outcome_busy) || 0,
            failed: parseInt(stats.outcome_failed) || 0
            },
            statuses: {
            initiated: parseInt(stats.status_initiated) || 0,
            ringing: parseInt(stats.status_ringing) || 0,
            in_progress: parseInt(stats.status_in_progress) || 0,
            completed: parseInt(stats.status_completed) || 0,
            failed: parseInt(stats.status_failed) || 0
            },
            // ✅ NEW: Campaign performance breakdown (only if not filtering by specific campaign)
            campaign_breakdown: campaignBreakdown
        }
        } catch (error) {
        console.error('Error fetching call analytics:', error)
        throw error
        }
    }

  // Terminate active call
  async terminateCall (callId) {
    try {
      // Get call details
      const call = await this.getCallById(callId)

      if (!call) {
        throw new Error(`Call with ID ${callId} not found`)
      }

      if (['completed', 'failed', 'canceled'].includes(call.status)) {
        return {
          success: true,
          message: `Call already ${call.status}`,
          status: call.status
        }
      }

      let terminationResult = { success: false };

      // Try to terminate via appropriate method
      if (call.call_method === 'elevenlabs' && call.elevenlabs_conversation_id) {
        try {
          // End ElevenLabs conversation
          terminationResult = await elevenLabsService.endConversation(call.elevenlabs_conversation_id);
        } catch (error) {
          console.warn('Failed to end ElevenLabs conversation, trying Twilio:', error.message);
        }
      }

      // If ElevenLabs termination failed or it's a Twilio call, try Twilio
      if (!terminationResult.success && call.call_sid) {
        try {
          terminationResult = await twilioService.hangupCall(call.call_sid);
        } catch (error) {
          console.error('Failed to terminate via Twilio:', error.message);
        }
      }

      // Update call status regardless of termination method success
      await this.updateCallStatus(call.call_sid || call.elevenlabs_conversation_id, 'canceled', {
        outcome: 'canceled',
        terminated_manually: true
      })

      return {
        success: true,
        message: 'Call termination attempted',
        callId: callId,
        callSid: call.call_sid,
        conversationId: call.elevenlabs_conversation_id,
        terminationMethod: call.call_method
      };

    } catch (error) {
      console.error('Error terminating call:', error)
      throw error
    }
  }

  // Get call recordings
  async getCallRecordings (callId) {
    try {
      const call = await this.getCallById(callId);
      
      if (!call) {
        throw new Error('Call not found');
      }

      let recordings = [];

      // For Twilio calls, get Twilio recordings
      if (call.call_sid) {
        try {
          recordings = await twilioService.getCallRecordings(call.call_sid);
        } catch (error) {
          console.warn('Failed to get Twilio recordings:', error.message);
        }
      }

      // For ElevenLabs calls, get conversation history as "recording"
      if (call.elevenlabs_conversation_id) {
        try {
          const conversationHistory = await elevenLabsService.getConversationHistory(call.elevenlabs_conversation_id);
          if (conversationHistory && conversationHistory.messages) {
            recordings.push({
              type: 'conversation_transcript',
              conversation_id: call.elevenlabs_conversation_id,
              messages: conversationHistory.messages,
              duration: conversationHistory.duration || 0,
              status: 'completed'
            });
          }
        } catch (error) {
          console.warn('Failed to get ElevenLabs conversation history:', error.message);
        }
      }

      return {
        callId: callId,
        callSid: call.call_sid,
        conversationId: call.elevenlabs_conversation_id,
        recordings: recordings,
        callMethod: call.call_method
      };

    } catch (error) {
      console.error('Error fetching call recordings:', error)
      throw error
    }
  }

  // Health check for call system
  async healthCheck () {
    try {
      const [twilioHealth, elevenLabsHealth] = await Promise.all([
        twilioService.healthCheck(),
        elevenLabsService.healthCheck()
      ])

      // Check database connectivity
      await this.pool.query('SELECT 1')

      const systemStatus = 
        twilioHealth.status === 'healthy' && elevenLabsHealth.status === 'healthy' 
          ? 'healthy' 
          : 'degraded';

      return {
        status: systemStatus,
        components: {
          twilio: twilioHealth,
          elevenlabs: elevenLabsHealth,
          database: {
            status: 'healthy',
            service: 'postgresql'
          }
        },
        call_methods: {
          primary: 'elevenlabs_outbound',
          fallback: 'twilio_manual',
          elevenlabs_agent_configured: elevenLabsHealth.agentPhoneNumberId === 'configured'
        },
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      }
    }
  }
}

module.exports = new CallService()
