const { Pool } = require("pg");
const __config = require("../../config");

class CreatorService {
  constructor() {
    this.pool = new Pool({
      user: __config.postgres.user,
      host: __config.postgres.host,
      database: __config.postgres.database,
      password: __config.postgres.password,
      port: __config.postgres.port,
      ssl: { rejectUnauthorized: false },
    });
  }

  async createCreator(creatorData) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // Insert main creator data
      const creatorQuery = `
        INSERT INTO creators (
          creator_name, username, bio, email, business_email, profile_image_url,
          verification_status, account_created_date, last_active_date, location_country,
          location_city, location_timezone, languages, niche, content_categories,
          tier, primary_platform, total_collaborations, avg_response_time_hours,
          response_rate_percentage, avg_delivery_time_days, client_satisfaction_score
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
        ) RETURNING id
      `;

      const creatorValues = [
        creatorData.creator_name,
        creatorData.username,
        creatorData.bio,
        creatorData.email,
        creatorData.business_email,
        creatorData.profile_image_url,
        creatorData.verification_status,
        creatorData.account_created_date,
        creatorData.last_active_date,
        creatorData.location_country,
        creatorData.location_city,
        creatorData.location_timezone,
        creatorData.languages,
        creatorData.niche,
        creatorData.content_categories,
        creatorData.tier,
        creatorData.primary_platform,
        creatorData.total_collaborations,
        creatorData.avg_response_time_hours,
        creatorData.response_rate_percentage,
        creatorData.avg_delivery_time_days,
        creatorData.client_satisfaction_score,
      ];

      const creatorResult = await client.query(creatorQuery, creatorValues);
      const creatorId = creatorResult.rows[0].id;

      // Insert platform metrics
      if (creatorData.platform_metrics) {
        for (const platform in creatorData.platform_metrics) {
          const metrics = creatorData.platform_metrics[platform];
          const metricsQuery = `
            INSERT INTO creator_platform_metrics (
              creator_id, platform, follower_count, following_count, post_count,
              avg_views, avg_likes, avg_comments, avg_shares, engagement_rate,
              followers_gained_30d, total_videos, story_views_avg
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          `;

          await client.query(metricsQuery, [
            creatorId,
            platform,
            metrics.follower_count,
            metrics.following_count,
            metrics.post_count,
            metrics.avg_views,
            metrics.avg_likes,
            metrics.avg_comments,
            metrics.avg_shares,
            metrics.engagement_rate,
            metrics.followers_gained_30d,
            metrics.total_videos,
            metrics.story_views_avg,
          ]);
        }
      }

      // Insert audience demographics
      if (creatorData.audience_demographics) {
        for (const platform in creatorData.audience_demographics) {
          const demo = creatorData.audience_demographics[platform];
          const demoQuery = `
            INSERT INTO creator_audience_demographics (
              creator_id, platform, age_13_17, age_18_24, age_25_34, age_35_44, age_45_plus,
              gender_male, gender_female, gender_other, top_countries, interests
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          `;

          await client.query(demoQuery, [
            creatorId,
            platform,
            demo.age_13_17,
            demo.age_18_24,
            demo.age_25_34,
            demo.age_35_44,
            demo.age_45_plus,
            demo.gender_male,
            demo.gender_female,
            demo.gender_other,
            demo.top_countries,
            demo.interests,
          ]);
        }
      }

      // Insert pricing data
      if (creatorData.pricing) {
        for (const platform in creatorData.pricing) {
          const pricing = creatorData.pricing[platform];
          const pricingQuery = `
            INSERT INTO creator_pricing (
              creator_id, platform, sponsored_post_rate, story_mention_rate,
              video_integration_rate, brand_ambassadorship_monthly_rate,
              event_coverage_rate, currency
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `;

          await client.query(pricingQuery, [
            creatorId,
            platform,
            pricing.sponsored_post,
            pricing.story_mention,
            pricing.video_integration,
            pricing.brand_ambassadorship_monthly,
            pricing.event_coverage,
            pricing.currency,
          ]);
        }
      }

