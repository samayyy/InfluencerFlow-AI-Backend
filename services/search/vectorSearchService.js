// services/search/vectorSearchService.js
const embeddingService = require('../ai/embeddingService')
const OpenAI = require('openai')

class VectorSearchService {
  constructor () {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    })
    this.embeddingModel = 'text-embedding-3-large'
  }

  async initialize () {
    try {
      await embeddingService.initializePineconeIndex()
      this.index = embeddingService.index
      console.log('Vector search service initialized successfully')
    } catch (error) {
      console.error('Failed to initialize vector search service:', error)
      throw new Error(`Vector search initialization failed: ${error.message}`)
    }
  }

  // Convert search query to embedding
  async queryToEmbedding (query) {
    try {
      const response = await this.openai.embeddings.create({
        model: this.embeddingModel,
        input: query,
        encoding_format: 'float'
      })

      return response.data[0].embedding
    } catch (error) {
      console.error('Error converting query to embedding:', error)
      throw error
    }
  }

  // Build Pinecone filter based on search criteria
  buildPineconeFilter (filters = {}) {
    const pineconeFilter = {}

    if (filters.niche) {
      pineconeFilter.niche = { $eq: filters.niche }
    }

    if (filters.tier) {
      pineconeFilter.tier = { $eq: filters.tier }
    }

    if (filters.primary_platform) {
      pineconeFilter.primary_platform = { $eq: filters.primary_platform }
    }

    if (filters.location_country) {
      pineconeFilter.location_country = { $eq: filters.location_country }
    }

    if (filters.verification_status) {
      pineconeFilter.verification_status = { $eq: filters.verification_status }
    }

    // Numeric range filters
    if (filters.min_followers) {
      pineconeFilter.follower_count = {
        ...pineconeFilter.follower_count,
        $gte: filters.min_followers
      }
    }

    if (filters.max_followers) {
      pineconeFilter.follower_count = {
        ...pineconeFilter.follower_count,
        $lte: filters.max_followers
      }
    }

    if (filters.min_engagement_rate) {
      pineconeFilter.engagement_rate = {
        ...pineconeFilter.engagement_rate,
        $gte: filters.min_engagement_rate
      }
    }

    if (filters.max_engagement_rate) {
      pineconeFilter.engagement_rate = {
        ...pineconeFilter.engagement_rate,
        $lte: filters.max_engagement_rate
      }
    }

    if (filters.min_budget && filters.max_budget) {
      pineconeFilter.sponsored_post_rate = {
        $gte: filters.min_budget,
        $lte: filters.max_budget
      }
    } else if (filters.max_budget) {
      pineconeFilter.sponsored_post_rate = { $lte: filters.max_budget }
    }

    if (filters.min_satisfaction_score) {
      pineconeFilter.client_satisfaction_score = {
        $gte: filters.min_satisfaction_score
      }
    }

    if (filters.audience_age_primary) {
      pineconeFilter.audience_age_primary = {
        $eq: filters.audience_age_primary
      }
    }

    if (filters.audience_gender_primary) {
      pineconeFilter.audience_gender_primary = {
        $eq: filters.audience_gender_primary
      }
    }

    return Object.keys(pineconeFilter).length > 0 ? pineconeFilter : undefined
  }

  // Perform semantic search
  async semanticSearch (query, options = {}) {
    try {
      if (!query) {
        throw new Error('Query parameter is required for semantic search')
      }

      if (!this.index) {
        throw new Error(
          'Vector search service not initialized. Call initialize() first.'
        )
      }

      const {
        filters = {},
        topK = 20,
        includeMetadata = true,
        minScore = 0.2 // Lowered from 0.4 to 0.2 based on debug results
      } = options

      console.log(`Performing semantic search for: "${query}"`)

      // Convert query to embedding
      const queryEmbedding = await this.queryToEmbedding(query)

      // Build Pinecone filter
      const pineconeFilter = this.buildPineconeFilter(filters)

      // Search Pinecone
      const searchParams = {
        vector: queryEmbedding,
        topK: topK,
        includeMetadata: includeMetadata
      }

      if (pineconeFilter) {
        searchParams.filter = pineconeFilter
      }

      const searchResults = await this.index.query(searchParams)

      // Filter by minimum score and format results
      const filteredResults = searchResults.matches
        .filter((match) => match.score >= minScore)
        .map((match) => ({
          creator_id: match.metadata.creator_id,
          similarity_score: match.score,
          metadata: match.metadata
        }))

      console.log(`Found ${filteredResults.length} semantic matches`)

      return {
        results: filteredResults,
        total_matches: filteredResults.length,
        query_embedding_generated: true,
        filters_applied: pineconeFilter ? Object.keys(pineconeFilter) : [],
        search_type: 'semantic'
      }
    } catch (error) {
      console.error('Error in semantic search:', error)
      throw error
    }
  }

  // Find similar creators to a given creator
  async findSimilarCreators (creatorId, options = {}) {
    try {
      if (!creatorId) {
        throw new Error('Creator ID is required')
      }

      if (!this.index) {
        throw new Error(
          'Vector search service not initialized. Call initialize() first.'
        )
      }

      const { topK = 10, filters = {}, includeOriginal = false } = options

      console.log(`Finding creators similar to creator UUID: ${creatorId}`)

      // ✅ Get the creator's vector from Pinecone (UUID format)
      const vectorId = `creator_${creatorId}`
      const fetchResult = await this.index.fetch([vectorId])

      if (!fetchResult.vectors || !fetchResult.vectors[vectorId]) {
        throw new Error(`Creator ${creatorId} not found in vector index`)
      }

      const creatorVector = fetchResult.vectors[vectorId].values
      const pineconeFilter = this.buildPineconeFilter(filters)

      // Search for similar vectors
      const searchParams = {
        vector: creatorVector,
        topK: includeOriginal ? topK : topK + 1,
        includeMetadata: true
      }

      if (pineconeFilter) {
        searchParams.filter = pineconeFilter
      }

      const searchResults = await this.index.query(searchParams)

      if (!searchResults.matches) {
        return {
          results: [],
          reference_creator_id: creatorId,
          total_matches: 0,
          search_type: 'similarity'
        }
      }

      // Remove the original creator from results if not wanted
      let filteredResults = searchResults.matches
      if (!includeOriginal) {
        filteredResults = filteredResults.filter(
          (match) =>
            match.metadata && match.metadata.creator_id !== creatorId.toString()
        )
      }

      // Format results
      const similarCreators = filteredResults.map((match) => ({
        creator_id: match.metadata?.creator_id || 'unknown',
        similarity_score: match.score || 0,
        metadata: match.metadata || {}
      }))

      console.log(
        `Found ${similarCreators.length} similar creators to UUID: ${creatorId}`
      )

      return {
        results: similarCreators,
        reference_creator_id: creatorId,
        total_matches: similarCreators.length,
        search_type: 'similarity'
      }
    } catch (error) {
      console.error('Error finding similar creators:', error)
      throw error
    }
  }

  // Search by specific criteria with vector similarity
  async searchByAudience (audienceDescription, options = {}) {
    try {
      if (!audienceDescription) {
        throw new Error('Audience description is required')
      }

      const { filters = {}, topK = 15 } = options

      // Enhanced query for audience matching
      const enhancedQuery = `Creator with audience that ${audienceDescription}. Target audience demographics and interests: ${audienceDescription}`

      return await this.semanticSearch(enhancedQuery, {
        filters,
        topK,
        minScore: 0.2 // Lowered threshold for audience matching
      })
    } catch (error) {
      console.error('Error in audience-based search:', error)
      throw error
    }
  }

  // Search by content style and niche
  async searchByContentStyle (contentDescription, options = {}) {
    try {
      if (!contentDescription) {
        throw new Error('Content description is required')
      }

      const { filters = {}, topK = 15 } = options

      const enhancedQuery = `Creator who creates ${contentDescription}. Content style and type: ${contentDescription}`

      return await this.semanticSearch(enhancedQuery, {
        filters,
        topK,
        minScore: 0.2
      })
    } catch (error) {
      console.error('Error in content style search:', error)
      throw error
    }
  }

  // Search by brand collaboration history
  async searchByBrandHistory (brandQuery, options = {}) {
    try {
      if (!brandQuery) {
        throw new Error('Brand query is required')
      }

      const { filters = {}, topK = 15 } = options

      const enhancedQuery = `Creator who has worked with brands like ${brandQuery}. Brand collaboration history: ${brandQuery}`

      return await this.semanticSearch(enhancedQuery, {
        filters,
        topK,
        minScore: 0.2
      })
    } catch (error) {
      console.error('Error in brand history search:', error)
      throw error
    }
  }

  // Multi-vector search combining different aspects
  async multiAspectSearch (searchAspects, options = {}) {
    try {
      if (!searchAspects || typeof searchAspects !== 'object') {
        throw new Error('Search aspects must be provided as an object')
      }

      const { filters = {}, topK = 20, weightedCombination = true } = options

      const searches = []

      // Perform searches for each aspect
      if (searchAspects.content && typeof searchAspects.content === 'string') {
        searches.push({
          type: 'content',
          weight: searchAspects.contentWeight || 1.0,
          results: await this.searchByContentStyle(searchAspects.content, {
            filters,
            topK
          })
        })
      }

      if (
        searchAspects.audience &&
        typeof searchAspects.audience === 'string'
      ) {
        searches.push({
          type: 'audience',
          weight: searchAspects.audienceWeight || 1.0,
          results: await this.searchByAudience(searchAspects.audience, {
            filters,
            topK
          })
        })
      }

      if (searchAspects.brands && typeof searchAspects.brands === 'string') {
        searches.push({
          type: 'brands',
          weight: searchAspects.brandsWeight || 1.0,
          results: await this.searchByBrandHistory(searchAspects.brands, {
            filters,
            topK
          })
        })
      }

      if (searchAspects.general && typeof searchAspects.general === 'string') {
        searches.push({
          type: 'general',
          weight: searchAspects.generalWeight || 1.0,
          results: await this.semanticSearch(searchAspects.general, {
            filters,
            topK
          })
        })
      }

      if (searches.length === 0) {
        throw new Error('No valid search aspects provided')
      }

      // Combine results with weighted scoring
      const combinedResults = this.combineSearchResults(
        searches,
        weightedCombination
      )

      return {
        results: combinedResults.slice(0, topK),
        search_aspects: searchAspects,
        total_aspects_searched: searches.length,
        search_type: 'multi_aspect'
      }
    } catch (error) {
      console.error('Error in multi-aspect search:', error)
      throw error
    }
  }

  // Combine multiple search results with weighted scoring
  combineSearchResults (searches, useWeights = true) {
    if (!Array.isArray(searches) || searches.length === 0) {
      return []
    }

    const creatorScores = new Map()

    searches.forEach((search) => {
      if (
        !search.results ||
        !search.results.results ||
        !Array.isArray(search.results.results)
      ) {
        console.warn(`Invalid search results for type: ${search.type}`)
        return
      }

      search.results.results.forEach((result) => {
        if (!result || !result.creator_id) {
          console.warn('Invalid result object, skipping')
          return
        }

        const creatorId = result.creator_id
        const score = useWeights
          ? (result.similarity_score || 0) * (search.weight || 1.0)
          : result.similarity_score || 0

        if (creatorScores.has(creatorId)) {
          // Combine scores (average for now, could use other methods)
          const existing = creatorScores.get(creatorId)
          existing.combined_score = (existing.combined_score + score) / 2
          existing.search_matches += 1
        } else {
          creatorScores.set(creatorId, {
            creator_id: creatorId,
            combined_score: score,
            search_matches: 1,
            metadata: result.metadata || {}
          })
        }
      })
    })

    // Sort by combined score and return
    return Array.from(creatorScores.values()).sort(
      (a, b) => b.combined_score - a.combined_score
    )
  }

  // Get search suggestions based on partial query
  async getSearchSuggestions (partialQuery, options = {}) {
    try {
      const { maxSuggestions = 5, filters = {} } = options

      // Use a more general search for suggestions
      const suggestions = await this.semanticSearch(partialQuery, {
        filters,
        topK: maxSuggestions * 2,
        minScore: 0.6
      })

      // Extract unique niches and content types for suggestions
      const suggestionSet = new Set()
      const formattedSuggestions = []

      suggestions.results.forEach((result) => {
        const metadata = result.metadata

        // Add niche-based suggestions
        if (metadata.niche && !suggestionSet.has(metadata.niche)) {
          suggestionSet.add(metadata.niche)
          formattedSuggestions.push({
            type: 'niche',
            suggestion: metadata.niche.replace('_', ' '),
            score: result.similarity_score
          })
        }

        // Add creator name suggestions for high-scoring matches
        if (
          result.similarity_score > 0.8 &&
          !suggestionSet.has(metadata.creator_name)
        ) {
          suggestionSet.add(metadata.creator_name)
          formattedSuggestions.push({
            type: 'creator',
            suggestion: metadata.creator_name,
            score: result.similarity_score
          })
        }
      })

      return formattedSuggestions.slice(0, maxSuggestions)
    } catch (error) {
      console.error('Error getting search suggestions:', error)
      throw error
    }
  }

  // Health check for vector search
  async healthCheck () {
    try {
      const stats = await embeddingService.getIndexStats()
      return {
        status: 'healthy',
        index_stats: stats,
        service: 'vector_search'
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        service: 'vector_search'
      }
    }
  }
}

module.exports = new VectorSearchService()
