// services/calling/callMonitoringService.js
// Optional advanced monitoring and features

const __config = require('../../config')
const __db = require('../../lib/db')

class CallMonitoringService {
  constructor () {
    this.alerts = {
      highFailureRate: 0.3, // 30% failure rate threshold
      highCostPerDay: 100, // $100 per day threshold
      longCallDuration: 600 // 10 minutes threshold
    }
  }

  // Real-time call monitoring
  async monitorActiveCalls () {
    try {
      const { Pool } = require('pg')
      const pool = new Pool({
        user: __config.postgres.user,
        host: __config.postgres.host,
        database: __config.postgres.database,
        password: __config.postgres.password,
        port: __config.postgres.port,
        ssl: { rejectUnauthorized: false }
      })

      const query = `
        SELECT 
          c.id,
          c.call_sid,
          c.creator_id,
          c.phone_number,
          c.status,
          c.created_at,
          cr.creator_name,
          EXTRACT(EPOCH FROM (NOW() - c.created_at)) as duration_seconds
        FROM calls c
        LEFT JOIN creators cr ON c.creator_id = cr.id
        WHERE c.status IN ('initiated', 'ringing', 'in-progress')
        AND c.created_at > NOW() - INTERVAL '1 hour'
        ORDER BY c.created_at DESC
      `

      const result = await pool.query(query)
      const activeCalls = result.rows

      // Check for stuck calls (longer than expected)
      const stuckCalls = activeCalls.filter(call =>
        call.duration_seconds > this.alerts.longCallDuration
      )

      if (stuckCalls.length > 0) {
        console.warn(`⚠️ Found ${stuckCalls.length} potentially stuck calls`)
        await this.handleStuckCalls(stuckCalls)
      }

      await pool.end()
      return activeCalls
    } catch (error) {
      console.error('Error monitoring active calls:', error)
      throw error
    }
  }

  // Handle calls that are stuck in active state
  async handleStuckCalls (stuckCalls) {
    const twilioService = require('./twilioService')

    for (const call of stuckCalls) {
      try {
        console.log(`🔄 Checking stuck call: ${call.call_sid}`)

        // Get current status from Twilio
        const twilioStatus = await twilioService.getCallDetails(call.call_sid)

        if (['completed', 'failed', 'busy', 'no-answer'].includes(twilioStatus.status)) {
          // Update local status to match Twilio
          const callService = require('./callService')
          await callService.updateCallStatus(call.call_sid, twilioStatus.status, {
            outcome: twilioStatus.status,
            resolved_stuck_call: true
          })

          console.log(`✅ Resolved stuck call: ${call.call_sid} -> ${twilioStatus.status}`)
        }
      } catch (error) {
        console.error(`Error resolving stuck call ${call.call_sid}:`, error)
      }
    }
  }

  // Daily cost monitoring
  async checkDailyCosts () {
    try {
      const { Pool } = require('pg')
      const pool = new Pool({
        user: __config.postgres.user,
        host: __config.postgres.host,
        database: __config.postgres.database,
        password: __config.postgres.password,
        port: __config.postgres.port,
        ssl: { rejectUnauthorized: false }
      })

      const today = new Date().toISOString().split('T')[0]

      const costQuery = `
        SELECT 
          COUNT(*) as total_calls,
          SUM(cost_usd) as total_cost,
          AVG(duration_seconds) as avg_duration,
          COUNT(CASE WHEN call_outcome = 'completed' THEN 1 END) as successful_calls
        FROM calls 
        WHERE DATE(created_at) = $1
      `

      const result = await pool.query(costQuery, [today])
      const costs = result.rows[0]

      // Check if costs exceed threshold
      if (parseFloat(costs.total_cost || 0) > this.alerts.highCostPerDay) {
        await this.sendCostAlert(costs)
      }

      // Calculate success rate
      const successRate = costs.total_calls > 0
        ? (costs.successful_calls / costs.total_calls)
        : 0

      if (successRate < (1 - this.alerts.highFailureRate) && costs.total_calls > 10) {
        await this.sendFailureRateAlert(successRate, costs)
      }

      await pool.end()
      return costs
    } catch (error) {
      console.error('Error checking daily costs:', error)
      throw error
    }
  }

