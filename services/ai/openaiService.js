const OpenAI = require('openai')
const __config = require('../../config')

class OpenAIService {
  constructor () {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    })

    // Rate limiting
    this.requestQueue = []
    this.isProcessing = false
    this.maxRequestsPerMinute = 50 // Adjust based on your API limits
    this.requestCount = 0
    this.lastResetTime = Date.now()
  }

  async waitForRateLimit () {
    const now = Date.now()
    if (now - this.lastResetTime >= 60000) {
      this.requestCount = 0
      this.lastResetTime = now
    }

    if (this.requestCount >= this.maxRequestsPerMinute) {
      const waitTime = 60000 - (now - this.lastResetTime)
      console.log(`Rate limit reached, waiting ${waitTime}ms...`)
      await new Promise((resolve) => setTimeout(resolve, waitTime))
      this.requestCount = 0
      this.lastResetTime = Date.now()
    }

    this.requestCount++
  }

  async generateCreatorBio (creatorProfile) {
    await this.waitForRateLimit()

    const prompt = `Create a realistic, engaging bio for a ${
      creatorProfile.tier
    } ${creatorProfile.niche.replace('_', ' ')} creator named ${
      creatorProfile.creator_name
    }.

Creator Details:
- Platform: ${creatorProfile.primary_platform}
- Tier: ${creatorProfile.tier} (${
      creatorProfile.tier === 'micro'
        ? '1K-100K'
        : creatorProfile.tier === 'macro'
        ? '100K-1M'
        : '1M++'
    } followers)
- Niche: ${creatorProfile.niche.replace('_', ' ')}
- Location: ${creatorProfile.location_city}, ${creatorProfile.location_country}

Requirements:
- 1-2 sentences maximum
- Professional but personable tone
- Include specific expertise or background
- Mention collaboration openness
- Add relevant emoji (1-2 max)
- Make it feel authentic, not templated
- Include a hook that shows value proposition

Examples of good bios:
- "Former Tesla engineer breaking down EV tech for everyone. 500K+ helped choose their first electric car ⚡"
- "NYC makeup artist with 10+ years backstage experience. I teach techniques that actually work in real lighting 💄"
- "Marathon runner & certified nutritionist. Sharing workouts that fit your busy schedule, not perfect gym conditions 🏃‍♀️"

Generate a unique bio:`

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 150,
        temperature: 0.8
      })

      return response.choices[0].message.content.trim().replace(/"/g, '')
    } catch (error) {
      console.error('Error generating bio:', error)
      return `${creatorProfile.niche
        .replace('_', ' ')
        .replace(/\b\w/g, (l) =>
          l.toUpperCase()
        )} creator sharing authentic content from ${
        creatorProfile.location_city
      } 📸`
    }
  }

  async generateContentExamples (creatorProfile) {
    await this.waitForRateLimit()

    const prompt = `Generate 5 realistic ${
      creatorProfile.primary_platform
    } content titles/posts for ${
      creatorProfile.creator_name
    }, a ${creatorProfile.niche.replace('_', ' ')} creator.

Creator Context:
- Platform: ${creatorProfile.primary_platform}
- Niche: ${creatorProfile.niche.replace('_', ' ')}
- Tier: ${creatorProfile.tier}
- Style: Professional but approachable

Requirements:
- Platform-appropriate format (YouTube titles, Instagram captions, TikTok hooks, Twitter posts)
- Current/trending topics in ${creatorProfile.niche.replace('_', ' ')}
- Mix of educational, entertaining, and promotional content
- Realistic engagement hooks
- Include relevant hashtags for social platforms
- Make them feel like real posts, not AI-generated

Return as JSON array of strings only.`

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
        temperature: 0.9
      })

      let content = response.choices[0].message.content.trim()
      // remove ```json or ```javascript if present
      content = content.replace(/```(json|javascript)?\s*/g, '')
      // remove ``` at the end if present
      content = content.replace(/```$/, '')
      return JSON.parse(content)
    } catch (error) {
      console.error('Error generating content examples:', error)
      return [
        `${creatorProfile.niche.replace('_', ' ')} tips that actually work`,
        'My honest review after 30 days',
        'Behind the scenes of my latest project',
        'Q&A: Your most asked questions',
        `Beginner's guide to ${creatorProfile.niche.replace('_', ' ')}`
      ]
    }
  }

  async generateBrandCollaborations (creatorProfile) {
    await this.waitForRateLimit()

    const prompt = `Generate 3-7 realistic brand collaborations for ${
      creatorProfile.creator_name
    }, a ${creatorProfile.tier} ${creatorProfile.niche.replace(
      '_',
      ' '
    )} creator.

Creator Details:
- Tier: ${creatorProfile.tier}
- Niche: ${creatorProfile.niche.replace('_', ' ')}
- Platform: ${creatorProfile.primary_platform}

Requirements:
- Use real, existing brands that would actually collaborate in this niche
- Match tier appropriately (micro = smaller/local brands, mega = major brands)
- Include collaboration type (sponsored post, brand ambassador, product review, etc.)
- Realistic timeline (recent collaborations)
- Vary collaboration types and brand sizes

Return as JSON array of objects with: brand_name, collaboration_type, date (YYYY-MM-DD), success_rating (3.5-5.0)`

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 400,
        temperature: 0.7
      })

      let content = response.choices[0].message.content.trim()
      content = content.replace(/```(json|javascript)?\s*/g, '')
      // remove ``` at the end if present
      content = content.replace(/```$/, '')
      return JSON.parse(content)
    } catch (error) {
      console.error('Error generating brand collaborations:', error)
      return [
        {
          brand_name: 'Generic Brand',
          collaboration_type: 'sponsored_post',
          date: '2024-01-15',
          success_rating: 4.2
        }
      ]
    }
  }

  async generateAudienceInsights (creatorProfile) {
    await this.waitForRateLimit()

    const prompt = `Generate realistic audience insights for ${
      creatorProfile.creator_name
    }, a ${creatorProfile.niche.replace('_', ' ')} creator.

Creator Context:
- Niche: ${creatorProfile.niche.replace('_', ' ')}
- Location: ${creatorProfile.location_city}, ${creatorProfile.location_country}
- Tier: ${creatorProfile.tier}

Generate realistic:
1. Top 5 countries (considering creator's niche and location)
2. 5-8 specific interests (beyond the main niche)
3. 3-5 related topics they engage with
4. Peak activity hours (2-4 hour ranges)

Return as JSON object with: top_countries, specific_interests, related_topics, peak_hours`

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 300,
        temperature: 0.7
      })

      let content = response.choices[0].message.content.trim()
      content = content.replace(/```(json|javascript)?\s*/g, '')
      // remove ``` at the end if present
      content = content.replace(/```$/, '')
      return JSON.parse(content)
    } catch (error) {
      console.error('Error generating audience insights:', error)
      return {
        top_countries: [
          'United States',
          'United Kingdom',
          'Canada',
          'Australia',
          'Germany'
        ],
        specific_interests: ['technology', 'lifestyle', 'entertainment'],
        related_topics: ['innovation', 'reviews', 'tutorials'],
        peak_hours: ['18:00-20:00', '20:00-22:00']
      }
    }
  }

  async generateCreatorPersonality (creatorProfile) {
    await this.waitForRateLimit()

    const prompt = `Create a personality profile for ${
      creatorProfile.creator_name
    }, a ${creatorProfile.niche.replace('_', ' ')} creator.

Based on their niche and tier, generate:
1. Content style (educational, entertaining, inspirational, etc.)
2. Communication tone (casual, professional, humorous, authoritative, etc.)
3. Posting frequency preference
4. Collaboration style
5. Audience interaction style

Return as JSON object with these exact keys: content_style, communication_tone, posting_frequency, collaboration_style, interaction_style`

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
        temperature: 0.8
      })

      let content = response.choices[0].message.content.trim()
      content = content.replace(/```(json|javascript)?\s*/g, '')
      // remove ``` at the end if present
      content = content.replace(/```$/, '')
      return JSON.parse(content)
    } catch (error) {
      console.error('Error generating personality:', error)
      return {
        content_style: 'educational',
        communication_tone: 'professional',
        posting_frequency: '3-4 times per week',
        collaboration_style: 'selective',
        interaction_style: 'responsive'
      }
    }
  }

  async generateBatchCreatorProfiles (creators) {
    console.log(
      `Starting AI-enhanced profile generation for ${creators.length} creators...`
    )

    const enhancedCreators = []

    for (let i = 0; i < creators.length; i++) {
      const creator = creators[i]

      try {
        console.log(
          `Enhancing creator ${i + 1}/${creators.length}: ${
            creator.creator_name
          }`
        )

        // Generate AI content in parallel for efficiency
        const [
          bio,
          contentExamples,
          brandCollabs,
          audienceInsights,
          personality
        ] = await Promise.all([
          this.generateCreatorBio(creator),
          this.generateContentExamples(creator),
          this.generateBrandCollaborations(creator),
          this.generateAudienceInsights(creator),
          this.generateCreatorPersonality(creator)
        ])

        // ✅ FIXED: Properly set ai_enhanced flag
        const enhancedCreator = {
          ...creator,
          bio: bio,
          content_examples: contentExamples,
          brand_collaborations: brandCollabs,
          audience_insights: audienceInsights,
          personality_profile: personality,
          ai_enhanced: true // ✅ Ensure this is always set to true
        }

        enhancedCreators.push(enhancedCreator)

        // Progress update every 10 creators
        if (i % 10 === 0) {
          console.log(`✅ Enhanced ${i + 1}/${creators.length} creators...`)
        }
      } catch (error) {
        console.error(
          `Error enhancing creator ${creator.creator_name}:`,
          error
        )

        // ✅ FIXED: Add creator with ai_enhanced: false for failures
        const fallbackCreator = {
          ...creator,
          ai_enhanced: false, // Mark as failed AI enhancement
          ai_error: error.message
        }

        enhancedCreators.push(fallbackCreator)
      }

      // Add delay to respect rate limits
      if (i < creators.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1200)) // 1.2 second delay
      }
    }

    const successfulEnhancements = enhancedCreators.filter(
      (c) => c.ai_enhanced
    ).length
    console.log(
      `✅ Completed AI enhancement for ${enhancedCreators.length} creators (${successfulEnhancements} successful AI enhancements)`
    )
    return enhancedCreators
  }
}

module.exports = new OpenAIService()
