const OpenAI = require('openai');
require('dotenv').config();
const pool = require('../../lib/db/postgres'); // Assuming this is your pg.Pool instance

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

class AIPromptSearch {
    /**
     * Generate embedding for given text using OpenAI
     */
    async getEmbedding(text) {
        try {
            const response = await openai.embeddings.create({
                model: "text-embedding-3-large", // This model has 3072 dimensions
                input: text,
            });
            return response.data[0].embedding;
        } catch (error) {
            console.error('Error generating embedding:', error);
            throw error;
        }
    }

    /**
     * Create a comprehensive text representation of creator profile utilizing all available fields.
     */
    createCreatorProfileText(creatorData) {
        const profileParts = [];
        const labels = {
            // From creators table (c.*)
            creator_name: "Creator Name",
            username: "Username",
            bio: "Bio",
            email: "Email", // PII, consider implications for embeddings
            business_email: "Business Email", // PII
            profile_image_url: "Profile Image URL",
            verification_status: "Verification Status",
            account_created_date: "Account Created On",
            last_active_date: "Last Active On",
            location_country: "Country",
            location_city: "City",
            location_timezone: "Timezone",
            languages: "Languages",
            niche: "Niche",
            content_categories: "Content Categories",
            tier: "Creator Tier",
            primary_platform: "Primary Platform",
            total_collaborations: "Total Collaborations",
            avg_response_time_hours: "Average Response Time (Hours)",
            response_rate_percentage: "Response Rate (%)",
            avg_delivery_time_days: "Average Delivery Time (Days)",
            client_satisfaction_score: "Client Satisfaction Score",
            content_examples: "Content Examples", // JSONB
            personality_profile: "Personality Profile", // JSONB
            ai_enhanced: "AI Enhanced", // Boolean

            // Aggregated fields
            audience_interests: "Audience Interests",
            past_brands: "Past Brand Collaborations"
        };

        // Fields to explicitly skip (e.g., internal IDs, raw embeddings, etc.)
        const fieldsToSkip = ['id', 'created_at', 'updated_at', 'profile_embedding'];
        const MAX_JSON_STRING_LENGTH = 250; // Max length for stringified JSON values

        for (const key in creatorData) {
            if (creatorData.hasOwnProperty(key) && !fieldsToSkip.includes(key)) {
                const value = creatorData[key];
                const label = labels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

                if (value === null || value === undefined || String(value).trim() === '') {
                    continue; // Skip null, undefined, or empty string values
                }

                let partValue = '';

                if (Array.isArray(value)) {
                    if (value.length > 0) {
                        let flatValue;
                        if (key === 'audience_interests') { // Expects array of arrays (text[][])
                            flatValue = value.flat().filter(item => item !== null && String(item).trim() !== '');
                        } else { // Expects array of primitives (e.g., text[], int[])
                            flatValue = value.filter(item => item !== null && String(item).trim() !== '');
                        }
                        
                        if (flatValue.length > 0) {
                            partValue = flatValue.join(', ');
                        }
                    }
                } else if (typeof value === 'object') { // Handles JSONB fields
                    const stringifiedObject = JSON.stringify(value);
                    if (stringifiedObject !== '{}' && stringifiedObject !== '[]') {
                        if (stringifiedObject.length > MAX_JSON_STRING_LENGTH) {
                            partValue = `${stringifiedObject.substring(0, MAX_JSON_STRING_LENGTH)}... (truncated)`;
                        } else {
                            partValue = stringifiedObject;
                        }
                    }
                } else if (typeof value === 'boolean') {
                    partValue = value ? 'Yes' : 'No';
                } else if (key === 'account_created_date' || key === 'last_active_date') {
                    try {
                        partValue = new Date(value).toISOString().split('T')[0]; // Format as YYYY-MM-DD
                    } catch (e) {
                        partValue = String(value); // Fallback to raw value if date conversion fails
                    }
                } else {
                    partValue = String(value).trim();
                }

                if (partValue !== '' && partValue !== '{}' && partValue !== '[]') {
                    profileParts.push(`${label}: ${partValue}`);
                }
            }
        }
        return profileParts.join(' | ');
    }