  // Send cost alert (implement your notification method)
  async sendCostAlert (costs) {
    const alert = {
      type: 'HIGH_COST_ALERT',
      message: `Daily call costs exceed threshold: $${costs.total_cost}`,
      data: costs,
      timestamp: new Date().toISOString()
    }

    console.warn('💰 HIGH COST ALERT:', alert)

    // Implement your notification method here:
    // - Send email
    // - Slack notification
    // - SMS alert
    // - Log to monitoring system

    // Example: Log to database for dashboard
    await this.logAlert(alert)
  }

  // Send failure rate alert
  async sendFailureRateAlert (successRate, costs) {
    const alert = {
      type: 'HIGH_FAILURE_RATE',
      message: `Call success rate below threshold: ${(successRate * 100).toFixed(1)}%`,
      data: { ...costs, success_rate: successRate },
      timestamp: new Date().toISOString()
    }

    console.warn('📞 FAILURE RATE ALERT:', alert)
    await this.logAlert(alert)
  }

  // Log alerts to database
  async logAlert (alert) {
    try {
      if (__db.redis && __db.redis.connection_status) {
        const alertKey = `call_alerts:${new Date().toISOString().split('T')[0]}`
        await __db.redis.set_add(alertKey, JSON.stringify(alert))
        await __db.redis.ex(alertKey, 86400 * 7) // Keep for 7 days
      }
    } catch (error) {
      console.error('Error logging alert:', error)
    }
  }

  // Get recent alerts
  async getRecentAlerts (days = 7) {
    try {
      const alerts = []

      if (__db.redis && __db.redis.connection_status) {
        for (let i = 0; i < days; i++) {
          const date = new Date()
          date.setDate(date.getDate() - i)
          const dateStr = date.toISOString().split('T')[0]

          const alertKey = `call_alerts:${dateStr}`
          const dayAlerts = await __db.redis.get(alertKey)

          if (dayAlerts) {
            try {
              alerts.push(...JSON.parse(dayAlerts))
            } catch (e) {
              // Handle parsing errors
            }
          }
        }
      }

      return alerts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    } catch (error) {
      console.error('Error getting recent alerts:', error)
      return []
    }
  }

