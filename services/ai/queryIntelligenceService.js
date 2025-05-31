// services/ai/queryIntelligenceService.js
const OpenAI = require("openai");

class QueryIntelligenceService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  // Analyze natural language query and extract structured search parameters
  async analyzeQuery(query) {
    try {
      const analysisPrompt = `
Analyze this influencer search query and extract structured search parameters. Return a JSON object with the extracted information.

Query: "${query}"

Extract these parameters if mentioned:
1. niche (tech_gaming, beauty_fashion, lifestyle_travel, food_cooking, fitness_health)
2. tier (micro, macro, mega) or follower count ranges
3. platform (youtube, instagram, tiktok, twitter)
4. location (country/city)
5. budget constraints (min/max amounts)
6. audience demographics (age groups, gender)
7. content style/type
8. engagement requirements
9. brand collaboration history
10. specific creator names or similar creators
11. search intent (find_creators, find_similar, audience_match, content_match, brand_match)

Return JSON in this format:
{
  "search_intent": "find_creators|find_similar|audience_match|content_match|brand_match",
  "filters": {
    "niche": "string or null",
    "tier": "string or null", 
    "platform": "string or null",
    "location_country": "string or null",
    "location_city": "string or null",
    "min_followers": number or null,
    "max_followers": number or null,
    "min_engagement_rate": number or null,
    "max_engagement_rate": number or null,
    "min_budget": number or null,
    "max_budget": number or null,
    "audience_age_primary": "string or null",
    "audience_gender_primary": "string or null",
    "verification_status": "string or null"
  },
  "search_aspects": {
    "content": "string description or null",
    "audience": "string description or null", 
    "brands": "string description or null",
    "general": "string description or null"
  },
  "similar_to_creator": "string or null",
  "semantic_query": "enhanced search query string",
  "confidence_score": 0.0-1.0
}

For budget ranges:
- "under $500" = max_budget: 500
- "$500-$2000" = min_budget: 500, max_budget: 2000  
- "over $5000" = min_budget: 5000

For follower counts:
- micro = 1K-100K
- macro = 100K-1M  
- mega = 1M+
- "under 50K" = max_followers: 50000
- "over 1 million" = min_followers: 1000000

Examples:
- "Gaming YouTubers with high engagement" → niche: tech_gaming, platform: youtube, search_intent: find_creators
- "Beauty creators similar to James Charles" → niche: beauty_fashion, similar_to_creator: "James Charles", search_intent: find_similar
- "Tech reviewers under $1000 with young male audience" → niche: tech_gaming, max_budget: 1000, audience_age_primary: "18-24", audience_gender_primary: "male"
`;

      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: analysisPrompt }],
        max_tokens: 1000,
        temperature: 0.1, // Low temperature for consistent extraction
      });

      let analysisResult = response.choices[0].message.content.trim();

      // Clean up JSON response
      analysisResult = analysisResult
        .replace(/```json\s*/, "")
        .replace(/```$/, "");

      const parsedResult = JSON.parse(analysisResult);

      // Validate and enhance the result
      return this.validateAndEnhanceAnalysis(parsedResult, query);
    } catch (error) {
      console.error("Error analyzing query:", error);

      // Fallback to basic analysis
      return this.fallbackQueryAnalysis(query);
    }
  }

  // Validate and enhance the AI analysis result
  validateAndEnhanceAnalysis(analysis, originalQuery) {
    // Ensure required fields exist
    const validated = {
      search_intent: analysis.search_intent || "find_creators",
      filters: analysis.filters || {},
      search_aspects: analysis.search_aspects || {},
      similar_to_creator: analysis.similar_to_creator || null,
      semantic_query: analysis.semantic_query || originalQuery,
      confidence_score: analysis.confidence_score || 0.8,
      original_query: originalQuery,
    };

    // Validate niche values - but don't auto-apply them unless confidence is high
    const validNiches = [
      "tech_gaming",
      "beauty_fashion",
      "lifestyle_travel",
      "food_cooking",
      "fitness_health",
    ];
    if (
      validated.filters.niche &&
      !validNiches.includes(validated.filters.niche)
    ) {
      validated.filters.niche = null;
    }

    // Only apply automatic niche filtering if confidence is very high
    if (validated.confidence_score < 0.9 && validated.filters.niche) {
      console.log(
        "Removing auto-detected niche filter due to low confidence:",
        validated.confidence_score
      );
      validated.filters.niche = null;
    }

    // Validate tier values
    const validTiers = ["micro", "macro", "mega"];
    if (
      validated.filters.tier &&
      !validTiers.includes(validated.filters.tier)
    ) {
      validated.filters.tier = null;
    }

    // Validate platform values
    const validPlatforms = ["youtube", "instagram", "tiktok", "twitter"];
    if (
      validated.filters.platform &&
      !validPlatforms.includes(validated.filters.platform)
    ) {
      validated.filters.platform = null;
    }

    // Convert tier to follower ranges if specified
    if (
      validated.filters.tier &&
      !validated.filters.min_followers &&
      !validated.filters.max_followers
    ) {
      const tierRanges = {
        micro: { min_followers: 1000, max_followers: 99999 },
        macro: { min_followers: 100000, max_followers: 999999 },
        mega: { min_followers: 1000000 },
      };

      if (tierRanges[validated.filters.tier]) {
        Object.assign(validated.filters, tierRanges[validated.filters.tier]);
      }
    }

    return validated;
  }

  // Fallback analysis for when AI parsing fails
  fallbackQueryAnalysis(query) {
    const lowerQuery = query.toLowerCase();
    const analysis = {
      search_intent: "find_creators",
      filters: {},
      search_aspects: {
        general: query,
      },
      similar_to_creator: null,
      semantic_query: query,
      confidence_score: 0.5,
      original_query: query,
    };

    // Basic keyword detection
    const nicheMappings = {
      gaming: "tech_gaming",
      tech: "tech_gaming",
      technology: "tech_gaming",
      beauty: "beauty_fashion",
      makeup: "beauty_fashion",
      fashion: "beauty_fashion",
      travel: "lifestyle_travel",
      lifestyle: "lifestyle_travel",
      food: "food_cooking",
      cooking: "food_cooking",
      recipe: "food_cooking",
      fitness: "fitness_health",
      health: "fitness_health",
      workout: "fitness_health",
    };

    for (const [keyword, niche] of Object.entries(nicheMappings)) {
      if (lowerQuery.includes(keyword)) {
        analysis.filters.niche = niche;
        break;
      }
    }

    // Platform detection
    const platforms = ["youtube", "instagram", "tiktok", "twitter"];
    for (const platform of platforms) {
      if (lowerQuery.includes(platform)) {
        analysis.filters.platform = platform;
        break;
      }
    }

    // Simple budget detection
    const budgetMatches = lowerQuery.match(/\$(\d+(?:,\d{3})*(?:\.\d{2})?)/g);
    if (budgetMatches) {
      const amounts = budgetMatches.map((match) =>
        parseFloat(match.replace("$", "").replace(",", ""))
      );

      if (lowerQuery.includes("under") || lowerQuery.includes("below")) {
        analysis.filters.max_budget = Math.min(...amounts);
      } else if (lowerQuery.includes("over") || lowerQuery.includes("above")) {
        analysis.filters.min_budget = Math.max(...amounts);
      }
    }

    // Follower count detection
    if (lowerQuery.includes("micro")) analysis.filters.tier = "micro";
    if (lowerQuery.includes("macro")) analysis.filters.tier = "macro";
    if (lowerQuery.includes("mega")) analysis.filters.tier = "mega";

    // Similar creator detection
    if (lowerQuery.includes("similar to") || lowerQuery.includes("like ")) {
      analysis.search_intent = "find_similar";
    }

    return analysis;
  }

  // Generate search suggestions based on query
  async generateSearchSuggestions(partialQuery) {
    try {
      const suggestionPrompt = `
Generate 5 relevant search suggestions for this partial influencer search query: "${partialQuery}"

Make suggestions that:
1. Complete the user's thought
2. Add relevant filters or criteria
3. Suggest popular search patterns
4. Include different search approaches

Format as JSON array of strings:
["suggestion 1", "suggestion 2", "suggestion 3", "suggestion 4", "suggestion 5"]

Examples for "gaming":
["gaming YouTubers with high engagement", "gaming creators under $1000", "gaming influencers similar to PewDiePie", "micro gaming creators", "gaming content creators in US"]
`;

      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: suggestionPrompt }],
        max_tokens: 300,
        temperature: 0.7,
      });

      let suggestions = response.choices[0].message.content.trim();
      suggestions = suggestions.replace(/```json\s*/, "").replace(/```$/, "");

      return JSON.parse(suggestions);
    } catch (error) {
      console.error("Error generating suggestions:", error);

      // Fallback suggestions
      return [
        `${partialQuery} creators with high engagement`,
        `${partialQuery} influencers under $500`,
        `micro ${partialQuery} creators`,
        `${partialQuery} content creators`,
        `verified ${partialQuery} influencers`,
      ];
    }
  }

  // Enhance query for better semantic search
  async enhanceQueryForSearch(originalQuery, context = {}) {
    try {
      // For now, return original query to avoid over-enhancement issues
      // Once basic search is working, we can re-enable enhancement
      console.log(
        `Using original query without enhancement: "${originalQuery}"`
      );
      return originalQuery;

      /* Disabled temporarily - causing too specific queries
      const enhancementPrompt = `
Enhance this influencer search query for better semantic search results.
Add relevant context and synonyms while maintaining the original intent.

Original query: "${originalQuery}"
Context: ${JSON.stringify(context)}

Create an enhanced query that:
1. Includes relevant synonyms and related terms
2. Adds context about influencer marketing
3. Maintains the original search intent
4. Expands abbreviations and informal terms
5. Adds relevant industry terms

Return only the enhanced query string (no JSON, no explanation).

Examples:
"gaming YouTubers" → "gaming content creators on YouTube platform, video game influencers, gaming streamers, esports content"
"beauty under $500" → "beauty and makeup content creators, cosmetics influencers, skincare and beauty tutorial creators with sponsored post rates under $500"
`;

      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: enhancementPrompt }],
        max_tokens: 200,
        temperature: 0.6,
      });

      return response.choices[0].message.content.trim().replace(/"/g, '');
      */
    } catch (error) {
      console.error("Error enhancing query:", error);
      return originalQuery;
    }
  }

  // Detect search intent from query
  detectSearchIntent(query) {
    const lowerQuery = query.toLowerCase();

    if (lowerQuery.includes("similar to") || lowerQuery.includes("like ")) {
      return "find_similar";
    }

    if (lowerQuery.includes("audience") || lowerQuery.includes("demographic")) {
      return "audience_match";
    }

    if (
      lowerQuery.includes("content") ||
      lowerQuery.includes("style") ||
      lowerQuery.includes("type")
    ) {
      return "content_match";
    }

    if (
      lowerQuery.includes("brand") ||
      lowerQuery.includes("sponsor") ||
      lowerQuery.includes("collaboration")
    ) {
      return "brand_match";
    }

    return "find_creators";
  }

  // Extract specific entities from query
  extractEntities(query) {
    const entities = {
      creators: [],
      brands: [],
      locations: [],
      amounts: [],
    };

    // Extract potential creator names (proper nouns)
    const creatorMatches = query.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g);
    if (creatorMatches) {
      entities.creators = creatorMatches.filter(
        (match) =>
          !["YouTube", "Instagram", "TikTok", "Twitter"].includes(match)
      );
    }

    // Extract monetary amounts
    const amountMatches = query.match(/\$(\d+(?:,\d{3})*(?:\.\d{2})?)/g);
    if (amountMatches) {
      entities.amounts = amountMatches.map((match) =>
        parseFloat(match.replace("$", "").replace(",", ""))
      );
    }

    // Extract potential locations (capitalized words that might be places)
    const locationPatterns = [
      /\bin\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g,
      /\bfrom\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g,
    ];

    locationPatterns.forEach((pattern) => {
      const matches = query.matchAll(pattern);
      for (const match of matches) {
        entities.locations.push(match[1]);
      }
    });

    return entities;
  }

  // Validate query for search
  validateQuery(query) {
    const validation = {
      isValid: true,
      errors: [],
      warnings: [],
      suggestions: [],
    };

    // Check minimum length
    if (query.trim().length < 2) {
      validation.isValid = false;
      validation.errors.push(
        "Query too short. Please provide at least 2 characters."
      );
    }

    // Check maximum length
    if (query.length > 500) {
      validation.isValid = false;
      validation.errors.push("Query too long. Please limit to 500 characters.");
    }

    // Check for potentially problematic queries
    const problematicPatterns = [
      /^\d+$/, // Only numbers
      /^[^a-zA-Z]*$/, // No letters
    ];

    problematicPatterns.forEach((pattern) => {
      if (pattern.test(query.trim())) {
        validation.warnings.push(
          "Query might be too generic. Consider adding more descriptive terms."
        );
      }
    });

    // Suggest improvements
    if (query.split(" ").length === 1) {
      validation.suggestions.push(
        "Try adding more details like platform, budget, or audience type."
      );
    }

    return validation;
  }
}

module.exports = new QueryIntelligenceService();
