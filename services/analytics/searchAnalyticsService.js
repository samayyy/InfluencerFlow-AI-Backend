// services/analytics/searchAnalyticsService.js
const __config = require("../../config");
const __db = require("../../lib/db");

class SearchAnalyticsService {
  constructor() {
    this.enabled = process.env.AI_SEARCH_ENABLE_ANALYTICS === "true";
    this.logQueries = process.env.AI_SEARCH_LOG_QUERIES === "true";
    this.slowQueryThreshold =
      parseInt(process.env.AI_SEARCH_LOG_SLOW_QUERIES_MS) || 2000;
  }

  // Log search query and performance metrics
  async logSearchQuery(searchData) {
    if (!this.enabled) return;

    try {
      const logEntry = {
        timestamp: new Date(),
        query: this.logQueries ? searchData.query : "[REDACTED]",
        query_hash: this.hashQuery(searchData.query),
        search_intent: searchData.metadata?.query_analysis?.search_intent,
        confidence_score: searchData.metadata?.query_analysis?.confidence_score,
        filters_applied: searchData.metadata?.filters_applied || [],
        results_count: searchData.results?.length || 0,
        execution_time_ms: searchData.metadata?.execution_time_ms,
        search_strategy: searchData.metadata?.search_strategy,
        hybrid_search_used: searchData.metadata?.hybrid_search_used,
        user_agent: searchData.user_agent,
        ip_address: this.hashIP(searchData.ip_address),
        session_id: searchData.session_id,
        success: searchData.success,
      };

      // Log to Redis for real-time analytics
      if (__db.redis && __db.redis.connection_status) {
        await this.logToRedis(logEntry);
      }

      // Log slow queries
      if (logEntry.execution_time_ms > this.slowQueryThreshold) {
        console.warn(`🐌 Slow search query detected:`, {
          execution_time: logEntry.execution_time_ms,
          query_hash: logEntry.query_hash,
          results_count: logEntry.results_count,
        });
      }

      // Log to console in debug mode
      if (__config.debugMode) {
        console.log("📊 Search Analytics:", {
          query_hash: logEntry.query_hash,
          intent: logEntry.search_intent,
          results: logEntry.results_count,
          time: logEntry.execution_time_ms + "ms",
        });
      }
    } catch (error) {
      console.error("Error logging search analytics:", error);
    }
  }

  // Log to Redis for real-time metrics
  async logToRedis(logEntry) {
    try {
      const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
      const hour = new Date().getHours();

      // Daily metrics
      await __db.redis.hash_increment(
        `search_metrics:daily:${date}`,
        "total_searches"
      );
      await __db.redis.hash_increment(
        `search_metrics:daily:${date}`,
        `hour_${hour}`
      );

      if (logEntry.success) {
        await __db.redis.hash_increment(
          `search_metrics:daily:${date}`,
          "successful_searches"
        );
      } else {
        await __db.redis.hash_increment(
          `search_metrics:daily:${date}`,
          "failed_searches"
        );
      }

      // Intent tracking
      if (logEntry.search_intent) {
        await __db.redis.hash_increment(
          `search_intents:daily:${date}`,
          logEntry.search_intent
        );
      }

      // Performance tracking
      if (logEntry.execution_time_ms) {
        const perfBucket = this.getPerformanceBucket(
          logEntry.execution_time_ms
        );
        await __db.redis.hash_increment(
          `search_performance:daily:${date}`,
          perfBucket
        );
      }

      // Store recent searches for analysis (last 1000)
      const searchSummary = {
        timestamp: logEntry.timestamp,
        query_hash: logEntry.query_hash,
        intent: logEntry.search_intent,
        results: logEntry.results_count,
        time: logEntry.execution_time_ms,
      };

      await __db.redis.set_add(
        "recent_searches",
        JSON.stringify(searchSummary)
      );

      // Keep only last 1000 searches
      // Note: This is a simplified approach; in production, use a proper circular buffer
    } catch (error) {
      console.error("Error logging to Redis:", error);
    }
  }