  // Performance optimization suggestions
  async getOptimizationSuggestions () {
    try {
      const { Pool } = require('pg')
      const pool = new Pool({
        user: __config.postgres.user,
        host: __config.postgres.host,
        database: __config.postgres.database,
        password: __config.postgres.password,
        port: __config.postgres.port,
        ssl: { rejectUnauthorized: false }
      })

      // Analyze last 30 days
      const analysisQuery = `
        SELECT 
          call_outcome,
          COUNT(*) as count,
          AVG(duration_seconds) as avg_duration,
          AVG(cost_usd) as avg_cost,
          AVG(CASE WHEN ca.sentiment_score IS NOT NULL THEN ca.sentiment_score END) as avg_sentiment
        FROM calls c
        LEFT JOIN call_analytics ca ON c.id = ca.call_id
        WHERE c.created_at > NOW() - INTERVAL '30 days'
        GROUP BY call_outcome
        ORDER BY count DESC
      `

      const result = await pool.query(analysisQuery)
      const outcomes = result.rows

      const suggestions = []

      // Analyze outcomes and suggest improvements
      const totalCalls = outcomes.reduce((sum, outcome) => sum + parseInt(outcome.count), 0)
      const noAnswerCalls = outcomes.find(o => o.call_outcome === 'no-answer')
      const failedCalls = outcomes.find(o => o.call_outcome === 'failed')

      if (noAnswerCalls && (noAnswerCalls.count / totalCalls) > 0.3) {
        suggestions.push({
          type: 'timing_optimization',
          priority: 'high',
          suggestion: 'High no-answer rate detected. Consider calling during different hours or implementing retry logic.',
          data: { no_answer_rate: ((noAnswerCalls.count / totalCalls) * 100).toFixed(1) + '%' }
        })
      }

      if (failedCalls && (failedCalls.count / totalCalls) > 0.2) {
        suggestions.push({
          type: 'technical_optimization',
          priority: 'medium',
          suggestion: 'High failure rate detected. Check phone number validation and Twilio configuration.',
          data: { failure_rate: ((failedCalls.count / totalCalls) * 100).toFixed(1) + '%' }
        })
      }

      // Check average call duration
      const avgDuration = outcomes.reduce((sum, outcome) => {
        return sum + (parseFloat(outcome.avg_duration || 0) * outcome.count)
      }, 0) / totalCalls

      if (avgDuration > 300) { // 5 minutes
        suggestions.push({
          type: 'cost_optimization',
          priority: 'medium',
          suggestion: 'Average call duration is high. Consider optimizing agent responses for efficiency.',
          data: { avg_duration_minutes: (avgDuration / 60).toFixed(1) }
        })
      }

      // Check sentiment scores
      const avgSentiment = outcomes.reduce((sum, outcome) => {
        return sum + (parseFloat(outcome.avg_sentiment || 0) * outcome.count)
      }, 0) / totalCalls

      if (avgSentiment < 0.2) {
        suggestions.push({
          type: 'conversation_optimization',
          priority: 'high',
          suggestion: 'Low average sentiment detected. Consider improving agent conversation scripts.',
          data: { avg_sentiment: avgSentiment.toFixed(2) }
        })
      }

      await pool.end()

      return {
        analysis_period: '30 days',
        total_calls: totalCalls,
        outcomes: outcomes,
        suggestions: suggestions,
        generated_at: new Date().toISOString()
      }
    } catch (error) {
      console.error('Error getting optimization suggestions:', error)
      throw error
    }
  }

  // Generate comprehensive dashboard data
  async getDashboardData () {
    try {
      const [activeCalls, dailyCosts, alerts, suggestions] = await Promise.all([
        this.monitorActiveCalls(),
        this.checkDailyCosts(),
        this.getRecentAlerts(7),
        this.getOptimizationSuggestions()
      ])

      return {
        live_data: {
          active_calls: activeCalls,
          active_count: activeCalls.length
        },
        daily_metrics: dailyCosts,
        recent_alerts: alerts.slice(0, 10), // Last 10 alerts
        optimization: suggestions,
        system_health: await this.getSystemHealth(),
        generated_at: new Date().toISOString()
      }
    } catch (error) {
      console.error('Error getting dashboard data:', error)
      throw error
    }
  }

  // System health check
  async getSystemHealth () {
    try {
      const callService = require('./callService')
      const health = await callService.healthCheck()

      // Add additional health metrics
      const metrics = {
        ...health,
        uptime: process.uptime(),
        memory_usage: process.memoryUsage(),
        cpu_usage: process.cpuUsage(),
        node_version: process.version
      }

      return metrics
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      }
    }
  }

  // Schedule monitoring tasks
  startMonitoring () {
    // Monitor active calls every 5 minutes
    setInterval(async () => {
      try {
        await this.monitorActiveCalls()
      } catch (error) {
        console.error('Active call monitoring failed:', error)
      }
    }, 5 * 60 * 1000)

    // Check daily costs every hour
    setInterval(async () => {
      try {
        await this.checkDailyCosts()
      } catch (error) {
        console.error('Cost monitoring failed:', error)
      }
    }, 60 * 60 * 1000)

    console.log('📊 Call monitoring service started')
  }
}

module.exports = new CallMonitoringService()
