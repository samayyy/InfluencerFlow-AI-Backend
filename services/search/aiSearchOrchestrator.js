// services/search/aiSearchOrchestrator.js
const queryIntelligenceService = require('../ai/queryIntelligenceService')
const vectorSearchService = require('./vectorSearchService')
const creatorService = require('../creators/creatorService')

class AISearchOrchestrator {
  constructor () {
    this.searchStrategies = {
      find_creators: this.executeGeneralSearch.bind(this),
      find_similar: this.executeSimilaritySearch.bind(this),
      audience_match: this.executeAudienceSearch.bind(this),
      content_match: this.executeContentSearch.bind(this),
      brand_match: this.executeBrandSearch.bind(this)
    }
  }

  async initialize () {
    try {
      await vectorSearchService.initialize()
      console.log('AI Search Orchestrator initialized successfully')
    } catch (error) {
      console.error('Failed to initialize AI Search Orchestrator:', error)
      throw new Error(
        `AI Search Orchestrator initialization failed: ${error.message}`
      )
    }
  }

  // Main search entry point
  async search (query, options = {}) {
    try {
      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        return {
          success: false,
          errors: ['Query is required and must be a non-empty string'],
          suggestions: ['Please provide a valid search query']
        }
      }

      const startTime = Date.now()

      // Validate query
      const validation = queryIntelligenceService.validateQuery(query)
      if (!validation.isValid) {
        return {
          success: false,
          errors: validation.errors,
          suggestions: validation.suggestions
        }
      }

      console.log(`🔍 Processing search query: "${query}"`)

      // Analyze query to understand intent and extract parameters
      const queryAnalysis = await queryIntelligenceService.analyzeQuery(query)

      if (!queryAnalysis) {
        return {
          success: false,
          errors: ['Failed to analyze query'],
          suggestions: ['Try simplifying your search query']
        }
      }

      console.log('📊 Query analysis:', {
        intent: queryAnalysis.search_intent,
        confidence: queryAnalysis.confidence_score,
        filters: Object.keys(queryAnalysis.filters || {}).filter(
          (key) => queryAnalysis.filters[key] !== null
        )
      })

      // Merge options with analyzed filters
      const searchOptions = {
        ...options,
        filters: { ...queryAnalysis.filters, ...options.filters },
        maxResults: options.maxResults || 20,
        includeMetadata: options.includeMetadata !== false,
        useHybridSearch: options.useHybridSearch !== false
      }

      // Execute search based on detected intent
      const searchStrategy =
        this.searchStrategies[queryAnalysis.search_intent] ||
        this.executeGeneralSearch
      const searchResults = await searchStrategy(queryAnalysis, searchOptions)

      // Get full creator details for top results
      const enrichedResults = await this.enrichResultsWithCreatorData(
        searchResults.results,
        searchOptions.maxResults
      )

      // Calculate search performance metrics
      const executionTime = Date.now() - startTime

      // Format final response
      const response = {
        success: true,
        results: enrichedResults,
        metadata: {
          query_analysis: queryAnalysis,
          search_strategy: queryAnalysis.search_intent,
          total_results: searchResults.total_matches,
          execution_time_ms: executionTime,
          hybrid_search_used: searchOptions.useHybridSearch,
          confidence_score: queryAnalysis.confidence_score,
          filters_applied: this.getAppliedFilters(queryAnalysis.filters)
        },
        suggestions: validation.suggestions
      }

      console.log(
        `✅ Search completed in ${executionTime}ms with ${enrichedResults.length} results`
      )
      return response
    } catch (error) {
      console.error('Error in AI search orchestrator:', error)
      return {
        success: false,
        error: error.message,
        fallback_suggestion:
          'Try simplifying your search query or use basic filters'
      }
    }
  }

  // General creator search
  async executeGeneralSearch (queryAnalysis, options) {
    const { useHybridSearch, filters, maxResults } = options

    try {
      if (useHybridSearch) {
        // Combine vector search with traditional search
        const searchPromises = []

        // Vector search
        if (queryAnalysis.original_query) {
          searchPromises.push(
            vectorSearchService
              .semanticSearch(queryAnalysis.original_query, {
                filters: filters || {},
                topK: Math.ceil(maxResults * 0.7) // 70% from vector search
              })
              .catch((error) => {
                console.error('Vector search failed:', error)
                return {
                  results: [],
                  total_matches: 0,
                  search_type: 'vector_failed'
                }
              })
          )
        }

        // Traditional search
        if (queryAnalysis.original_query) {
          searchPromises.push(
            creatorService
              .searchCreators(queryAnalysis.original_query, filters || {}, {
                limit: Math.ceil(maxResults * 0.3) // 30% from traditional search
              })
              .catch((error) => {
                console.error('Traditional search failed:', error)
                return []
              })
          )
        }

        const [vectorResults, traditionalResults] = await Promise.all(
          searchPromises
        )

        // Merge and deduplicate results
        return this.mergeSearchResults(
          vectorResults,
          traditionalResults,
          maxResults
        )
      } else {
        // Pure vector search
        if (!queryAnalysis.original_query) {
          throw new Error('No query available for vector search')
        }

        return await vectorSearchService.semanticSearch(
          queryAnalysis.original_query,
          {
            filters: filters || {},
            topK: maxResults
          }
        )
      }
    } catch (error) {
      console.error('Error in executeGeneralSearch:', error)
      // Return empty results instead of throwing
      return {
        results: [],
        total_matches: 0,
        search_type: 'general_failed',
        error: error.message
      }
    }
  }

  // Find creators similar to a specific creator
  async executeSimilaritySearch (queryAnalysis, options) {
    const { filters, maxResults } = options

    if (queryAnalysis.similar_to_creator) {
      try {
        // Find creator by name first
        const potentialCreators = await creatorService.searchCreators(
          queryAnalysis.similar_to_creator,
          {},
          { limit: 5 }
        )

        if (potentialCreators.length > 0) {
          const referenceCreator = potentialCreators[0]
          console.log(
            `🔍 Finding creators similar to: ${referenceCreator.creator_name} (UUID: ${referenceCreator.id})`
          )

          return await vectorSearchService.findSimilarCreators(
            referenceCreator.id, // This is now a UUID
            {
              filters,
              topK: maxResults
            }
          )
        }
      } catch (error) {
        console.error('Error in similarity search:', error)
      }
    }

    // Fallback to general semantic search
    return await this.executeGeneralSearch(queryAnalysis, options)
  }

  // Search focused on audience matching
  async executeAudienceSearch (queryAnalysis, options) {
    const { filters, maxResults } = options

    try {
      if (queryAnalysis.search_aspects.audience) {
        return await vectorSearchService.searchByAudience(
          queryAnalysis.search_aspects.audience,
          { filters: filters || {}, topK: maxResults }
        )
      }

      // Use original query instead of enhanced for better matching
      return await vectorSearchService.semanticSearch(
        queryAnalysis.original_query,
        {
          filters: filters || {},
          topK: maxResults,
          minScore: 0.2 // Use consistent low threshold
        }
      )
    } catch (error) {
      console.error('Error in executeAudienceSearch:', error)
      return {
        results: [],
        total_matches: 0,
        search_type: 'audience_failed',
        error: error.message
      }
    }
  }

  // Search focused on content style matching
  async executeContentSearch (queryAnalysis, options) {
    const { filters, maxResults } = options

    try {
      if (queryAnalysis.search_aspects.content) {
        return await vectorSearchService.searchByContentStyle(
          queryAnalysis.search_aspects.content,
          { filters: filters || {}, topK: maxResults }
        )
      }

      // Use original query for better matching
      return await vectorSearchService.semanticSearch(
        queryAnalysis.original_query,
        {
          filters: filters || {},
          topK: maxResults,
          minScore: 0.2
        }
      )
    } catch (error) {
      console.error('Error in executeContentSearch:', error)
      return {
        results: [],
        total_matches: 0,
        search_type: 'content_failed',
        error: error.message
      }
    }
  }

  // Search focused on brand collaboration history
  async executeBrandSearch (queryAnalysis, options) {
    const { filters, maxResults } = options

    try {
      if (queryAnalysis.search_aspects.brands) {
        return await vectorSearchService.searchByBrandHistory(
          queryAnalysis.search_aspects.brands,
          { filters: filters || {}, topK: maxResults }
        )
      }

      // Use original query for better matching
      return await vectorSearchService.semanticSearch(
        queryAnalysis.original_query,
        {
          filters: filters || {},
          topK: maxResults,
          minScore: 0.2
        }
      )
    } catch (error) {
      console.error('Error in executeBrandSearch:', error)
      return {
        results: [],
        total_matches: 0,
        search_type: 'brand_failed',
        error: error.message
      }
    }
  }

  // Merge vector search and traditional search results
  mergeSearchResults (vectorResults, traditionalResults, maxResults) {
    const mergedResults = new Map()
    const allResults = []

    // Add vector search results with boost
    vectorResults.results.forEach((result, index) => {
      const creatorId = result.creator_id
      const boostedScore = result.similarity_score * 1.2 // Boost vector search

      mergedResults.set(creatorId, {
        creator_id: creatorId,
        combined_score: boostedScore,
        similarity_score: result.similarity_score,
        search_rank: index + 1,
        metadata: result.metadata,
        source: 'vector'
      })
    })

    // Add traditional search results
    traditionalResults.forEach((result, index) => {
      const creatorId = result.id.toString()

      if (mergedResults.has(creatorId)) {
        // Creator found in both searches - combine scores
        const existing = mergedResults.get(creatorId)
        existing.combined_score =
          (existing.combined_score + (result.search_rank || 0.8)) / 2
        existing.source = 'hybrid'
      } else {
        // New creator from traditional search
        mergedResults.set(creatorId, {
          creator_id: creatorId,
          combined_score: result.search_rank || 0.7,
          search_rank: index + 1,
          metadata: this.extractMetadataFromCreator(result),
          source: 'traditional'
        })
      }
    })

    // Convert to array and sort by combined score
    const sortedResults = Array.from(mergedResults.values())
      .sort((a, b) => b.combined_score - a.combined_score)
      .slice(0, maxResults)

    return {
      results: sortedResults,
      total_matches: mergedResults.size,
      search_type: 'hybrid'
    }
  }

  // Extract metadata from traditional search creator object
  extractMetadataFromCreator (creator) {
    return {
      creator_id: creator.id
        ? creator.id.toString()
        : String(creator.id || 'unknown'),
      creator_name: creator.creator_name || 'Unknown',
      niche: creator.niche || 'general',
      tier: creator.tier || 'micro',
      primary_platform: creator.primary_platform || 'instagram',
      location_country: creator.location_country || 'Unknown',
      ai_enhanced: creator.ai_enhanced || false,
      follower_count:
        creator.platform_metrics?.[creator.primary_platform]?.follower_count ||
        0,
      engagement_rate:
        creator.platform_metrics?.[creator.primary_platform]?.engagement_rate ||
        0
    }
  }

  // Enrich search results with full creator data
  async enrichResultsWithCreatorData (searchResults, limit) {
    const creatorIds = searchResults
      .slice(0, limit)
      .map((result) => result.creator_id)
      .filter((id) => id && id !== 'unknown') // Filter out invalid IDs

    if (creatorIds.length === 0) {
      console.warn('No valid creator IDs found in search results')
      return []
    }

    try {
      console.log(
        `📋 Enriching ${creatorIds.length} creators with full data...`
      )

      // ✅ Fetch full creator details using UUIDs
      const creators = await Promise.all(
        creatorIds.map(async (id) => {
          try {
            // Ensure ID is properly formatted for UUID query
            const creator = await creatorService.getCreatorById(id)
            return creator
          } catch (error) {
            console.error(
              `Failed to fetch creator with UUID ${id}:`,
              error.message
            )
            return null
          }
        })
      )

      // Combine search metadata with creator data
      const enrichedResults = []

      for (let i = 0; i < Math.min(searchResults.length, limit); i++) {
        const searchResult = searchResults[i]
        const creator = creators[i]

        if (!creator) {
          console.warn(
            `Creator not found for UUID: ${searchResult.creator_id}`
          )
          continue // Skip missing creators instead of including error
        }

        enrichedResults.push({
          search_score:
            searchResult.similarity_score || searchResult.combined_score,
          search_rank: i + 1,
          creator_data: creator,
          search_metadata: {
            source: searchResult.source || 'vector',
            similarity_score: searchResult.similarity_score,
            combined_score: searchResult.combined_score,
            creator_uuid: creator.id,
            ai_enhanced: creator.ai_enhanced || false
          }
        })
      }

      console.log(
        `✅ Successfully enriched ${enrichedResults.length} creator results`
      )
      return enrichedResults
    } catch (error) {
      console.error('Error enriching results with creator data:', error)

      // Return basic results without enrichment
      return searchResults.slice(0, limit).map((result, index) => ({
        search_score: result.similarity_score || result.combined_score,
        search_rank: index + 1,
        creator_id: result.creator_id,
        metadata: result.metadata,
        error: 'Failed to load creator details',
        creator_uuid: result.creator_id
      }))
    }
  }

  // Get list of applied filters for metadata
  getAppliedFilters (filters) {
    return Object.entries(filters)
      .filter(([key, value]) => value !== null && value !== undefined)
      .map(([key, value]) => ({ filter: key, value }))
  }

  // Generate search suggestions
  async getSearchSuggestions (partialQuery, options = {}) {
    try {
      const [aiSuggestions, vectorSuggestions] = await Promise.all([
        queryIntelligenceService.generateSearchSuggestions(partialQuery),
        vectorSearchService.getSearchSuggestions(partialQuery, options)
      ])

      // Combine and deduplicate suggestions
      const allSuggestions = [
        ...aiSuggestions,
        ...vectorSuggestions.map((s) => s.suggestion)
      ]

      // Remove duplicates and limit results
      const uniqueSuggestions = [...new Set(allSuggestions)].slice(0, 8)

      return {
        suggestions: uniqueSuggestions,
        sources: {
          ai_generated: aiSuggestions.length,
          vector_based: vectorSuggestions.length
        }
      }
    } catch (error) {
      console.error('Error generating search suggestions:', error)
      return {
        suggestions: [
          `${partialQuery} creators`,
          `${partialQuery} influencers`,
          `micro ${partialQuery}`,
          `${partialQuery} content creators`
        ],
        sources: { fallback: true }
      }
    }
  }

  // Advanced multi-criteria search
  async advancedSearch (searchCriteria, options = {}) {
    try {
      const {
        content_focus,
        audience_focus,
        brand_focus,
        budget_range,
        performance_metrics,
        maxResults = 20
      } = searchCriteria

      // Build multi-aspect search
      const searchAspects = {}
      const aspectWeights = {}

      if (content_focus) {
        searchAspects.content = content_focus
        aspectWeights.contentWeight = 1.0
      }

      if (audience_focus) {
        searchAspects.audience = audience_focus
        aspectWeights.audienceWeight = 1.2 // Boost audience matching
      }

      if (brand_focus) {
        searchAspects.brands = brand_focus
        aspectWeights.brandsWeight = 0.8
      }

      // Add budget constraints to filters
      const filters = { ...options.filters }
      if (budget_range) {
        if (budget_range.min) filters.min_budget = budget_range.min
        if (budget_range.max) filters.max_budget = budget_range.max
      }

      // Add performance criteria
      if (performance_metrics) {
        if (performance_metrics.min_engagement_rate) {
          filters.min_engagement_rate = performance_metrics.min_engagement_rate
        }
        if (performance_metrics.min_followers) {
          filters.min_followers = performance_metrics.min_followers
        }
      }

      // Execute multi-aspect search
      const results = await vectorSearchService.multiAspectSearch(
        { ...searchAspects, ...aspectWeights },
        { filters, topK: maxResults }
      )

      // Enrich with creator data
      const enrichedResults = await this.enrichResultsWithCreatorData(
        results.results,
        maxResults
      )

      return {
        success: true,
        results: enrichedResults,
        metadata: {
          search_criteria: searchCriteria,
          search_type: 'advanced_multi_criteria',
          aspects_searched: Object.keys(searchAspects),
          total_results: results.total_aspects_searched
        }
      }
    } catch (error) {
      console.error('Error in advanced search:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  // Health check for the entire search system
  async healthCheck () {
    try {
      const [vectorHealth, queryHealth] = await Promise.all([
        vectorSearchService.healthCheck(),
        this.testQueryProcessing()
      ])

      return {
        status: 'healthy',
        components: {
          vector_search: vectorHealth,
          query_processing: queryHealth,
          orchestrator: {
            status: 'healthy',
            service: 'ai_search_orchestrator'
          }
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

  // Test query processing capabilities
  async testQueryProcessing () {
    try {
      const testQuery = 'tech YouTubers with high engagement'
      const analysis = await queryIntelligenceService.analyzeQuery(testQuery)

      return {
        status: 'healthy',
        test_query_processed: true,
        confidence_score: analysis.confidence_score,
        service: 'query_intelligence'
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        service: 'query_intelligence'
      }
    }
  }
}

module.exports = new AISearchOrchestrator()
