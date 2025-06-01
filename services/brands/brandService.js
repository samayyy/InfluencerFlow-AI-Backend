// services/brands/brandService.js
const { Pool } = require('pg')
const __config = require('../../config')
const webScrapingService = require('../ai/webScrapingService')

class BrandService {
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

  // Generate unique brand slug
  async generateBrandSlug (brandName, userId) {
    let baseSlug = brandName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')

    if (!baseSlug) {
      baseSlug = `brand-${userId}`
    }

    let slug = baseSlug
    let counter = 1

    while (true) {
      const existingBrand = await this.pool.query(
        'SELECT id FROM brands WHERE brand_slug = $1',
        [slug]
      )

      if (existingBrand.rows.length === 0) {
        return slug
      }

      slug = `${baseSlug}-${counter}`
      counter++
    }
  }

  // Create new brand profile
  async createBrand (userId, brandData) {
    const client = await this.pool.connect()

    try {
      await client.query('BEGIN')

      // Check if user already has a brand
      const existingBrand = await client.query(
        'SELECT id FROM brands WHERE user_id = $1 AND is_active = true',
        [userId]
      )

      if (existingBrand.rows.length > 0) {
        throw new Error('User already has an active brand profile')
      }

      // Generate unique slug
      const brandSlug = await this.generateBrandSlug(
        brandData.brand_name,
        userId
      )

      let aiGeneratedOverview = null
      let scrapedData = null

      // Scrape website if provided
      if (brandData.website_url) {
        try {
          console.log(`Scraping website for brand: ${brandData.brand_name}`)
          scrapedData = await webScrapingService.scrapeWebsite(
            brandData.website_url
          )

          // Generate AI overview
          console.log(
            `Generating AI overview for brand: ${brandData.brand_name}`
          )
          const aiOverview = await webScrapingService.generateBrandOverview(
            scrapedData,
            brandData.brand_name
          )

          aiGeneratedOverview = aiOverview
        } catch (error) {
          console.error('Website scraping/analysis failed:', error)
          // Continue without AI analysis if scraping fails
        }
      }

      // Insert brand record
      const brandQuery = `
        INSERT INTO brands (
          user_id, brand_name, brand_slug, website_url, industry, 
          company_size, description, ai_generated_overview, custom_overview,
          logo_url, brand_colors, social_media_links, contact_info,
          brand_guidelines, target_audience, brand_values, monthly_budget, currency
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
        ) RETURNING *
      `

      const brandValues = [
        userId,
        brandData.brand_name,
        brandSlug,
        brandData.website_url || null,
        brandData.industry || null,
        brandData.company_size || null,
        brandData.description || null,
        aiGeneratedOverview ? JSON.stringify(aiGeneratedOverview) : null,
        brandData.custom_overview || null,
        brandData.logo_url || null,
        brandData.brand_colors ? JSON.stringify(brandData.brand_colors) : null,
        brandData.social_media_links
          ? JSON.stringify(brandData.social_media_links)
          : null,
        brandData.contact_info ? JSON.stringify(brandData.contact_info) : null,
        brandData.brand_guidelines || null,
        brandData.target_audience
          ? JSON.stringify(brandData.target_audience)
          : null,
        brandData.brand_values || null,
        brandData.monthly_budget || null,
        brandData.currency || 'USD'
      ]

      const brandResult = await client.query(brandQuery, brandValues)
      const brand = brandResult.rows[0]

      // Create default brand preferences
      await this.createDefaultBrandPreferences(
        client,
        brand.id,
        aiGeneratedOverview
      )

      await client.query('COMMIT')

      return {
        ...brand,
        scraped_data: scrapedData,
        ai_analysis_available: !!aiGeneratedOverview
      }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  // Create default brand preferences based on AI analysis
  async createDefaultBrandPreferences (client, brandId, aiOverview) {
    try {
      const preferences = {
        preferred_niches: [],
        min_followers: 1000,
        max_followers: 10000000,
        min_engagement_rate: 2.0,
        preferred_platforms: ['instagram', 'youtube', 'tiktok'],
        preferred_locations: ['United States'],
        preferred_age_groups: ['18-24', '25-34'],
        preferred_gender: ['any'],
        content_style_preferences: ['authentic', 'professional'],
        collaboration_history_weight: 0.5
      }

      // Customize based on AI analysis
      if (aiOverview && aiOverview.collaboration_fit) {
        const collabFit = aiOverview.collaboration_fit

        if (collabFit.content_types) {
          preferences.content_style_preferences = collabFit.content_types.slice(
            0,
            5
          )
        }

        // Map industry to likely niches
        if (aiOverview.industry) {
          const industryNicheMap = {
            technology: ['tech_gaming'],
            beauty: ['beauty_fashion'],
            fashion: ['beauty_fashion', 'lifestyle_travel'],
            fitness: ['fitness_health'],
            food: ['food_cooking'],
            travel: ['lifestyle_travel'],
            health: ['fitness_health']
          }

          const industry = aiOverview.industry.toLowerCase()
          for (const [key, niches] of Object.entries(industryNicheMap)) {
            if (industry.includes(key)) {
              preferences.preferred_niches = niches
              break
            }
          }
        }
      }

      const preferencesQuery = `
        INSERT INTO brand_preferences (
          brand_id, preferred_niches, min_followers, max_followers,
          min_engagement_rate, preferred_platforms, preferred_locations,
          preferred_age_groups, preferred_gender, content_style_preferences,
          collaboration_history_weight
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `

      await client.query(preferencesQuery, [
        brandId,
        preferences.preferred_niches,
        preferences.min_followers,
        preferences.max_followers,
        preferences.min_engagement_rate,
        preferences.preferred_platforms,
        preferences.preferred_locations,
        preferences.preferred_age_groups,
        preferences.preferred_gender,
        preferences.content_style_preferences,
        preferences.collaboration_history_weight
      ])
    } catch (error) {
      console.error('Error creating default brand preferences:', error)
      // Don't throw error, as this is not critical
    }
  }

  // Get brand by ID with all related data
  async getBrandById (brandId, includePreferences = false) {
    try {
      const query = `
        SELECT b.*, u.email as owner_email, u.first_name, u.last_name
        FROM brands b
        JOIN users u ON b.user_id = u.id
        WHERE b.id = $1 AND b.is_active = true
      `

      const result = await this.pool.query(query, [brandId])

      if (result.rows.length === 0) {
        return null
      }

      const brand = result.rows[0]

      // Parse JSON fields
      if (brand.ai_generated_overview) {
        brand.ai_generated_overview = JSON.parse(brand.ai_generated_overview)
      }
      if (brand.brand_colors) {
        brand.brand_colors = JSON.parse(brand.brand_colors)
      }
      if (brand.social_media_links) {
        brand.social_media_links = JSON.parse(brand.social_media_links)
      }
      if (brand.contact_info) {
        brand.contact_info = JSON.parse(brand.contact_info)
      }
      if (brand.target_audience) {
        brand.target_audience = JSON.parse(brand.target_audience)
      }

      // Get brand preferences if requested
      if (includePreferences) {
        const preferencesResult = await this.pool.query(
          'SELECT * FROM brand_preferences WHERE brand_id = $1',
          [brandId]
        )
        brand.preferences = preferencesResult.rows[0] || null
      }

      return brand
    } catch (error) {
      console.error('Error getting brand by ID:', error)
      throw error
    }
  }

  // Get brand by user ID
  async getBrandByUserId (userId) {
    try {
      const query = `
        SELECT * FROM brands 
        WHERE user_id = $1 AND is_active = true
        ORDER BY created_at DESC
        LIMIT 1
      `

      const result = await this.pool.query(query, [userId])

      if (result.rows.length === 0) {
        return null
      }

      return await this.getBrandById(result.rows[0].id, true)
    } catch (error) {
      console.error('Error getting brand by user ID:', error)
      throw error
    }
  }

  // Update brand profile
  async updateBrand (brandId, userId, updateData) {
    const client = await this.pool.connect()

    try {
      await client.query('BEGIN')

      // Verify ownership
      const ownershipCheck = await client.query(
        'SELECT user_id FROM brands WHERE id = $1 AND is_active = true',
        [brandId]
      )

      if (ownershipCheck.rows.length === 0) {
        throw new Error('Brand not found')
      }

      if (ownershipCheck.rows[0].user_id !== userId) {
        throw new Error('Not authorized to update this brand')
      }

      // Build dynamic update query
      const updateFields = []
      const updateValues = []
      let paramCount = 0

      // Handle simple string/number fields
      const simpleFields = [
        'brand_name',
        'website_url',
        'industry',
        'company_size',
        'description',
        'custom_overview',
        'logo_url',
        'brand_guidelines',
        'monthly_budget',
        'currency'
      ]

      simpleFields.forEach((field) => {
        if (updateData[field] !== undefined) {
          paramCount++
          updateFields.push(`${field} = $${paramCount}`)
          updateValues.push(updateData[field])
        }
      })

      // Handle JSON fields
      const jsonFields = [
        'brand_colors',
        'social_media_links',
        'contact_info',
        'target_audience'
      ]

      jsonFields.forEach((field) => {
        if (updateData[field] !== undefined) {
          paramCount++
          updateFields.push(`${field} = $${paramCount}`)
          updateValues.push(JSON.stringify(updateData[field]))
        }
      })

      // Handle brand_values array
      if (updateData.brand_values !== undefined) {
        paramCount++
        updateFields.push(`brand_values = $${paramCount}`)
        updateValues.push(updateData.brand_values)
      }

      if (updateFields.length === 0) {
        throw new Error('No fields to update')
      }

      // Update brand slug if name changed
      if (updateData.brand_name) {
        const newSlug = await this.generateBrandSlug(
          updateData.brand_name,
          userId
        )
        paramCount++
        updateFields.push(`brand_slug = $${paramCount}`)
        updateValues.push(newSlug)
      }

      // Add updated_at
      paramCount++
      updateFields.push(`updated_at = $${paramCount}`)
      updateValues.push(new Date())

      // Add brand ID for WHERE clause
      paramCount++
      updateValues.push(brandId)

      const updateQuery = `
        UPDATE brands 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramCount}
        RETURNING *
      `

      const result = await client.query(updateQuery, updateValues)

      await client.query('COMMIT')

      return await this.getBrandById(brandId, true)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  // Regenerate AI overview for existing brand
  async regenerateAIOverview (brandId, userId) {
    try {
      const brand = await this.getBrandById(brandId)

      if (!brand) {
        throw new Error('Brand not found')
      }

      if (brand.user_id !== userId) {
        throw new Error('Not authorized to update this brand')
      }

      if (!brand.website_url) {
        throw new Error('Website URL is required for AI analysis')
      }

      console.log(`Regenerating AI overview for brand: ${brand.brand_name}`)

      // Scrape website (may use cache)
      const scrapedData = await webScrapingService.scrapeWebsite(
        brand.website_url
      )

      // Generate new AI overview
      const aiOverview = await webScrapingService.generateBrandOverview(
        scrapedData,
        brand.brand_name
      )

      // Update brand with new AI overview
      const updateQuery = `
        UPDATE brands 
        SET ai_generated_overview = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `

      const result = await this.pool.query(updateQuery, [
        JSON.stringify(aiOverview),
        brandId
      ])

      return {
        brand: result.rows[0],
        ai_overview: aiOverview,
        scraped_data: scrapedData
      }
    } catch (error) {
      console.error('Error regenerating AI overview:', error)
      throw error
    }
  }

  // Get all brands (admin only)
  async getAllBrands (filters = {}, pagination = {}) {
    try {
      const { page = 1, limit = 20 } = pagination
      const offset = (page - 1) * limit

      const whereConditions = ['b.is_active = true']
      const queryParams = []
      let paramCount = 0

      // Apply filters
      if (filters.industry) {
        paramCount++
        whereConditions.push(`b.industry = $${paramCount}`)
        queryParams.push(filters.industry)
      }

      if (filters.verification_status) {
        paramCount++
        whereConditions.push(`b.verification_status = $${paramCount}`)
        queryParams.push(filters.verification_status)
      }

      if (filters.company_size) {
        paramCount++
        whereConditions.push(`b.company_size = $${paramCount}`)
        queryParams.push(filters.company_size)
      }

      if (filters.search) {
        paramCount++
        whereConditions.push(
          `(b.brand_name ILIKE $${paramCount} OR b.description ILIKE $${paramCount})`
        )
        queryParams.push(`%${filters.search}%`)
      }

      const whereClause = whereConditions.join(' AND ')

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total
        FROM brands b
        WHERE ${whereClause}
      `

      const countResult = await this.pool.query(countQuery, queryParams)
      const total = parseInt(countResult.rows[0].total)

      // Get brands with pagination
      paramCount++
      queryParams.push(limit)
      paramCount++
      queryParams.push(offset)

      const query = `
        SELECT b.*, u.email as owner_email, u.first_name, u.last_name,
               u.created_at as user_created_at
        FROM brands b
        JOIN users u ON b.user_id = u.id
        WHERE ${whereClause}
        ORDER BY b.created_at DESC
        LIMIT $${paramCount - 1} OFFSET $${paramCount}
      `

      const result = await this.pool.query(query, queryParams)

      return {
        brands: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    } catch (error) {
      console.error('Error getting all brands:', error)
      throw error
    }
  }

  // Update brand verification status (admin only)
  async updateVerificationStatus (brandId, status, adminUserId) {
    try {
      // Verify admin permissions
      const adminCheck = await this.pool.query(
        'SELECT role FROM users WHERE id = $1',
        [adminUserId]
      )

      if (!adminCheck.rows[0] || adminCheck.rows[0].role !== 'admin') {
        throw new Error('Admin access required')
      }

      const validStatuses = ['unverified', 'pending', 'verified', 'rejected']
      if (!validStatuses.includes(status)) {
        throw new Error('Invalid verification status')
      }

      const updateQuery = `
        UPDATE brands 
        SET verification_status = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `

      const result = await this.pool.query(updateQuery, [status, brandId])

      if (result.rows.length === 0) {
        throw new Error('Brand not found')
      }

      return result.rows[0]
    } catch (error) {
      console.error('Error updating verification status:', error)
      throw error
    }
  }

  // Delete brand (soft delete)
  async deleteBrand (brandId, userId) {
    try {
      const updateQuery = `
        UPDATE brands 
        SET is_active = false, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND user_id = $2
        RETURNING id
      `

      const result = await this.pool.query(updateQuery, [brandId, userId])

      if (result.rows.length === 0) {
        throw new Error('Brand not found or not authorized')
      }

      return { deleted: true, brand_id: brandId }
    } catch (error) {
      console.error('Error deleting brand:', error)
      throw error
    }
  }

  // Get brand statistics
  async getBrandStats () {
    try {
      const query = `
        SELECT 
          COUNT(*) as total_brands,
          COUNT(*) FILTER (WHERE verification_status = 'verified') as verified_brands,
          COUNT(*) FILTER (WHERE verification_status = 'pending') as pending_brands,
          COUNT(*) FILTER (WHERE created_at > CURRENT_DATE - INTERVAL '30 days') as new_this_month,
          COUNT(DISTINCT industry) as unique_industries
        FROM brands 
        WHERE is_active = true
      `

      const result = await this.pool.query(query)
      return result.rows[0]
    } catch (error) {
      console.error('Error getting brand stats:', error)
      throw error
    }
  }
}

module.exports = new BrandService()
