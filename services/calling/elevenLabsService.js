// services/calling/elevenLabsService.js
const axios = require('axios')
const __config = require('../../config')

class ElevenLabsService {
  constructor() {
    this.apiKey = process.env.ELEVENLABS_API_KEY;
    this.baseUrl = 'https://api.elevenlabs.io/v1';
    this.defaultAgentId = process.env.ELEVENLABS_AGENT_ID;
    this.agentPhoneNumberId = process.env.ELEVENLABS_AGENT_PHONE_NUMBER_ID;
    
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'xi-api-key': this.apiKey
      },
      timeout: 30000
    })
  }

  // Get available agents
  async getAgents () {
    try {
      const response = await this.client.get('/convai/agents')
      return response.data
    } catch (error) {
      console.error('Error fetching ElevenLabs agents:', error.response?.data || error.message)
      throw new Error(`Failed to fetch agents: ${error.message}`)
    }
  }

  // Get specific agent details
  async getAgent (agentId = null) {
    try {
      const id = agentId || this.defaultAgentId
      if (!id) {
        throw new Error('No agent ID provided and no default agent configured')
      }

      const response = await this.client.get(`/convai/agents/${id}`)
      return response.data
    } catch (error) {
      console.error('Error fetching agent details:', error.response?.data || error.message)
      throw new Error(`Failed to fetch agent: ${error.message}`)
    }
  }

  // ✅ UPDATED: Generate default prompt when no campaign data is available
  generateDefaultPrompt(creatorName) {
    return `You are Lynda, a street-smart, charismatic creator outreach specialist for a top influencer marketing agency that works with leading D2C, tech, and lifestyle brands. You specialize in onboarding Instagram and YouTube creators for paid brand collaborations, handling everything from evaluating fit to negotiating rates and locking in deals smoothly. 

You speak like a real person—casual, sharp, and confident—with zero pitch-talk or robotic scripts. You build trust fast by relating to creators' content grind and asking chill, qualifying questions like "You open to collabs these days?" or "What's your usual ballpark for something like this?" 

You negotiate in a relaxed, real-talk style, always keeping things respectful but honest: "Totally hear you—thing is, the brand's budget for this tier is more like X, but I'm tryna make it work." Your goal is to close creators on deals within a $500–$1000 range (never stated out loud), get them hyped on the opportunity, and send over contracts and briefs via email. 

If a creator's not feeling it, you never push—just keep it light: "All good—maybe we circle back next time, yeah?" If they ask who you are, say: "I'm Lynda, I connect creators like you with paid brand deals. You focus on content, I handle the rest." 

You never overpromise, never overexplain, and never repeat yourself—just smooth, real negotiation that respects both the brand's goals and the creator's value.`;
  }

  // ✅ UPDATED: Use dynamic prompts based on campaign data
  async initiateOutboundCall(options = {}) {
    try {
      const {
        agentId = this.defaultAgentId,
        phoneNumber,
        agentPhoneNumberId = this.agentPhoneNumberId,
        customInstructions,
        dynamicPrompt, // ✅ NEW: Campaign-specific prompt
        metadata = {},
        creatorPricing
      } = options;

      if (!agentId) {
        throw new Error('Agent ID is required for outbound call');
      }

      if (!phoneNumber) {
        throw new Error('Phone number is required for outbound call');
      }

      if (!agentPhoneNumberId) {
        throw new Error('Agent phone number ID is required. Set ELEVENLABS_AGENT_PHONE_NUMBER_ID in environment variables');
      }

      console.log(`🚀 Initiating ElevenLabs outbound call to: ${phoneNumber} with ${metadata.creator_name || 'creator'}`);

      // ✅ NEW: Use dynamic prompt if provided, otherwise use default
      const systemPrompt = dynamicPrompt || this.generateDefaultPrompt(metadata.creator_name || 'creator');
      
      // ✅ NEW: Generate personalized first message based on campaign context
      let firstMessage = `Hi ${metadata.creator_name}! I'm Lynda from InfluencerFlow. I've been following your content and I'm really impressed with your engagement rate.`;

      if (metadata.campaign_name) {
        firstMessage += ` I have an exciting campaign opportunity called "${metadata.campaign_name}" that I think would be perfect for your audience.`;
      } else {
        firstMessage += ` I have an exciting campaign opportunity that I think would be perfect for your audience.`;
      }

      firstMessage += ` Do you have a few minutes to chat?`;

      // Build the call data with dynamic prompt
      const callData = {
        agent_id: agentId,
        agent_phone_number_id: agentPhoneNumberId,
        to_number: phoneNumber,
        conversation_initiation_client_data: {
            conversation_config_override: {
                agent: {
                    prompt: {
                        prompt: systemPrompt // ✅ UPDATED: Use dynamic prompt
                    },
                    first_message: firstMessage // ✅ UPDATED: Use dynamic first message
                }
            }
        }
      };

      // Add custom instructions if provided (these override the campaign-specific instructions)
      if (customInstructions) {
        callData.conversation_initiation_client_data.conversation_config_override.agent.prompt.prompt = customInstructions;
      }

      // ✅ NEW: Add campaign context to metadata for ElevenLabs
      if (metadata.campaign_id) {
        callData.conversation_initiation_client_data.conversation_metadata = {
          campaign_id: metadata.campaign_id,
          campaign_name: metadata.campaign_name,
          creator_id: metadata.creator_id,
          creator_name: metadata.creator_name,
          call_purpose: 'campaign_outreach'
        };
      }

      console.log('📤 Sending outbound call request with campaign-specific prompt');
      if (process.env.DEBUG_PROMPTS === 'true') {
        console.log('System Prompt Preview:', systemPrompt.substring(0, 200) + '...');
        console.log('First Message:', firstMessage);
      }

      const response = await this.client.post('/convai/twilio/outbound-call', callData);
      
      console.log(`✅ ElevenLabs outbound call initiated successfully`);
      console.log('Response:', response.data);

      return {
        success: response.data.success || true,
        message: response.data.message || 'Call initiated',
        conversationId: response.data.conversation_id,
        callSid: response.data.callSid,
        agentId: agentId,
        phoneNumber: phoneNumber,
        status: 'initiated',
        campaignContext: metadata.campaign_id ? {
          campaign_id: metadata.campaign_id,
          campaign_name: metadata.campaign_name,
          dynamic_prompt_used: !!dynamicPrompt
        } : null
      };

    } catch (error) {
      console.error('❌ ElevenLabs outbound call failed:', error.response?.data || error.message);
      
      // Provide detailed error information
      const errorDetails = {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message
      };

      throw new Error(`ElevenLabs outbound call failed: ${JSON.stringify(errorDetails)}`);
    }
  }

  // ✅ DEPRECATED: Old conversation creation method (keeping for backward compatibility)
  async createConversation(options = {}) {
    console.log('⚠️ createConversation is deprecated. Use initiateOutboundCall for Twilio integration.');
    
    // For Twilio calls, redirect to the new method
    if (options.phoneNumber) {
      return await this.initiateOutboundCall(options);
    }

    // For non-Twilio conversations, return a mock for now
    const mockConversationId = `mock_conv_${Date.now()}`;
    console.log(`🎭 Creating mock conversation: ${mockConversationId}`);
    
    return {
      conversationId: mockConversationId,
      agentId: options.agentId || this.defaultAgentId,
      status: 'mock_created',
      websocketUrl: null,
      note: 'Mock conversation created. Use initiateOutboundCall for real Twilio calls.'
    };
  }

  // Get conversation details
  async getConversation (conversationId) {
    try {
      const response = await this.client.get(`/convai/conversations/${conversationId}`)
      return response.data
    } catch (error) {
      console.error('Error fetching conversation:', error.response?.data || error.message)
      throw new Error(`Failed to fetch conversation: ${error.message}`)
    }
  }

  // Get conversation history/transcript
  async getConversationHistory (conversationId) {
    try {
      const response = await this.client.get(`/convai/conversations/${conversationId}/history`)
      return response.data
    } catch (error) {
      console.error('Error fetching conversation history:', error.response?.data || error.message)
      throw new Error(`Failed to fetch conversation history: ${error.message}`)
    }
  }

  // End conversation
  async endConversation (conversationId) {
    try {
      const response = await this.client.delete(`/convai/conversations/${conversationId}`)
      return {
        success: true,
        conversationId: conversationId,
        status: 'ended'
      }
    } catch (error) {
      console.error('Error ending conversation:', error.response?.data || error.message)
      throw new Error(`Failed to end conversation: ${error.message}`)
    }
  }

  // Analyze conversation for insights
  async analyzeConversation (conversationId) {
    try {
      // Get conversation history
      const history = await this.getConversationHistory(conversationId)

      if (!history || !history.messages || history.messages.length === 0) {
        return {
          summary: 'No conversation data available',
          sentiment: 'neutral',
          topics: [],
          duration: 0,
          messageCount: 0
        }
      }

      const messages = history.messages
      const messageCount = messages.length

      // Calculate duration
      const startTime = new Date(messages[0].timestamp)
      const endTime = new Date(messages[messages.length - 1].timestamp)
      const durationSeconds = Math.floor((endTime - startTime) / 1000)

      // Extract text from messages for analysis
      const conversationText = messages
        .filter(msg => msg.text && msg.text.trim())
        .map(msg => msg.text)
        .join(' ')

      // Simple sentiment analysis (you can enhance this)
      const sentiment = this.analyzeSentiment(conversationText)

      // Extract topics (basic keyword extraction)
      const topics = this.extractTopics(conversationText)

      // Generate summary
      const summary = this.generateSummary(messages, conversationText)

      return {
        conversationId,
        summary,
        sentiment,
        topics,
        duration: durationSeconds,
        messageCount,
        analysis: {
          customerEngagement: this.calculateEngagement(messages),
          conversationFlow: this.analyzeFlow(messages),
          keyMoments: this.identifyKeyMoments(messages)
        },
        rawData: {
          totalMessages: messageCount,
          agentMessages: messages.filter(m => m.role === 'agent').length,
          userMessages: messages.filter(m => m.role === 'user').length
        }
      }
    } catch (error) {
      console.error('Error analyzing conversation:', error)
      return {
        conversationId,
        summary: 'Analysis failed',
        sentiment: 'unknown',
        topics: [],
        duration: 0,
        messageCount: 0,
        error: error.message
      }
    }
  }

  // Simple sentiment analysis
  analyzeSentiment (text) {
    const positiveWords = ['great', 'good', 'excellent', 'amazing', 'wonderful', 'fantastic', 'love', 'like', 'yes', 'sure', 'absolutely', 'interested']
    const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'dislike', 'no', 'never', 'not interested', 'spam', 'annoying']

    const words = text.toLowerCase().split(/\s+/)
    let score = 0

    words.forEach(word => {
      if (positiveWords.includes(word)) score += 1
      if (negativeWords.includes(word)) score -= 1
    })

    if (score > 0) return 'positive'
    if (score < 0) return 'negative'
    return 'neutral'
  }

  // Extract conversation topics
  extractTopics (text) {
    const topicKeywords = {
      pricing: ['price', 'cost', 'rate', 'budget', 'expensive', 'cheap', 'money', 'payment'],
      collaboration: ['collab', 'partnership', 'work together', 'project', 'campaign'],
      content: ['video', 'post', 'content', 'youtube', 'instagram', 'tiktok', 'social media'],
      audience: ['followers', 'audience', 'demographic', 'views', 'engagement'],
      timeline: ['when', 'deadline', 'schedule', 'time', 'date'],
      requirements: ['need', 'want', 'require', 'looking for', 'seeking']
    }

    const topics = []
    const lowerText = text.toLowerCase()

    Object.entries(topicKeywords).forEach(([topic, keywords]) => {
      if (keywords.some(keyword => lowerText.includes(keyword))) {
        topics.push(topic)
      }
    })

    return [...new Set(topics)] // Remove duplicates
  }

  // Generate conversation summary
  generateSummary (messages, fullText) {
    if (!messages || messages.length === 0) {
      return 'No conversation occurred'
    }

    const agentMessages = messages.filter(m => m.role === 'agent').length
    const userMessages = messages.filter(m => m.role === 'user').length

    if (userMessages === 0) {
      return 'Customer did not respond during the call'
    }

    const sentiment = this.analyzeSentiment(fullText)
    const topics = this.extractTopics(fullText)

    let summary = `Conversation lasted ${messages.length} exchanges. `
    summary += `Customer sentiment: ${sentiment}. `

    if (topics.length > 0) {
      summary += `Topics discussed: ${topics.join(', ')}. `
    }

    // Add outcome assessment
    if (sentiment === 'positive' && topics.includes('collaboration')) {
      summary += 'Potential collaboration opportunity identified.'
    } else if (sentiment === 'negative') {
      summary += 'Customer showed limited interest.'
    } else {
      summary += 'Neutral conversation, follow-up may be needed.'
    }

    return summary
  }

  // Calculate customer engagement level
  calculateEngagement (messages) {
    if (!messages || messages.length === 0) return 0

    const userMessages = messages.filter(m => m.role === 'user')
    const totalMessages = messages.length

    if (totalMessages === 0) return 0

    const engagementRatio = userMessages.length / totalMessages

    // Score from 0-10
    return Math.round(engagementRatio * 10)
  }

  // Analyze conversation flow
  analyzeFlow (messages) {
    if (!messages || messages.length < 2) {
      return 'insufficient_data'
    }

    const userResponseTimes = []
    for (let i = 1; i < messages.length; i++) {
      if (messages[i].role === 'user' && messages[i - 1].role === 'agent') {
        const agentTime = new Date(messages[i - 1].timestamp)
        const userTime = new Date(messages[i].timestamp)
        userResponseTimes.push(userTime - agentTime)
      }
    }

    if (userResponseTimes.length === 0) return 'no_user_responses'

    const avgResponseTime = userResponseTimes.reduce((a, b) => a + b, 0) / userResponseTimes.length

    if (avgResponseTime < 3000) return 'highly_engaged'
    if (avgResponseTime < 8000) return 'moderately_engaged'
    return 'slowly_responsive'
  }

  // Identify key moments in conversation
  identifyKeyMoments (messages) {
    const keyMoments = []

    messages.forEach((message, index) => {
      if (message.role === 'user') {
        const text = message.text?.toLowerCase() || ''

        if (text.includes('yes') || text.includes('interested') || text.includes('sure')) {
          keyMoments.push({
            type: 'positive_response',
            timestamp: message.timestamp,
            text: message.text
          })
        }

        if (text.includes('no') || text.includes('not interested') || text.includes('stop')) {
          keyMoments.push({
            type: 'negative_response',
            timestamp: message.timestamp,
            text: message.text
          })
        }

        if (text.includes('?')) {
          keyMoments.push({
            type: 'question',
            timestamp: message.timestamp,
            text: message.text
          })
        }
      }
    })

    return keyMoments
  }

  // Health check
  async healthCheck () {
    try {
      // Test with a simple agent fetch
      const agents = await this.getAgents();
      
      return {
        status: 'healthy',
        service: 'elevenlabs',
        agentsAvailable: agents?.length || 0,
        defaultAgent: this.defaultAgentId,
        agentPhoneNumberId: this.agentPhoneNumberId ? 'configured' : 'missing',
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        service: 'elevenlabs',
        error: error.message,
        timestamp: new Date().toISOString()
      }
    }
  }
}

module.exports = new ElevenLabsService()