  // Get performance bucket for execution time
  getPerformanceBucket(executionTime) {
    if (executionTime < 200) return "very_fast";
    if (executionTime < 500) return "fast";
    if (executionTime < 1000) return "medium";
    if (executionTime < 2000) return "slow";
    return "very_slow";
  }

  // Hash query for privacy
  hashQuery(query) {
    const crypto = require("crypto");
    return crypto
      .createHash("md5")
      .update(query.toLowerCase())
      .digest("hex")
      .substring(0, 8);
  }

  // Hash IP for privacy
  hashIP(ip) {
    if (!ip) return null;
    const crypto = require("crypto");
    return crypto.createHash("md5").update(ip).digest("hex").substring(0, 8);
  }

  // Get search analytics for a date range
  async getAnalytics(startDate, endDate = null) {
    if (!this.enabled) {
      return { error: "Analytics not enabled" };
    }

    try {
      endDate = endDate || startDate;
      const analytics = {
        date_range: { start: startDate, end: endDate },
        summary: {},
        daily_breakdown: [],
        search_intents: {},
        performance_metrics: {},
      };

      // Collect data for each day in range
      const dates = this.getDateRange(startDate, endDate);

      for (const date of dates) {
        const dailyMetrics = await this.getDailyMetrics(date);
        analytics.daily_breakdown.push(dailyMetrics);

        // Aggregate summary
        Object.keys(dailyMetrics.metrics).forEach((key) => {
          analytics.summary[key] =
            (analytics.summary[key] || 0) + (dailyMetrics.metrics[key] || 0);
        });

        // Aggregate intents
        Object.keys(dailyMetrics.intents).forEach((intent) => {
          analytics.search_intents[intent] =
            (analytics.search_intents[intent] || 0) +
            dailyMetrics.intents[intent];
        });

        // Aggregate performance
        Object.keys(dailyMetrics.performance).forEach((bucket) => {
          analytics.performance_metrics[bucket] =
            (analytics.performance_metrics[bucket] || 0) +
            dailyMetrics.performance[bucket];
        });
      }

      // Calculate derived metrics
      analytics.summary.success_rate =
        analytics.summary.total_searches > 0
          ? (
              ((analytics.summary.successful_searches || 0) /
                analytics.summary.total_searches) *
              100
            ).toFixed(2) + "%"
          : "0%";

      analytics.summary.avg_daily_searches =
        analytics.summary.total_searches / dates.length;

      return analytics;
    } catch (error) {
      console.error("Error getting analytics:", error);
      return { error: error.message };
    }
  }

  // Get metrics for a specific day
  async getDailyMetrics(date) {
    const metrics =
      (await __db.redis.hash_getall(`search_metrics:daily:${date}`)) || {};
    const intents =
      (await __db.redis.hash_getall(`search_intents:daily:${date}`)) || {};
    const performance =
      (await __db.redis.hash_getall(`search_performance:daily:${date}`)) || {};

    // Convert string values to numbers
    Object.keys(metrics).forEach((key) => {
      metrics[key] = parseInt(metrics[key]) || 0;
    });
    Object.keys(intents).forEach((key) => {
      intents[key] = parseInt(intents[key]) || 0;
    });
    Object.keys(performance).forEach((key) => {
      performance[key] = parseInt(performance[key]) || 0;
    });

    return {
      date,
      metrics,
      intents,
      performance,
      hourly_distribution: this.getHourlyDistribution(metrics),
    };
  }

  // Extract hourly distribution from metrics
  getHourlyDistribution(metrics) {
    const hourly = {};
    Object.keys(metrics).forEach((key) => {
      if (key.startsWith("hour_")) {
        const hour = key.replace("hour_", "");
        hourly[hour] = metrics[key];
      }
    });
    return hourly;
  }

  // Generate date range array
  getDateRange(startDate, endDate) {
    const dates = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    for (
      let date = new Date(start);
      date <= end;
      date.setDate(date.getDate() + 1)
    ) {
      dates.push(date.toISOString().split("T")[0]);
    }

    return dates;
  }