      await client.query("COMMIT");
      return creatorId;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getAllCreators(filters = {}, pagination = {}) {
    const { page = 1, limit = 20 } = pagination;
    const offset = (page - 1) * limit;

    let whereClause = "WHERE 1=1";
    const values = [];
    let paramCount = 0;

    // Build dynamic where clause based on filters
    if (filters.niche) {
      paramCount++;
      whereClause += ` AND c.niche = $${paramCount}`;
      values.push(filters.niche);
    }

    if (filters.tier) {
      paramCount++;
      whereClause += ` AND c.tier = $${paramCount}`;
      values.push(filters.tier);
    }

    if (filters.platform) {
      paramCount++;
      whereClause += ` AND c.primary_platform = $${paramCount}`;
      values.push(filters.platform);
    }

    if (filters.min_followers) {
      paramCount++;
      whereClause += ` AND cpm.follower_count >= $${paramCount}`;
      values.push(filters.min_followers);
    }

    if (filters.max_followers) {
      paramCount++;
      whereClause += ` AND cpm.follower_count <= $${paramCount}`;
      values.push(filters.max_followers);
    }

    if (filters.min_engagement) {
      paramCount++;
      whereClause += ` AND cpm.engagement_rate >= $${paramCount}`;
      values.push(filters.min_engagement);
    }

    const query = `
      SELECT 
        c.*, 
        jsonb_object_agg(cpm.platform, 
          jsonb_build_object(
            'follower_count', cpm.follower_count,
            'engagement_rate', cpm.engagement_rate,
            'avg_views', cpm.avg_views,
            'avg_likes', cpm.avg_likes,
            'avg_comments', cpm.avg_comments
          )
        ) as platform_metrics
      FROM creators c
      LEFT JOIN creator_platform_metrics cpm ON c.id = cpm.creator_id
      ${whereClause}
      GROUP BY c.id
      ORDER BY c.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    values.push(limit, offset);

    const result = await this.pool.query(query, values);

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(DISTINCT c.id) as total
      FROM creators c
      LEFT JOIN creator_platform_metrics cpm ON c.id = cpm.creator_id
      ${whereClause}
    `;

    const countResult = await this.pool.query(countQuery, values.slice(0, -2));
    const total = parseInt(countResult.rows[0].total);

    return {
      creators: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getCreatorById(id) {
    const query = `
      SELECT 
        c.*,
        jsonb_object_agg(
          DISTINCT cpm.platform,
          jsonb_build_object(
            'follower_count', cpm.follower_count,
            'following_count', cpm.following_count,
            'post_count', cpm.post_count,
            'avg_views', cpm.avg_views,
            'avg_likes', cpm.avg_likes,
            'avg_comments', cpm.avg_comments,
            'avg_shares', cpm.avg_shares,
            'engagement_rate', cpm.engagement_rate,
            'followers_gained_30d', cpm.followers_gained_30d
          )
        ) FILTER (WHERE cpm.platform IS NOT NULL) as platform_metrics,
        jsonb_object_agg(
          DISTINCT cad.platform,
          jsonb_build_object(
            'age_groups', jsonb_build_object(
              '13-17', cad.age_13_17,
              '18-24', cad.age_18_24,
              '25-34', cad.age_25_34,
              '35-44', cad.age_35_44,
              '45+', cad.age_45_plus
            ),
            'gender', jsonb_build_object(
              'male', cad.gender_male,
              'female', cad.gender_female,
              'other', cad.gender_other
            ),
            'top_countries', cad.top_countries,
            'interests', cad.interests
          )
        ) FILTER (WHERE cad.platform IS NOT NULL) as audience_demographics,
        jsonb_object_agg(
          DISTINCT cp.platform,
          jsonb_build_object(
            'sponsored_post', cp.sponsored_post_rate,
            'story_mention', cp.story_mention_rate,
            'video_integration', cp.video_integration_rate,
            'brand_ambassadorship_monthly', cp.brand_ambassadorship_monthly_rate,
            'event_coverage', cp.event_coverage_rate,
            'currency', cp.currency
          )
        ) FILTER (WHERE cp.platform IS NOT NULL) as pricing
      FROM creators c
      LEFT JOIN creator_platform_metrics cpm ON c.id = cpm.creator_id
      LEFT JOIN creator_audience_demographics cad ON c.id = cad.creator_id
      LEFT JOIN creator_pricing cp ON c.id = cp.creator_id
      WHERE c.id = $1
      GROUP BY c.id
    `;

    const result = await this.pool.query(query, [id]);
    return result.rows[0] || null;
  }

  async searchCreators(searchTerm, filters = {}, pagination = {}) {
    const { page = 1, limit = 20 } = pagination;
    const offset = (page - 1) * limit;

    let whereClause = `
      WHERE (
        to_tsvector('english', c.creator_name) @@ plainto_tsquery('english', $1) OR
        to_tsvector('english', c.username) @@ plainto_tsquery('english', $1) OR
        to_tsvector('english', c.bio) @@ plainto_tsquery('english', $1) OR
        c.niche ILIKE $2
      )
    `;

    const values = [searchTerm, `%${searchTerm}%`];
    let paramCount = 2;

    // Add additional filters
    if (filters.niche) {
      paramCount++;
      whereClause += ` AND c.niche = $${paramCount}`;
      values.push(filters.niche);
    }

    if (filters.tier) {
      paramCount++;
      whereClause += ` AND c.tier = $${paramCount}`;
      values.push(filters.tier);
    }

    const query = `
      SELECT 
        c.*,
        ts_rank(to_tsvector('english', c.creator_name || ' ' || c.bio), plainto_tsquery('english', $1)) as search_rank,
        jsonb_object_agg(cpm.platform, 
          jsonb_build_object(
            'follower_count', cpm.follower_count,
            'engagement_rate', cpm.engagement_rate,
            'avg_views', cpm.avg_views
          )
        ) as platform_metrics
      FROM creators c
      LEFT JOIN creator_platform_metrics cpm ON c.id = cpm.creator_id
      ${whereClause}
      GROUP BY c.id
      ORDER BY search_rank DESC, c.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    values.push(limit, offset);

    const result = await this.pool.query(query, values);
    return result.rows;
  }

  async getCreatorsByNiche(niche, limit = 10) {
    const query = `
      SELECT c.*, cpm.follower_count, cpm.engagement_rate
      FROM creators c
      LEFT JOIN creator_platform_metrics cpm ON c.id = cpm.creator_id AND cpm.platform = c.primary_platform
      WHERE c.niche = $1
      ORDER BY cpm.follower_count DESC
      LIMIT $2
    `;

    const result = await this.pool.query(query, [niche, limit]);
    return result.rows;
  }

  async updateCreator(id, updateData) {
    const setClause = [];
    const values = [];
    let paramCount = 0;

    for (const [key, value] of Object.entries(updateData)) {
      paramCount++;
      setClause.push(`${key} = $${paramCount}`);
      values.push(value);
    }

    paramCount++;
    values.push(id);

    const query = `
      UPDATE creators 
      SET ${setClause.join(", ")}, updated_at = NOW()
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  async deleteCreator(id) {
    const query = "DELETE FROM creators WHERE id = $1 RETURNING id";
    const result = await this.pool.query(query, [id]);
    return result.rows[0];
  }
}

module.exports = new CreatorService();
