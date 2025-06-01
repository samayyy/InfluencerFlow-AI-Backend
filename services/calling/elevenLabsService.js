// services/calling/elevenLabsService.js
const axios = require('axios')
const __config = require('../../config')

class ElevenLabsService {
  constructor () {
    this.apiKey = process.env.ELEVENLABS_API_KEY
    this.baseUrl = 'https://api.elevenlabs.io/v1'
    this.defaultAgentId = process.env.ELEVENLABS_AGENT_ID

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

  // Create a new conversation session
  async createConversation (options = {}) {
    try {
      const {
        agentId = this.defaultAgentId,
        creatorId,
        phoneNumber,
        callContext = 'outbound_sales',
        customInstructions,
        metadata = {}
      } = options

      if (!agentId) {
        throw new Error('Agent ID is required to create conversation')
      }

      // First, verify the agent exists
      console.log(`🔍 Verifying agent: ${agentId}`)
      try {
        await this.getAgent(agentId)
        console.log(`✅ Agent verified: ${agentId}`)
      } catch (error) {
        console.error(`❌ Agent verification failed: ${error.message}`)
        throw new Error(`Invalid agent ID: ${agentId}`)
      }

      // Try different conversation creation approaches
      let conversationResponse = null
      let conversationId = null

      // Method 1: Try the standard conversation endpoint
      try {
        console.log(`🚀 Attempting conversation creation with agent: ${agentId}`)

        const conversationData = {
          agent_id: agentId,
          // Add context variables that might be useful for the agent
          variables: {
            creator_id: creatorId || 'unknown',
            phone_number: phoneNumber || 'unknown',
            call_context: callContext,
            timestamp: new Date().toISOString(),
            ...metadata
          }
        }

        // Add custom instructions if provided
        if (customInstructions) {
          conversationData.agent_override = {
            prompt: customInstructions
          }
        }

        console.log('📤 Sending conversation request:', JSON.stringify(conversationData, null, 2))

        conversationResponse = await this.client.post('/convai/conversations', conversationData)
        conversationId = conversationResponse.data.conversation_id

        console.log(`✅ Method 1 success - Conversation created: ${conversationId}`)
      } catch (error) {
        console.log(`⚠️ Method 1 failed: ${error.response?.status} ${error.response?.statusText}`)
        console.log('   Error details:', error.response?.data)

        // Method 2: Try alternative endpoint or simpler payload
        try {
          console.log('🔄 Trying alternative method...')

          const simpleData = {
            agent_id: agentId
          }

          conversationResponse = await this.client.post('/convai/conversations', simpleData)
          conversationId = conversationResponse.data.conversation_id

          console.log(`✅ Method 2 success - Conversation created: ${conversationId}`)
        } catch (error2) {
          console.log(`⚠️ Method 2 also failed: ${error2.response?.status} ${error2.response?.statusText}`)

          // Method 3: Return a mock conversation for development
          console.log('🔄 Using mock conversation for development...')

          conversationId = `mock_conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

          console.log(`🎭 Mock conversation created: ${conversationId}`)

          return {
            conversationId: conversationId,
            agentId: agentId,
            status: 'created_mock',
            websocketUrl: null,
            note: 'Using mock conversation - check ElevenLabs API setup'
          }
        }
      }

      return {
        conversationId: conversationId,
        agentId: agentId,
        status: 'created',
        websocketUrl: conversationResponse?.data?.websocket_url || null
      }
    } catch (error) {
      console.error('❌ All conversation creation methods failed:', error.message)

      // Return a development-friendly response instead of throwing
      const mockConversationId = `fallback_conv_${Date.now()}`

      console.log(`🆘 Creating fallback conversation: ${mockConversationId}`)

      return {
        conversationId: mockConversationId,
        agentId: agentId || 'unknown',
        status: 'fallback_created',
        websocketUrl: null,
        error: error.message,
        note: 'Check ElevenLabs API key and agent configuration'
      }
    }
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
      const agents = await this.getAgents()

      return {
        status: 'healthy',
        service: 'elevenlabs',
        agentsAvailable: agents?.length || 0,
        defaultAgent: this.defaultAgentId,
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