    /**
     * Generate and store embedding for a specific creator
     */
    async generateCreatorEmbedding(creatorId) {
        try {
            // Fetch comprehensive creator data
            const query = `
                SELECT 
                    c.*,
                    ARRAY_AGG(DISTINCT cad.interests) FILTER (WHERE cad.interests IS NOT NULL) as audience_interests,
                    ARRAY_AGG(DISTINCT cc.brand_name) FILTER (WHERE cc.brand_name IS NOT NULL) as past_brands
                FROM creators c
                LEFT JOIN creator_audience_demographics cad ON c.id = cad.creator_id
                LEFT JOIN creator_collaborations cc ON c.id = cc.creator_id
                WHERE c.id = $1
                GROUP BY c.id
            `;
            
            const result = await pool.query(query, [creatorId]);
            
            if (result.rows.length === 0) {
                throw new Error(`Creator with id ${creatorId} not found`);
            }

            const creatorData = result.rows[0];
            
            // Create profile text and generate embedding
            const profileText = this.createCreatorProfileText(creatorData);
            if (!profileText || profileText.trim() === '') {
                console.warn(`Skipping embedding generation for creator ${creatorId} due to empty profile text.`);
                // Optionally, store NULL or a zero vector, or handle as an error
                // For now, we just skip updating the embedding
                return null; 
            }
            const embedding = await this.getEmbedding(profileText);
            
            // Store embedding in database
            const updateQuery = `
                UPDATE creators 
                SET profile_embedding = $1::vector 
                WHERE id = $2
            `;
            
            await pool.query(updateQuery, [JSON.stringify(embedding), creatorId]);
            
            console.log(`Generated embedding for creator ${creatorId}`);
            return embedding;
            
        } catch (error) {
            console.error(`Error generating embedding for creator ${creatorId}:`, error);
            throw error;
        }
        // No pool.release() here if pool.query is used directly
    }

