const OpenAI = require('openai');
require('dotenv').config();
const pool = require('../../lib/db/postgres');

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
                model: "text-embedding-3-large", // 3072 dimensions
                input: text,
            });
            return response.data[0].embedding;
        } catch (error) {
            console.error('Error generating embedding:', error);
            throw error;
        }
    }

    /**
     * Create a comprehensive text representation of creator profile
     */
    createCreatorProfileText(creatorData) {
        const profileParts = [];

        // Basic info
        if (creatorData.bio) {
            profileParts.push(`Bio: ${creatorData.bio}`);
        }

        if (creatorData.niche) {
            profileParts.push(`Niche: ${creatorData.niche}`);
        }

        if (creatorData.content_categories && creatorData.content_categories.length > 0) {
            const categories = creatorData.content_categories.join(', ');
            profileParts.push(`Content categories: ${categories}`);
        }

        if (creatorData.location_country) {
            profileParts.push(`Location: ${creatorData.location_country}`);
        }

        if (creatorData.languages && creatorData.languages.length > 0) {
            const languages = creatorData.languages.join(', ');
            profileParts.push(`Languages: ${languages}`);
        }

        // Personality profile from JSON field
        if (creatorData.personality_profile) {
            try {
                const personality = typeof creatorData.personality_profile === 'string' 
                    ? JSON.parse(creatorData.personality_profile) 
                    : creatorData.personality_profile;
                
                const personalityTexts = [];
                if (personality.content_style) personalityTexts.push(`Content style: ${personality.content_style}`);
                if (personality.communication_tone) personalityTexts.push(`Communication tone: ${personality.communication_tone}`);
                if (personality.collaboration_style) personalityTexts.push(`Collaboration style: ${personality.collaboration_style}`);
                
                if (personalityTexts.length > 0) {
                    profileParts.push(personalityTexts.join(', '));
                }
            } catch (e) {
                // Skip if JSON parsing fails
            }
        }

        // Personality from dedicated table
        if (creatorData.content_style || creatorData.communication_tone || creatorData.posting_frequency) {
            const personalityParts = [];
            if (creatorData.content_style) personalityParts.push(`Content style: ${creatorData.content_style}`);
            if (creatorData.communication_tone) personalityParts.push(`Communication tone: ${creatorData.communication_tone}`);
            if (creatorData.posting_frequency) personalityParts.push(`Posting frequency: ${creatorData.posting_frequency}`);
            if (creatorData.collaboration_style) personalityParts.push(`Collaboration style: ${creatorData.collaboration_style}`);
            if (creatorData.interaction_style) personalityParts.push(`Interaction style: ${creatorData.interaction_style}`);
            
            if (personalityParts.length > 0) {
                profileParts.push(personalityParts.join(', '));
            }
        }

        // Add audience interests if available
        if (creatorData.audience_interests && creatorData.audience_interests.length > 0) {
            const interests = creatorData.audience_interests
                .flat()
                .filter(interest => interest !== null)
                .join(', ');
            if (interests) {
                profileParts.push(`Audience interests: ${interests}`);
            }
        }

        // Add specific interests from demographics
        if (creatorData.specific_interests && creatorData.specific_interests.length > 0) {
            const specificInterests = creatorData.specific_interests
                .flat()
                .filter(interest => interest !== null)
                .join(', ');
            if (specificInterests) {
                profileParts.push(`Specific audience interests: ${specificInterests}`);
            }
        }

        // Add related topics from demographics
        if (creatorData.related_topics && creatorData.related_topics.length > 0) {
            const topics = creatorData.related_topics
                .flat()
                .filter(topic => topic !== null)
                .join(', ');
            if (topics) {
                profileParts.push(`Related topics: ${topics}`);
            }
        }

        // Add past collaborations from both tables
        if (creatorData.past_brands && creatorData.past_brands.length > 0) {
            const brands = creatorData.past_brands
                .filter(brand => brand !== null)
                .join(', ');
            if (brands) {
                profileParts.push(`Past brand collaborations: ${brands}`);
            }
        }

        // Add campaign descriptions from brand collaborations
        if (creatorData.campaign_descriptions && creatorData.campaign_descriptions.length > 0) {
            const campaigns = creatorData.campaign_descriptions
                .filter(desc => desc !== null && desc.trim() !== '')
                .join(', ');
            if (campaigns) {
                profileParts.push(`Recent campaign types: ${campaigns}`);
            }
        }

        return profileParts.join(' | ');
    }

    /**
     * Generate and store embedding for a specific creator
     */
    async generateCreatorEmbedding(creatorId) {
        try {
            // Fetch comprehensive creator data from all related tables
            const query = `
                SELECT 
                    c.*,
                    cp.content_style,
                    cp.communication_tone,
                    cp.posting_frequency,
                    cp.collaboration_style,
                    cp.interaction_style,
                    ARRAY_AGG(DISTINCT cad.interests) as audience_interests,
                    ARRAY_AGG(DISTINCT cad.specific_interests) as specific_interests,
                    ARRAY_AGG(DISTINCT cad.related_topics) as related_topics,
                    ARRAY_AGG(DISTINCT cc.brand_name) as past_brands,
                    ARRAY_AGG(DISTINCT cbc.campaign_description) as campaign_descriptions
                FROM creators c
                LEFT JOIN creator_personality cp ON c.id = cp.creator_id
                LEFT JOIN creator_audience_demographics cad ON c.id = cad.creator_id
                LEFT JOIN creator_collaborations cc ON c.id = cc.creator_id
                LEFT JOIN creator_brand_collaborations cbc ON c.id = cbc.creator_id
                WHERE c.id = $1
                GROUP BY c.id, cp.content_style, cp.communication_tone, cp.posting_frequency, 
                         cp.collaboration_style, cp.interaction_style
            `;
            
            const result = await pool.pool.query(query, [creatorId]);
            
            if (result.rows.length === 0) {
                throw new Error(`Creator with id ${creatorId} not found`);
            }

            const creatorData = result.rows[0];
            
            // Create profile text and generate embedding
            const profileText = this.createCreatorProfileText(creatorData);
            const embedding = await this.getEmbedding(profileText);
            
            // Store embedding in database
            const updateQuery = `
                UPDATE creators 
                SET profile_embedding = $1::vector 
                WHERE id = $2
            `;
            
            await pool.pool.query(updateQuery, [JSON.stringify(embedding), creatorId]);
            
            console.log(`Generated embedding for creator ${creatorId}`);
            return embedding;
            
        } catch (error) {
            console.error(`Error generating embedding for creator ${creatorId}:`, error);
            throw error;
        }
    }

    /**
     * Check if profile_embedding column exists and create it if not
     */
    async ensureEmbeddingColumnExists() {
        try {
            // Check if profile_embedding column exists
            const columnCheck = await pool.pool.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'creators' 
                AND column_name = 'profile_embedding'
            `);
            
            if (columnCheck.rows.length === 0) {
                console.log('profile_embedding column not found. Creating it...');
                
                // Add the profile_embedding column with correct dimensions for text-embedding-3-large
                await pool.pool.query(`
                    ALTER TABLE creators 
                    ADD COLUMN profile_embedding vector(3072)
                `);
                
                console.log('profile_embedding column created successfully');
                
                // Check if index exists and create it if not
                const indexCheck = await pool.pool.query(`
                    SELECT indexname 
                    FROM pg_indexes 
                    WHERE tablename = 'creators' 
                    AND indexname = 'creators_profile_embedding_idx'
                `);
                
                if (indexCheck.rows.length === 0) {
                    console.log('Creating vector index for profile_embedding...');
                    
                    await pool.pool.query(`
                        CREATE INDEX creators_profile_embedding_idx 
                        ON creators USING ivfflat (profile_embedding vector_cosine_ops) 
                        WITH (lists = 100)
                    `);
                    
                    console.log('Vector index created successfully');
                } else {
                    console.log('Vector index already exists');
                }
                
            } else {
                console.log('profile_embedding column already exists');
                
                // Check if the column has the correct dimensions
                const columnInfo = await pool.pool.query(`
                    SELECT data_type, character_maximum_length
                    FROM information_schema.columns 
                    WHERE table_name = 'creators' 
                    AND column_name = 'profile_embedding'
                `);
                
                // Still check for index
                const indexCheck = await pool.pool.query(`
                    SELECT indexname 
                    FROM pg_indexes 
                    WHERE tablename = 'creators' 
                    AND indexname = 'creators_profile_embedding_idx'
                `);
                
                if (indexCheck.rows.length === 0) {
                    console.log('Creating missing vector index...');
                    
                    await pool.pool.query(`
                        CREATE INDEX creators_profile_embedding_idx 
                        ON creators USING ivfflat (profile_embedding vector_cosine_ops) 
                        WITH (lists = 100)
                    `);
                    
                    console.log('Vector index created successfully');
                }
            }
            
        } catch (error) {
            console.error('Error ensuring embedding column exists:', error);
            throw error;
        }
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
     * Generate embeddings for all creators that don't have them
     */
    async generateAllCreatorEmbeddings() {
        try {
            const result = await pool.pool.query(
                "SELECT id FROM creators WHERE profile_embedding IS NULL"
            );
            
            const creatorIds = result.rows.map(row => row.id);
            console.log(`Found ${creatorIds.length} creators without embeddings`);
            
            if (creatorIds.length === 0) {
                console.log('All creators already have embeddings!');
                return;
            }
            
            let processed = 0;
            const total = creatorIds.length;
            
            for (const creatorId of creatorIds) {
                try {
                    await this.generateCreatorEmbedding(creatorId);
                    processed++;
                    
                    // Progress logging
                    if (processed % 10 === 0 || processed === total) {
                        console.log(`Progress: ${processed}/${total} creators processed (${Math.round(processed/total * 100)}%)`);
                    }
                    
                    // Add small delay to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 200));
                    
                } catch (error) {
                    console.error(`Failed to generate embedding for ${creatorId}:`, error);
                    
                    // Continue with next creator even if one fails
                    processed++;
                }
            }
            
            console.log(`Embedding generation completed! Processed ${processed}/${total} creators`);
            
        } catch (error) {
            console.error('Error in generateAllCreatorEmbeddings:', error);
            throw error;
        }
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
            let paramIndex = 2;
            
            if (minEngagementRate !== null) {
                conditions.push(`cpm.engagement_rate >= $${paramIndex}`);
                params.push(minEngagementRate);
                paramIndex++;
            }
            
            if (platform) {
                conditions.push(`cpm.platform = $${paramIndex}`);
                params.push(platform);
                paramIndex++;
            }
            
            if (maxPriceRange !== null) {
                conditions.push(`cp.sponsored_post_rate <= $${paramIndex}`);
                params.push(maxPriceRange);
                paramIndex++;
            }
            
            if (minFollowers !== null) {
                conditions.push(`cpm.follower_count >= $${paramIndex}`);
                params.push(minFollowers);
                paramIndex++;
            }
            
            if (tier) {
                conditions.push(`c.tier = $${paramIndex}`);
                params.push(tier);
                paramIndex++;
            }
            
            params.push(limit);
            
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
                    c.personality_profile,
                    c.content_examples,
                    c.ai_enhanced,
                    cpers.content_style,
                    cpers.communication_tone,
                    cpers.collaboration_style,
                    cpers.posting_frequency,
                    cpers.interaction_style,
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
                LEFT JOIN creator_personality cpers ON c.id = cpers.creator_id
                LEFT JOIN creator_platform_metrics cpm ON c.id = cpm.creator_id
                LEFT JOIN creator_pricing cp ON c.id = cp.creator_id AND cp.platform = cpm.platform
                WHERE ${conditions.join(' AND ')}
                ORDER BY c.profile_embedding <=> $1::vector
                LIMIT $${paramIndex}
            `;
            
            const result = await pool.pool.query(searchQuery, params);
            return result.rows;
            
        } catch (error) {
            console.error('Error in searchCreators:', error);
            throw error;
        }
    }

    /**
     * Search creators based on personality traits
     */
    async searchByPersonality(options = {}) {
        const {
            contentStyle = null,
            communicationTone = null,
            collaborationStyle = null,
            interactionStyle = null,
            postingFrequency = null,
            limit = 10
        } = options;

        try {
            // Build personality-based query
            const personalityQuery = [
                contentStyle && `content style: ${contentStyle}`,
                communicationTone && `communication tone: ${communicationTone}`,
                collaborationStyle && `collaboration style: ${collaborationStyle}`,
                interactionStyle && `interaction style: ${interactionStyle}`,
                postingFrequency && `posting frequency: ${postingFrequency}`
            ].filter(Boolean).join(', ');

            if (!personalityQuery) {
                throw new Error('At least one personality trait is required');
            }

            return await this.searchCreators(personalityQuery, { limit });

        } catch (error) {
            console.error('Error in searchByPersonality:', error);
            throw error;
        }
    }

    /**
     * Get creator recommendations for a specific brand with advanced scoring
     */
    async getCreatorRecommendations(brandDescription, options = {}) {
        const {
            budget = null,
            targetAudience = null,
            platform = "instagram",
            contentType = null,
            region = null
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
            limit: 20,
            minEngagementRate: 1.5, // Minimum 1.5% engagement rate
            platform: platform
        };

        if (budget) {
            searchOptions.maxPriceRange = budget;
        }

        const creators = await this.searchCreators(enhancedQuery, searchOptions);

        // Add comprehensive scoring
        const scoredCreators = creators.map(creator => {
            let score = 0;
            let scoreBreakdown = {};

            // Similarity score (35% weight)
            const similarityWeight = 35;
            const similarityScore = (creator.similarity_score || 0) * similarityWeight;
            score += similarityScore;
            scoreBreakdown.similarity = similarityScore;

            // Engagement rate (25% weight)
            const engagementWeight = 25;
            const engagement = creator.engagement_rate || 0;
            let engagementScore = 0;
            if (engagement > 8) engagementScore = engagementWeight;
            else if (engagement > 5) engagementScore = engagementWeight * 0.8;
            else if (engagement > 3) engagementScore = engagementWeight * 0.6;
            else if (engagement > 1.5) engagementScore = engagementWeight * 0.4;
            
            score += engagementScore;
            scoreBreakdown.engagement = engagementScore;

            // Follower count (15% weight) - scaled appropriately
            const followerWeight = 15;
            const followers = creator.follower_count || 0;
            let followerScore = 0;
            if (followers > 1000000) followerScore = followerWeight;
            else if (followers > 500000) followerScore = followerWeight * 0.9;
            else if (followers > 100000) followerScore = followerWeight * 0.8;
            else if (followers > 50000) followerScore = followerWeight * 0.7;
            else if (followers > 10000) followerScore = followerWeight * 0.6;
            else if (followers > 1000) followerScore = followerWeight * 0.4;
            
            score += followerScore;
            scoreBreakdown.followers = followerScore;

            // Client satisfaction (15% weight)
            const satisfactionWeight = 15;
            const satisfaction = creator.client_satisfaction_score || 0;
            const satisfactionScore = (satisfaction / 5) * satisfactionWeight;
            score += satisfactionScore;
            scoreBreakdown.satisfaction = satisfactionScore;

            // Experience/Collaborations (10% weight)
            const experienceWeight = 10;
            const collaborations = creator.total_collaborations || 0;
            let experienceScore = 0;
            if (collaborations > 50) experienceScore = experienceWeight;
            else if (collaborations > 20) experienceScore = experienceWeight * 0.8;
            else if (collaborations > 10) experienceScore = experienceWeight * 0.6;
            else if (collaborations > 5) experienceScore = experienceWeight * 0.4;
            else if (collaborations > 0) experienceScore = experienceWeight * 0.2;
            
            score += experienceScore;
            scoreBreakdown.experience = experienceScore;

            return {
                ...creator,
                total_score: Math.round(score * 100) / 100,
                score_breakdown: scoreBreakdown,
                price_per_1k_followers: creator.sponsored_post_rate && creator.follower_count 
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
            const query = `
                SELECT 
                    c.*,
                    cp.content_style,
                    cp.communication_tone,
                    cp.posting_frequency,
                    cp.collaboration_style,
                    cp.interaction_style,
                    json_agg(DISTINCT jsonb_build_object(
                        'platform', cpm.platform,
                        'follower_count', cpm.follower_count,
                        'engagement_rate', cpm.engagement_rate,
                        'avg_views', cpm.avg_views,
                        'avg_likes', cpm.avg_likes,
                        'followers_gained_30d', cpm.followers_gained_30d
                    )) FILTER (WHERE cpm.id IS NOT NULL) as platform_metrics,
                    json_agg(DISTINCT jsonb_build_object(
                        'platform', cprice.platform,
                        'sponsored_post_rate', cprice.sponsored_post_rate,
                        'story_mention_rate', cprice.story_mention_rate,
                        'video_integration_rate', cprice.video_integration_rate,
                        'brand_ambassadorship_monthly_rate', cprice.brand_ambassadorship_monthly_rate,
                        'currency', cprice.currency
                    )) FILTER (WHERE cprice.id IS NOT NULL) as pricing,
                    json_agg(DISTINCT jsonb_build_object(
                        'brand_name', cc.brand_name,
                        'campaign_type', cc.campaign_type,
                        'collaboration_date', cc.collaboration_date,
                        'success_rating', cc.success_rating
                    )) FILTER (WHERE cc.id IS NOT NULL AND cc.collaboration_date > CURRENT_DATE - INTERVAL '12 months') as recent_collaborations,
                    json_agg(DISTINCT jsonb_build_object(
                        'brand_name', cbc.brand_name,
                        'collaboration_type', cbc.collaboration_type,
                        'collaboration_date', cbc.collaboration_date,
                        'success_rating', cbc.success_rating,
                        'campaign_description', cbc.campaign_description,
                        'ai_generated', cbc.ai_generated
                    )) FILTER (WHERE cbc.id IS NOT NULL AND cbc.collaboration_date > CURRENT_DATE - INTERVAL '12 months') as recent_brand_collaborations,
                    json_agg(DISTINCT jsonb_build_object(
                        'platform', cad.platform,
                        'age_demographics', jsonb_build_object(
                            'age_13_17', cad.age_13_17,
                            'age_18_24', cad.age_18_24,
                            'age_25_34', cad.age_25_34,
                            'age_35_44', cad.age_35_44,
                            'age_45_plus', cad.age_45_plus
                        ),
                        'gender_demographics', jsonb_build_object(
                            'male', cad.gender_male,
                            'female', cad.gender_female,
                            'other', cad.gender_other
                        ),
                        'top_countries', cad.top_countries,
                        'interests', cad.interests,
                        'specific_interests', cad.specific_interests,
                        'related_topics', cad.related_topics,
                        'peak_hours', cad.peak_hours
                    )) FILTER (WHERE cad.id IS NOT NULL) as audience_demographics
                FROM creators c
                LEFT JOIN creator_personality cp ON c.id = cp.creator_id
                LEFT JOIN creator_platform_metrics cpm ON c.id = cpm.creator_id
                LEFT JOIN creator_pricing cprice ON c.id = cprice.creator_id
                LEFT JOIN creator_collaborations cc ON c.id = cc.creator_id 
                LEFT JOIN creator_brand_collaborations cbc ON c.id = cbc.creator_id
                LEFT JOIN creator_audience_demographics cad ON c.id = cad.creator_id
                WHERE c.id = $1
                GROUP BY c.id, cp.content_style, cp.communication_tone, cp.posting_frequency, 
                         cp.collaboration_style, cp.interaction_style
            `;
            
            const result = await pool.pool.query(query, [creatorId]);
            return result.rows[0] || null;
            
        } catch (error) {
            console.error('Error in getCreatorAnalysis:', error);
            throw error;
        }
    }

    /**
     * Search by natural language prompt - main demo function
     */
    async searchByPrompt(prompt = null, options = {}) {
        try {
            const defaultPrompt = prompt || "Premium coffee brand targeting young professionals";
            const defaultOptions = {
                budget: 5000,
                targetAudience: "coffee enthusiasts, young professionals, lifestyle",
                platform: "instagram",
                contentType: "lifestyle posts, product reviews",
                ...options
            };

            console.log(`\n🔍 Searching for creators matching: "${defaultPrompt}"`);
            console.log(`📊 Search criteria:`, defaultOptions);

            // Search for creators
            const recommendations = await this.getCreatorRecommendations(defaultPrompt, defaultOptions);
            
            console.log('\n🏆 Top Creator Recommendations:');
            console.log('=' .repeat(60));
            
            recommendations.forEach((creator, index) => {
                console.log(`\n${index + 1}. ${creator.creator_name} (@${creator.username})`);
                console.log(`   📈 Score: ${creator.total_score}/100`);
                console.log(`   👥 Followers: ${creator.follower_count?.toLocaleString() || 'N/A'}`);
                console.log(`   💝 Engagement: ${creator.engagement_rate || 'N/A'}%`);
                console.log(`   💰 Rate: $${creator.sponsored_post_rate || 'N/A'} (${creator.currency || 'USD'})`);
                console.log(`   🎯 Niche: ${creator.niche || 'N/A'}`);
                console.log(`   📍 Location: ${creator.location_country || 'N/A'}`);
                console.log(`   ⭐ Tier: ${creator.tier || 'N/A'}`);
                console.log(`   🤖 AI Enhanced: ${creator.ai_enhanced ? 'Yes' : 'No'}`);
                
                // Show personality if available
                if (creator.content_style || creator.communication_tone) {
                    console.log(`   🎭 Personality:`);
                    if (creator.content_style) console.log(`      • Content: ${creator.content_style}`);
                    if (creator.communication_tone) console.log(`      • Communication: ${creator.communication_tone}`);
                    if (creator.collaboration_style) console.log(`      • Collaboration: ${creator.collaboration_style}`);
                }
                
                if (creator.score_breakdown) {
                    console.log(`   📊 Score Breakdown:`);
                    console.log(`      • Similarity: ${creator.score_breakdown.similarity.toFixed(1)}/35`);
                    console.log(`      • Engagement: ${creator.score_breakdown.engagement.toFixed(1)}/25`);
                    console.log(`      • Followers: ${creator.score_breakdown.followers.toFixed(1)}/15`);
                    console.log(`      • Satisfaction: ${creator.score_breakdown.satisfaction.toFixed(1)}/15`);
                    console.log(`      • Experience: ${creator.score_breakdown.experience.toFixed(1)}/10`);
                }
            });

            return recommendations;
            
        } catch (error) {
            console.error('❌ Error in searchByPrompt:', error);
            throw error;
        }
    }

    /**
     * Demo function to showcase different search capabilities
     */
    async runDemo() {
        try {
            console.log('\n🚀 Starting AI Creator Search Demo...\n');

            // Demo 1: Coffee brand
            await this.searchByPrompt("Sustainable coffee brand for millennials", {
                budget: 3000,
                targetAudience: "environmentally conscious millennials, coffee lovers",
                platform: "instagram"
            });

            // Demo 2: Tech brand
            await this.searchByPrompt("Innovative tech startup targeting developers", {
                budget: 8000,
                targetAudience: "software developers, tech enthusiasts, early adopters",
                platform: "youtube"
            });

            // Demo 3: Personality-based search
            console.log('\n🎭 Personality-Based Search Demo:');
            const personalityResults = await this.searchByPersonality({
                contentStyle: "authentic",
                communicationTone: "friendly",
                collaborationStyle: "professional",
                limit: 5
            });

            console.log(`Found ${personalityResults.length} creators with matching personality:`);
            personalityResults.forEach((creator, index) => {
                console.log(`${index + 1}. ${creator.creator_name} - ${creator.content_style}, ${creator.communication_tone}`);
            });

            console.log('\n✅ Demo completed successfully!');

        } catch (error) {
            console.error('❌ Demo error:', error);
        }
    }
}

module.exports = new AIPromptSearch();