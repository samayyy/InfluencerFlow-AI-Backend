// services/products/productService.js
const { Pool } = require('pg')
const __config = require('../../config')
const webScrapingService = require('../ai/webScrapingService')
const OpenAI = require('openai')

class ProductService {
  constructor () {
    this.pool = new Pool({
      user: __config.postgres.user,
      host: __config.postgres.host,
      database: __config.postgres.database,
      password: __config.postgres.password,
      port: __config.postgres.port,
      ssl: { rejectUnauthorized: false }
    })

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    })
  }

  // Generate unique product slug
  async generateProductSlug (productName, brandId) {
    let baseSlug = productName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')

    if (!baseSlug) {
      baseSlug = `product-${Date.now()}`
    }

    let slug = baseSlug
    let counter = 1

    while (true) {
      const existingProduct = await this.pool.query(
        'SELECT id FROM products WHERE brand_id = $1 AND product_slug = $2',
        [brandId, slug]
      )

      if (existingProduct.rows.length === 0) {
        return slug
      }

      slug = `${baseSlug}-${counter}`
      counter++
    }
  }

  // Generate AI-powered product overview
  async generateProductOverview (productData, scrapedData = null) {
    try {
      const prompt = `
Analyze this product information and create a comprehensive product overview for influencer marketing campaigns.

Product Information:
- Name: ${productData.product_name}
- URL: ${productData.product_url || 'Not provided'}
- Category: ${productData.category || 'Not specified'}
- Price: ${productData.price ? `$${productData.price}` : 'Not specified'}
- Description: ${productData.description || 'Not provided'}
- Key Features: ${productData.key_features?.join(', ') || 'Not provided'}

${
  scrapedData
    ? `
Website Data:
- Page Title: ${scrapedData.title}
- Meta Description: ${scrapedData.description}
- Content: ${scrapedData.contentText?.substring(0, 1000)}
- Headings: ${scrapedData.headings?.map((h) => h.text).join(', ')}
`
    : ''
}

Create a detailed product overview optimized for influencer marketing that includes:

1. Product Summary (2-3 sentences)
2. Key Features & Benefits
3. Target Audience Analysis
4. Ideal Content Creation Opportunities
5. Marketing Angles & Hooks
6. Competitor Analysis Insights
7. Influencer Collaboration Guidelines

Format as JSON:
{
  "product_summary": "Brief but compelling product description",
  "category_refined": "More specific product category",
  "key_features": ["feature1", "feature2", "feature3"],
  "unique_selling_points": ["usp1", "usp2"],
  "target_audience": {
    "primary_demographics": "Main target customer description",
    "age_groups": ["18-24", "25-34"],
    "interests": ["interest1", "interest2"],
    "pain_points": ["problem1", "problem2"],
    "lifestyle": "Target lifestyle description"
  },
  "content_opportunities": {
    "video_content": ["unboxing", "tutorial", "review"],
    "photo_content": ["lifestyle", "product_shots", "before_after"],
    "written_content": ["reviews", "comparisons", "guides"]
  },
  "marketing_angles": ["angle1", "angle2", "angle3"],
  "seasonal_relevance": "How product fits into seasons/trends",
  "ideal_creator_types": ["beauty_influencer", "tech_reviewer"],
  "content_guidelines": {
    "must_include": ["product_name", "key_benefit"],
    "tone": "authentic/professional/fun",
    "messaging_focus": "Primary message to emphasize"
  },
  "competitive_landscape": "Brief competitor analysis",
  "collaboration_types": ["sponsored_post", "review", "giveaway"],
  "estimated_appeal_score": 8.5,
  "confidence_score": 0.9
}

Focus on actionable insights for influencer marketing campaigns.
`

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 2000,
        temperature: 0.3
      })

      let aiOverview = response.choices[0].message.content.trim()
      aiOverview = aiOverview.replace(/```json\s*/, '').replace(/```$/, '')

      const parsedOverview = JSON.parse(aiOverview)

      return parsedOverview
    } catch (error) {
      console.error('Error generating product overview:', error)
      throw new Error(`Failed to generate product overview: ${error.message}`)
    }
  }

  // Create new product
  async createProduct (brandId, userId, productData) {
    const client = await this.pool.connect()

    try {
      await client.query('BEGIN')

      // Verify brand ownership
      const brandCheck = await client.query(
        'SELECT user_id FROM brands WHERE id = $1 AND is_active = true',
        [brandId]
      )

      if (brandCheck.rows.length === 0) {
        throw new Error('Brand not found')
      }

      if (brandCheck.rows[0].user_id !== userId) {
        throw new Error('Not authorized to add products to this brand')
      }

      // Generate unique slug
      const productSlug = await this.generateProductSlug(
        productData.product_name,
        brandId
      )

      let aiGeneratedOverview = null
      let scrapedData = null

      // Scrape product URL if provided
      if (productData.product_url) {
        try {
          console.log(`Scraping product URL: ${productData.product_url}`)
          scrapedData = await webScrapingService.scrapeWebsite(
            productData.product_url
          )

          // Generate AI overview
          console.log(
            `Generating AI overview for product: ${productData.product_name}`
          )
          aiGeneratedOverview = await this.generateProductOverview(
            productData,
            scrapedData
          )
        } catch (error) {
          console.error('Product URL scraping/analysis failed:', error)
          // Try to generate overview without scraped data
          try {
            aiGeneratedOverview = await this.generateProductOverview(
              productData
            )
          } catch (aiError) {
            console.error('AI overview generation failed:', aiError)
          }
        }
      } else {
        // Generate AI overview from provided data only
        try {
          aiGeneratedOverview = await this.generateProductOverview(productData)
        } catch (error) {
          console.error('AI overview generation failed:', error)
        }
      }

      // Insert product record
      const productQuery = `
        INSERT INTO products (
          brand_id, product_name, product_slug, product_url, category, 
          subcategory, price, currency, description, ai_generated_overview,
          custom_overview, product_images, key_features, target_audience, launch_date
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
        ) RETURNING *
      `

      const productValues = [
        brandId,
        productData.product_name,
        productSlug,
        productData.product_url || null,
        productData.category || null,
        productData.subcategory || null,
        productData.price || null,
        productData.currency || 'USD',
        productData.description || null,
        aiGeneratedOverview ? JSON.stringify(aiGeneratedOverview) : null,
        productData.custom_overview || null,
        productData.product_images || null,
        productData.key_features || null,
        productData.target_audience
          ? JSON.stringify(productData.target_audience)
          : null,
        productData.launch_date || null
      ]

      const productResult = await client.query(productQuery, productValues)
      const product = productResult.rows[0]

      await client.query('COMMIT')

      return {
        ...product,
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

  // Get product by ID
  async getProductById (productId, userId = null, userRole = null) {
    try {
      const query = `
        SELECT p.*, b.brand_name, b.user_id as brand_owner_id, b.verification_status as brand_verification
        FROM products p
        JOIN brands b ON p.brand_id = b.id
        WHERE p.id = $1 AND p.is_active = true AND b.is_active = true
      `

      const result = await this.pool.query(query, [productId])

      if (result.rows.length === 0) {
        return null
      }

      const product = result.rows[0]

      // Parse JSON fields
      if (product.ai_generated_overview) {
        product.ai_generated_overview = JSON.parse(
          product.ai_generated_overview
        )
      }
      if (product.target_audience) {
        product.target_audience = JSON.parse(product.target_audience)
      }

      // Check permissions for sensitive data
      const isOwner = userId && product.brand_owner_id === userId
      const isAdmin = userRole === 'admin'

      if (!isOwner && !isAdmin) {
        // Return limited public information
        return {
          id: product.id,
          product_name: product.product_name,
          product_slug: product.product_slug,
          category: product.category,
          description: product.description,
          product_images: product.product_images,
          brand_name: product.brand_name,
          brand_verification: product.brand_verification,
          created_at: product.created_at
        }
      }

      return product
    } catch (error) {
      console.error('Error getting product by ID:', error)
      throw error
    }
  }

  // Get products by brand ID
  async getProductsByBrandId (brandId, pagination = {}) {
    try {
      const { page = 1, limit = 20 } = pagination
      const offset = (page - 1) * limit

      // Get total count
      const countResult = await this.pool.query(
        'SELECT COUNT(*) as total FROM products WHERE brand_id = $1 AND is_active = true',
        [brandId]
      )
      const total = parseInt(countResult.rows[0].total)

      // Get products
      const query = `
        SELECT p.*, b.brand_name
        FROM products p
        JOIN brands b ON p.brand_id = b.id
        WHERE p.brand_id = $1 AND p.is_active = true
        ORDER BY p.created_at DESC
        LIMIT $2 OFFSET $3
      `

      const result = await this.pool.query(query, [brandId, limit, offset])

      return {
        products: result.rows.map((product) => {
          if (product.ai_generated_overview) {
            product.ai_generated_overview = JSON.parse(
              product.ai_generated_overview
            )
          }
          if (product.target_audience) {
            product.target_audience = JSON.parse(product.target_audience)
          }
          return product
        }),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    } catch (error) {
      console.error('Error getting products by brand ID:', error)
      throw error
    }
  }

  // Get user's products
  async getUserProducts (userId, pagination = {}) {
    try {
      const { page = 1, limit = 20 } = pagination
      const offset = (page - 1) * limit

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total 
        FROM products p
        JOIN brands b ON p.brand_id = b.id
        WHERE b.user_id = $1 AND p.is_active = true AND b.is_active = true
      `
      const countResult = await this.pool.query(countQuery, [userId])
      const total = parseInt(countResult.rows[0].total)

      // Get products
      const query = `
        SELECT p.*, b.brand_name, b.id as brand_id
        FROM products p
        JOIN brands b ON p.brand_id = b.id
        WHERE b.user_id = $1 AND p.is_active = true AND b.is_active = true
        ORDER BY p.created_at DESC
        LIMIT $2 OFFSET $3
      `

      const result = await this.pool.query(query, [userId, limit, offset])

      return {
        products: result.rows.map((product) => {
          if (product.ai_generated_overview) {
            product.ai_generated_overview = JSON.parse(
              product.ai_generated_overview
            )
          }
          if (product.target_audience) {
            product.target_audience = JSON.parse(product.target_audience)
          }
          return product
        }),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    } catch (error) {
      console.error('Error getting user products:', error)
      throw error
    }
  }

  // Update product
  async updateProduct (productId, userId, updateData) {
    const client = await this.pool.connect()

    try {
      await client.query('BEGIN')

      // Verify ownership
      const ownershipCheck = await client.query(
        `
        SELECT p.brand_id, b.user_id 
        FROM products p
        JOIN brands b ON p.brand_id = b.id
        WHERE p.id = $1 AND p.is_active = true AND b.is_active = true
      `,
        [productId]
      )

      if (ownershipCheck.rows.length === 0) {
        throw new Error('Product not found')
      }

      if (ownershipCheck.rows[0].user_id !== userId) {
        throw new Error('Not authorized to update this product')
      }

      // Build dynamic update query
      const updateFields = []
      const updateValues = []
      let paramCount = 0

      // Handle simple fields
      const simpleFields = [
        'product_name',
        'product_url',
        'category',
        'subcategory',
        'price',
        'currency',
        'description',
        'custom_overview',
        'launch_date'
      ]

      simpleFields.forEach((field) => {
        if (updateData[field] !== undefined) {
          paramCount++
          updateFields.push(`${field} = $${paramCount}`)
          updateValues.push(updateData[field])
        }
      })

      // Handle array fields
      const arrayFields = ['product_images', 'key_features']
      arrayFields.forEach((field) => {
        if (updateData[field] !== undefined) {
          paramCount++
          updateFields.push(`${field} = $${paramCount}`)
          updateValues.push(updateData[field])
        }
      })

      // Handle JSON fields
      if (updateData.target_audience !== undefined) {
        paramCount++
        updateFields.push(`target_audience = $${paramCount}`)
        updateValues.push(JSON.stringify(updateData.target_audience))
      }

      if (updateFields.length === 0) {
        throw new Error('No fields to update')
      }

      // Update product slug if name changed
      if (updateData.product_name) {
        const brandId = ownershipCheck.rows[0].brand_id
        const newSlug = await this.generateProductSlug(
          updateData.product_name,
          brandId
        )
        paramCount++
        updateFields.push(`product_slug = $${paramCount}`)
        updateValues.push(newSlug)
      }

      // Add updated_at
      paramCount++
      updateFields.push(`updated_at = $${paramCount}`)
      updateValues.push(new Date())

      // Add product ID for WHERE clause
      paramCount++
      updateValues.push(productId)

      const updateQuery = `
        UPDATE products 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramCount}
        RETURNING *
      `

      const result = await client.query(updateQuery, updateValues)

      await client.query('COMMIT')

      return await this.getProductById(productId, userId)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  // Regenerate AI overview for product
  async regenerateProductOverview (productId, userId) {
    try {
      const product = await this.getProductById(productId, userId, 'brand')

      if (!product) {
        throw new Error('Product not found')
      }

      if (product.brand_owner_id !== userId) {
        throw new Error('Not authorized to update this product')
      }

      console.log(
        `Regenerating AI overview for product: ${product.product_name}`
      )

      let scrapedData = null

      // Scrape product URL if available
      if (product.product_url) {
        try {
          scrapedData = await webScrapingService.scrapeWebsite(
            product.product_url
          )
        } catch (error) {
          console.error('Product URL scraping failed:', error)
        }
      }

      // Generate new AI overview
      const aiOverview = await this.generateProductOverview(
        product,
        scrapedData
      )

      // Update product with new AI overview
      const updateQuery = `
        UPDATE products 
        SET ai_generated_overview = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `

      const result = await this.pool.query(updateQuery, [
        JSON.stringify(aiOverview),
        productId
      ])

      return {
        product: result.rows[0],
        ai_overview: aiOverview,
        scraped_data: scrapedData
      }
    } catch (error) {
      console.error('Error regenerating product overview:', error)
      throw error
    }
  }

  // Delete product (soft delete)
  async deleteProduct (productId, userId) {
    try {
      const updateQuery = `
        UPDATE products 
        SET is_active = false, updated_at = CURRENT_TIMESTAMP
        FROM brands
        WHERE products.id = $1 AND products.brand_id = brands.id 
          AND brands.user_id = $2 AND brands.is_active = true
        RETURNING products.id
      `

      const result = await this.pool.query(updateQuery, [productId, userId])

      if (result.rows.length === 0) {
        throw new Error('Product not found or not authorized')
      }

      return { deleted: true, product_id: productId }
    } catch (error) {
      console.error('Error deleting product:', error)
      throw error
    }
  }

  // Search products across all brands
  async searchProducts (searchTerm, filters = {}, pagination = {}) {
    try {
      const { page = 1, limit = 20 } = pagination
      const offset = (page - 1) * limit

      const whereConditions = ['p.is_active = true', 'b.is_active = true']
      const queryParams = [searchTerm, `%${searchTerm}%`]
      let paramCount = 2

      // Add search condition
      whereConditions.push(`(
        to_tsvector('english', p.product_name) @@ plainto_tsquery('english', $1) OR
        to_tsvector('english', p.description) @@ plainto_tsquery('english', $1) OR
        p.category ILIKE $2 OR
        p.product_name ILIKE $2
      )`)

      // Add filters
      if (filters.category) {
        paramCount++
        whereConditions.push(`p.category = $${paramCount}`)
        queryParams.push(filters.category)
      }

      if (filters.min_price) {
        paramCount++
        whereConditions.push(`p.price >= $${paramCount}`)
        queryParams.push(filters.min_price)
      }

      if (filters.max_price) {
        paramCount++
        whereConditions.push(`p.price <= $${paramCount}`)
        queryParams.push(filters.max_price)
      }

      if (filters.brand_id) {
        paramCount++
        whereConditions.push(`p.brand_id = $${paramCount}`)
        queryParams.push(filters.brand_id)
      }

      const whereClause = whereConditions.join(' AND ')

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total
        FROM products p
        JOIN brands b ON p.brand_id = b.id
        WHERE ${whereClause}
      `

      const countResult = await this.pool.query(countQuery, queryParams)
      const total = parseInt(countResult.rows[0].total)

      // Get products
      paramCount++
      queryParams.push(limit)
      paramCount++
      queryParams.push(offset)

      const query = `
        SELECT p.*, b.brand_name, b.verification_status as brand_verification,
               ts_rank(to_tsvector('english', p.product_name || ' ' || COALESCE(p.description, '')), 
                       plainto_tsquery('english', $1)) as search_rank
        FROM products p
        JOIN brands b ON p.brand_id = b.id
        WHERE ${whereClause}
        ORDER BY search_rank DESC, p.created_at DESC
        LIMIT $${paramCount - 1} OFFSET $${paramCount}
      `

      const result = await this.pool.query(query, queryParams)

      return {
        products: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    } catch (error) {
      console.error('Error searching products:', error)
      throw error
    }
  }

  // Get product statistics
  async getProductStats (userId = null) {
    try {
      let query, params

      if (userId) {
        // User-specific stats
        query = `
          SELECT 
            COUNT(*) as total_products,
            COUNT(*) FILTER (WHERE p.created_at > CURRENT_DATE - INTERVAL '30 days') as new_this_month,
            COUNT(DISTINCT p.category) as unique_categories,
            AVG(p.price) FILTER (WHERE p.price IS NOT NULL) as avg_price,
            COUNT(*) FILTER (WHERE p.ai_generated_overview IS NOT NULL) as ai_analyzed_products
          FROM products p
          JOIN brands b ON p.brand_id = b.id
          WHERE b.user_id = $1 AND p.is_active = true AND b.is_active = true
        `
        params = [userId]
      } else {
        // Global stats (admin)
        query = `
          SELECT 
            COUNT(*) as total_products,
            COUNT(*) FILTER (WHERE p.created_at > CURRENT_DATE - INTERVAL '30 days') as new_this_month,
            COUNT(DISTINCT p.category) as unique_categories,
            AVG(p.price) FILTER (WHERE p.price IS NOT NULL) as avg_price,
            COUNT(*) FILTER (WHERE p.ai_generated_overview IS NOT NULL) as ai_analyzed_products,
            COUNT(DISTINCT p.brand_id) as brands_with_products
          FROM products p
          JOIN brands b ON p.brand_id = b.id
          WHERE p.is_active = true AND b.is_active = true
        `
        params = []
      }

      const result = await this.pool.query(query, params)
      const stats = result.rows[0]

      // Convert numeric strings to numbers
      Object.keys(stats).forEach((key) => {
        if (stats[key] && !isNaN(stats[key])) {
          stats[key] = parseFloat(stats[key])
        }
      })

      return stats
    } catch (error) {
      console.error('Error getting product stats:', error)
      throw error
    }
  }
}

module.exports = new ProductService()