    /**
     * Check if profile_embedding column exists and create it if not
     */
    async ensureEmbeddingColumnExists() {
        try {
            // Check if profile_embedding column exists
            const columnCheck = await pool.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'creators' 
                AND column_name = 'profile_embedding'
            `);
            
            // text-embedding-3-large model has 3072 dimensions
            const vectorDimension = 3072; 

            if (columnCheck.rows.length === 0) {
                console.log('profile_embedding column not found. Creating it...');
                
                // Add the profile_embedding column
                await pool.query(`
                    ALTER TABLE creators 
                    ADD COLUMN profile_embedding vector(${vectorDimension})
                `);
                
                console.log(`profile_embedding column (vector(${vectorDimension})) created successfully`);
                
                // Check if index exists and create it if not (only if column was just created)
                console.log('Creating vector index for profile_embedding...');
                await pool.query(`
                    CREATE INDEX IF NOT EXISTS creators_profile_embedding_idx 
                    ON creators USING ivfflat (profile_embedding vector_cosine_ops) 
                    WITH (lists = 100)
                `);
                console.log('Vector index creation process completed (created if it did not exist).');
                
            } else {
                console.log('profile_embedding column already exists.');
                // Still check for index and create if missing
                const indexCheck = await pool.query(`
                    SELECT indexname 
                    FROM pg_indexes 
                    WHERE tablename = 'creators' 
                    AND indexname = 'creators_profile_embedding_idx'
                `);
                
                if (indexCheck.rows.length === 0) {
                    console.log('Creating missing vector index for profile_embedding...');
                    await pool.query(`
                        CREATE INDEX creators_profile_embedding_idx 
                        ON creators USING ivfflat (profile_embedding vector_cosine_ops) 
                        WITH (lists = 100)
                    `);
                    console.log('Vector index created successfully');
                } else {
                    console.log('Vector index already exists.');
                }
            }
            
        } catch (error) {
            console.error('Error ensuring embedding column exists:', error);
            throw error;
        }
        // No pool.release() here
    }

    /**
     * Setup embeddings: ensure column exists and generate embeddings for all creators
     */
    async setupAndGenerateAllEmbeddings() {
        try {
            console.log('Starting embedding setup process...');
            
            // Step 1: Ensure the profile_embedding column and index exist
            await this.ensureEmbeddingColumnExists();
            
            // Step 2: Generate embeddings for all creators
            console.log('Starting embedding generation for all creators...');
            await this.generateAllCreatorEmbeddings();
            
            console.log('Embedding setup process completed successfully!');
            
        } catch (error) {
            console.error('Error in embedding setup process:', error);
            throw error;
        }
    }

    /**
     * Generate embeddings for all creators that don't have them or where profile_embedding is NULL
     */
    async generateAllCreatorEmbeddings() {
        try {
            const result = await pool.query(
                "SELECT id FROM creators WHERE profile_embedding IS NULL"
            );
            
            const creatorIds = result.rows.map(row => row.id);
            console.log(`Found ${creatorIds.length} creators without embeddings or with NULL embeddings.`);
            
            if (creatorIds.length === 0) {
                console.log('All creators already have embeddings or no creators need embedding generation!');
                return;
            }
            
            let processed = 0;
            let successfullyGenerated = 0;
            const total = creatorIds.length;
            
            for (const creatorId of creatorIds) {
                try {
                    const embedding = await this.generateCreatorEmbedding(creatorId);
                    if (embedding) { // Check if embedding was actually generated (not skipped)
                       successfullyGenerated++;
                    }
                    processed++;
                    
                    // Progress logging
                    if (processed % 10 === 0 || processed === total) {
                        console.log(`Progress: ${processed}/${total} creators processed (${Math.round(processed/total * 100)}%). Successfully generated: ${successfullyGenerated}.`);
                    }
                    
                    // Add small delay to avoid rate limiting (especially for the OpenAI API)
                    await new Promise(resolve => setTimeout(resolve, 200)); 
                    
                } catch (error) {
                    // Error is already logged in generateCreatorEmbedding
                    console.error(`Skipping to next creator due to failure with ${creatorId}.`);
                    processed++; // Ensure this counter increments even on failure to reflect it was attempted
                     if (processed % 10 === 0 || processed === total) {
                        console.log(`Progress: ${processed}/${total} creators processed (${Math.round(processed/total * 100)}%). Successfully generated: ${successfullyGenerated}.`);
                    }
                }
            }
            
            console.log(`Embedding generation completed! Attempted for ${processed}/${total} creators. Successfully generated embeddings for ${successfullyGenerated} creators.`);
            
        } catch (error) {
             console.error('Error in generateAllCreatorEmbeddings:', error);
             // Do not re-throw here if generateCreatorEmbedding handles its errors and we want to continue
        }
        // No pool.release() here
    }

    /**
     * Search for creators based on query with optional filters
     */
    async searchCreators(query, options = {}) {
        const {
            limit = 10,
            minEngagementRate = null,
            maxPriceRange = null,
            platform = null,
            minFollowers = null,
            tier = null
        } = options;

        try {
            // Generate embedding for the search query
            const queryEmbedding = await this.getEmbedding(query);
            
            // Build the search query with filters
            const conditions = ["c.profile_embedding IS NOT NULL"];
            const params = [JSON.stringify(queryEmbedding)];
            let paramIndex = 2; // $1 is queryEmbedding
            
            // Join with creator_platform_metrics and creator_pricing only if needed for filters or selected data
            // For simplicity, we join them as they are part of the SELECT statement.
            // Ensure conditions correctly handle cases where a creator might not have metrics or pricing.
            
            if (minEngagementRate !== null) {
                conditions.push(`cpm.engagement_rate >= $${paramIndex++}`);
                params.push(minEngagementRate);
            }
            
            if (platform) {
                conditions.push(`cpm.platform = $${paramIndex++}`); // Ensure cpm is joined
                params.push(platform);
            }
            
            if (maxPriceRange !== null) {
                conditions.push(`cp.sponsored_post_rate <= $${paramIndex++}`); // Ensure cp is joined
                params.push(maxPriceRange);
            }
            
            if (minFollowers !== null) {
                conditions.push(`cpm.follower_count >= $${paramIndex++}`); // Ensure cpm is joined
                params.push(minFollowers);
            }
            
            if (tier) {
                conditions.push(`c.tier = $${paramIndex++}`);
                params.push(tier);
            }
            
            params.push(limit); // For LIMIT clause, $${paramIndex}
            
            const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

            // Note: If 'platform' is not specified in options, this query might return multiple rows per creator
            // if they exist on multiple platforms. The original logic seems to expect 'platform' to be often set,
            // especially in getCreatorRecommendations.
            const searchQuery = `
                SELECT 
                    c.id,
                    c.creator_name,
                    c.username,
                    c.bio,
                    c.niche,
                    c.content_categories,
                    c.tier,
                    c.location_country,
                    c.location_city,
                    c.client_satisfaction_score,
                    c.total_collaborations,
                    c.avg_response_time_hours,
                    cpm.platform,
                    cpm.follower_count,
                    cpm.engagement_rate,
                    cpm.avg_views,
                    cpm.avg_likes,
                    cp.sponsored_post_rate,
                    cp.story_mention_rate,
                    cp.video_integration_rate,
                    cp.currency,
                    1 - (c.profile_embedding <=> $1::vector) as similarity_score
                FROM creators c
                LEFT JOIN creator_platform_metrics cpm ON c.id = cpm.creator_id
                LEFT JOIN creator_pricing cp ON c.id = cp.creator_id AND (cpm.platform IS NULL OR cp.platform = cpm.platform)
                ${whereClause}
                ORDER BY c.profile_embedding <=> $1::vector
                LIMIT $${paramIndex} 
            `;
            // The join condition `(cpm.platform IS NULL OR cp.platform = cpm.platform)` is a bit safer
            // if cpm might not match due to filters but cp is still needed or vice-versa.
            // If platform filter is always applied on cpm.platform, then `cp.platform = cpm.platform` is fine.
            
            const result = await pool.query(searchQuery, params);
            return result.rows;
            
        } catch (error) {
            console.error('Error searching creators:', error);
            throw error;
        }
        // No pool.release() here
    }

    /**
     * Get creator recommendations for a specific brand with advanced scoring
     */
    async getCreatorRecommendations(brandDescription, options = {}) {
        const {
            budget = null,
            targetAudience = null,
            platform = "instagram", // Default platform
            contentType = null,
            // region = null // region filter not implemented in searchCreators yet
        } = options;

        // Enhance query with additional context
        let enhancedQuery = `Brand: ${brandDescription}`;
        if (targetAudience) {
            enhancedQuery += ` | Target audience: ${targetAudience}`;
        }
        if (contentType) {
            enhancedQuery += ` | Content type: ${contentType}`;
        }

        // Set search options
        const searchOptions = {
            limit: 20, // Fetch more initial candidates for scoring
            minEngagementRate: 1.5, // Minimum 1.5% engagement rate
            platform: platform // Crucial to ensure metrics and pricing are for the correct platform
        };

        if (budget) {
            searchOptions.maxPriceRange = budget;
        }
        // if (region && creatorData has region) { searchOptions.region = region; } // If region filter is added

        const creators = await this.searchCreators(enhancedQuery, searchOptions);

        // Add comprehensive scoring
        const scoredCreators = creators.map(creator => {
            let score = 0;
            let scoreBreakdown = {};

            // Similarity score (35% weight)
            const similarityWeight = 35;
            const similarityScoreValue = creator.similarity_score || 0; // from 0 to 1
            const similarityScore = similarityScoreValue * similarityWeight;
            score += similarityScore;
            scoreBreakdown.similarity = parseFloat(similarityScore.toFixed(2));

            // Engagement rate (25% weight)
            const engagementWeight = 25;
            const engagement = creator.engagement_rate || 0;
            let engagementScore = 0;
            if (engagement > 8) engagementScore = engagementWeight; // Excellent
            else if (engagement > 5) engagementScore = engagementWeight * 0.8; // Very Good
            else if (engagement > 3) engagementScore = engagementWeight * 0.6; // Good
            else if (engagement >= 1.5) engagementScore = engagementWeight * 0.4; // Fair (meets min criteria)
            // else 0 for below 1.5
            score += engagementScore;
            scoreBreakdown.engagement = parseFloat(engagementScore.toFixed(2));

            // Follower count (15% weight) - scaled appropriately
            const followerWeight = 15;
            const followers = creator.follower_count || 0;
            let followerScore = 0;
            if (followers > 1000000) followerScore = followerWeight;         // Mega
            else if (followers > 500000) followerScore = followerWeight * 0.9; // Macro
            else if (followers > 100000) followerScore = followerWeight * 0.8; // Mid-tier
            else if (followers > 50000) followerScore = followerWeight * 0.7;  // Micro
            else if (followers > 10000) followerScore = followerWeight * 0.6;  // Nano+
            else if (followers >= 1000) followerScore = followerWeight * 0.4;   // Nano
            // else 0
            score += followerScore;
            scoreBreakdown.followers = parseFloat(followerScore.toFixed(2));

            // Client satisfaction (15% weight)
            const satisfactionWeight = 15;
            const satisfaction = creator.client_satisfaction_score || 0; // Assuming score from 0-5
            const satisfactionScore = (satisfaction / 5) * satisfactionWeight; // Normalize to weight
            score += satisfactionScore;
            scoreBreakdown.satisfaction = parseFloat(satisfactionScore.toFixed(2));

            // Experience/Collaborations (10% weight)
            const experienceWeight = 10;
            const collaborations = creator.total_collaborations || 0;
            let experienceScore = 0;
            if (collaborations > 50) experienceScore = experienceWeight;          // Very Experienced
            else if (collaborations > 20) experienceScore = experienceWeight * 0.8; // Experienced
            else if (collaborations > 10) experienceScore = experienceWeight * 0.6; // Moderately Experienced
            else if (collaborations > 5) experienceScore = experienceWeight * 0.4;  // Some Experience
            else if (collaborations > 0) experienceScore = experienceWeight * 0.2;  // Limited Experience
            // else 0
            score += experienceScore;
            scoreBreakdown.experience = parseFloat(experienceScore.toFixed(2));
            
            // Ensure total score is within 0-100
            const totalScore = Math.max(0, Math.min(100, Math.round(score * 100) / 100));

            return {
                ...creator,
                total_score: totalScore,
                score_breakdown: scoreBreakdown,
                price_per_1k_followers: creator.sponsored_post_rate && creator.follower_count && creator.follower_count > 0
                    ? Math.round((creator.sponsored_post_rate / creator.follower_count) * 1000 * 100) / 100 
                    : null
            };
        });

        // Sort by total score (descending)
        scoredCreators.sort((a, b) => b.total_score - a.total_score);

        return scoredCreators.slice(0, 10); // Return top 10
    }

    /**
     * Get detailed creator analysis
     */
    async getCreatorAnalysis(creatorId) {
        try {
            // Note: The schema has creator_id + platform as unique keys for metrics, pricing.
            // This query will aggregate all platforms for a creator.
            // If you need analysis for a specific platform, add a WHERE clause to the sub-queries or joins.
            const query = `
                SELECT 
                    c.*,
                    (SELECT json_agg(jsonb_build_object(
                        'platform', cpm.platform,
                        'follower_count', cpm.follower_count,
                        'engagement_rate', cpm.engagement_rate,
                        'avg_views', cpm.avg_views,
                        'avg_likes', cpm.avg_likes,
                        'avg_comments', cpm.avg_comments,
                        'avg_shares', cpm.avg_shares,
                        'story_views_avg', cpm.story_views_avg,
                        'updated_at', cpm.updated_at
                    )) FROM creator_platform_metrics cpm WHERE cpm.creator_id = c.id) as platform_metrics,
                    
                    (SELECT json_agg(jsonb_build_object(
                        'platform', cp.platform,
                        'sponsored_post_rate', cp.sponsored_post_rate,
                        'story_mention_rate', cp.story_mention_rate,
                        'video_integration_rate', cp.video_integration_rate,
                        'brand_ambassadorship_monthly_rate', cp.brand_ambassadorship_monthly_rate,
                        'event_coverage_rate', cp.event_coverage_rate,
                        'currency', cp.currency,
                        'updated_at', cp.updated_at
                    )) FROM creator_pricing cp WHERE cp.creator_id = c.id) as pricing,
                    
                    (SELECT json_agg(jsonb_build_object(
                        'brand_name', cc.brand_name,
                        'campaign_type', cc.campaign_type, -- from creator_collaborations
                        'collaboration_date', cc.collaboration_date,
                        'success_rating', cc.success_rating
                    ) ORDER BY cc.collaboration_date DESC) 
                     FROM creator_collaborations cc 
                     WHERE cc.creator_id = c.id 
                       AND cc.collaboration_date > CURRENT_DATE - INTERVAL '12 months'
                    ) as recent_collaborations,

                    (SELECT jsonb_build_object(
                        'content_style', cp_pers.content_style,
                        'communication_tone', cp_pers.communication_tone,
                        'posting_frequency', cp_pers.posting_frequency,
                        'collaboration_style', cp_pers.collaboration_style,
                        'interaction_style', cp_pers.interaction_style
                     ) FROM creator_personality cp_pers WHERE cp_pers.creator_id = c.id
                    ) as personality,
                    
                    (SELECT json_agg(jsonb_build_object(
                        'platform', cad.platform,
                        'age_13_17', cad.age_13_17,
                        'age_18_24', cad.age_18_24,
                        'age_25_34', cad.age_25_34,
                        'age_35_44', cad.age_35_44,
                        'age_45_plus', cad.age_45_plus,
                        'gender_male', cad.gender_male,
                        'gender_female', cad.gender_female,
                        'gender_other', cad.gender_other,
                        'top_countries', cad.top_countries,
                        'interests', cad.interests,
                        'specific_interests', cad.specific_interests,
                        'related_topics', cad.related_topics,
                        'peak_hours', cad.peak_hours
                    )) FROM creator_audience_demographics cad WHERE cad.creator_id = c.id) as audience_demographics
                FROM creators c
                WHERE c.id = $1
                GROUP BY c.id 
            `; 
            // Using subqueries for aggregations to avoid issues with GROUP BY on main creator table if some json_agg returns multiple rows
            // The original query had GROUP BY c.id, which is fine if all json_agg are based on c.id directly.
            // The filter clause for json_agg in the original prompt was good too.
            // This alternative uses correlated subqueries which can be cleaner and sometimes more performant for this pattern.
            
            const result = await pool.query(query, [creatorId]);
            return result.rows[0] || null;
            
        } catch (error) {
            console.error(`Error getting creator analysis for ${creatorId}:`, error);
            throw error;
        }
        // No pool.release() here
    }
    
    /**
     * Example usage / test function
     */
    async searchByPrompt() {
        try {
            // Ensure embeddings are set up (run once or as needed)
            // await this.setupAndGenerateAllEmbeddings();
            
            // Search for coffee brand creators
            const recommendations = await this.getCreatorRecommendations(
                "Premium coffee brand targeting young professionals who appreciate artisan products and a modern aesthetic.",
                {
                    budget: 5000, // Max price for a sponsored post
                    targetAudience: "young professionals, aged 25-35, coffee enthusiasts, lifestyle conscious, urban dwellers",
                    platform: "instagram",
                    contentType: "aesthetic lifestyle posts, high-quality product reviews, minimalist flatlays, story highlights of coffee making"
                }
            );
            
            console.log('Top Creator Recommendations:');
            if (recommendations && recommendations.length > 0) {
                recommendations.forEach((creator, index) => {
                    console.log(`\n${index + 1}. ${creator.creator_name} (@${creator.username}) - Score: ${creator.total_score}/100`);
                    console.log(`   Similarity: ${creator.score_breakdown.similarity}, Engagement: ${creator.score_breakdown.engagement}, Followers: ${creator.score_breakdown.followers}, Satisfaction: ${creator.score_breakdown.satisfaction}, Experience: ${creator.score_breakdown.experience}`);
                    console.log(`   Platform: ${creator.platform}, Followers: ${creator.follower_count?.toLocaleString()}, Engagement Rate: ${creator.engagement_rate}%`);
                    console.log(`   Est. Rate: ${creator.sponsored_post_rate ? `${creator.currency} ${creator.sponsored_post_rate}` : 'N/A'}`);
                    console.log(`   Niche: ${creator.niche}, Bio: ${creator.bio ? creator.bio.substring(0,100)+'...' : 'N/A'}`);
                });
            } else {
                console.log('No recommendations found matching the criteria.');
            }
            
        } catch (error) {
            console.error('Error in searchByPrompt example:', error);
        } finally {
            // Close the pool if this is the end of the application lifecycle
            // For a long-running service, you wouldn't do this here.
            // await this.close(); 
            // console.log('Database pool closed.');
        }
    }

    /**
     * Closes the database connection pool.
     */
    async close() {
        try {
            await pool.end();
            console.log('Database connection pool has been closed.');
        } catch (error) {
            console.error('Error closing database connection pool:', error);
            throw error;
        }
    }
}
  
module.exports = new AIPromptSearch();

// Example of how to run the searchByPrompt (if this file is run directly)
// (async () => {
//   const searchInstance = new AIPromptSearch();
//   await searchInstance.searchByPrompt();
//   await searchInstance.close(); // Ensure pool is closed after the script runs
// })();