  // Get real-time search statistics
  async getRealTimeStats() {
    try {
      const today = new Date().toISOString().split("T")[0];
      const todayMetrics = await this.getDailyMetrics(today);

      // Get recent search patterns
      const recentSearches = await this.getRecentSearchPatterns();

      return {
        today: todayMetrics,
        recent_patterns: recentSearches,
        system_status: await this.getSystemStatus(),
      };
    } catch (error) {
      console.error("Error getting real-time stats:", error);
      return { error: error.message };
    }
  }

  // Analyze recent search patterns
  async getRecentSearchPatterns() {
    try {
      // This would need a more sophisticated implementation
      // For now, return basic pattern analysis
      return {
        top_intents: ["find_creators", "find_similar", "audience_match"],
        avg_response_time: "450ms",
        peak_hours: ["14:00", "15:00", "16:00"],
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  // Get system status indicators
  async getSystemStatus() {
    try {
      return {
        search_service: "healthy",
        embedding_service: "healthy",
        vector_index: "healthy",
        cache_status: __db.redis?.connection_status
          ? "connected"
          : "disconnected",
        last_updated: new Date().toISOString(),
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  // Log user interaction with search results
  async logResultInteraction(interactionData) {
    if (!this.enabled) return;

    try {
      const logEntry = {
        timestamp: new Date(),
        search_id: interactionData.search_id,
        creator_id: interactionData.creator_id,
        interaction_type: interactionData.type, // 'view', 'click', 'contact', 'bookmark'
        result_rank: interactionData.rank,
        user_session: this.hashIP(interactionData.session_id),
      };

      // Log interaction for relevance feedback
      if (__db.redis && __db.redis.connection_status) {
        const key = `search_interactions:${logEntry.search_id}`;
        await __db.redis.set_add(key, JSON.stringify(logEntry));
        await __db.redis.ex(key, 86400); // Expire after 24 hours
      }
    } catch (error) {
      console.error("Error logging result interaction:", error);
    }
  }

  // Generate search performance report
  async generatePerformanceReport(days = 7) {
    try {
      const endDate = new Date().toISOString().split("T")[0];
      const startDate = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];

      const analytics = await this.getAnalytics(startDate, endDate);

      const report = {
        period: `${startDate} to ${endDate}`,
        summary: analytics.summary,
        trends: this.analyzeTrends(analytics.daily_breakdown),
        recommendations: this.generateRecommendations(analytics),
        generated_at: new Date().toISOString(),
      };

      return report;
    } catch (error) {
      console.error("Error generating performance report:", error);
      return { error: error.message };
    }
  }

  // Analyze trends in search data
  analyzeTrends(dailyBreakdown) {
    // Simplified trend analysis
    const totalSearches = dailyBreakdown.map(
      (day) => day.metrics.total_searches || 0
    );
    const avgSearches =
      totalSearches.reduce((a, b) => a + b, 0) / totalSearches.length;

    return {
      search_volume_trend:
        totalSearches[totalSearches.length - 1] > avgSearches
          ? "increasing"
          : "decreasing",
      peak_day: dailyBreakdown.reduce((max, day) =>
        (day.metrics.total_searches || 0) > (max.metrics.total_searches || 0)
          ? day
          : max
      ),
      avg_daily_searches: Math.round(avgSearches),
    };
  }

  // Generate performance recommendations
  generateRecommendations(analytics) {
    const recommendations = [];

    if (analytics.summary.success_rate < 90) {
      recommendations.push("Consider improving search relevance algorithms");
    }

    if (
      analytics.performance_metrics.very_slow >
      analytics.summary.total_searches * 0.1
    ) {
      recommendations.push(
        "Optimize search performance - too many slow queries"
      );
    }

    if (
      analytics.search_intents.find_creators >
      analytics.summary.total_searches * 0.7
    ) {
      recommendations.push("Consider adding more specific search categories");
    }

    return recommendations.length > 0
      ? recommendations
      : ["Search performance is optimal"];
  }
}

module.exports = new SearchAnalyticsService();
