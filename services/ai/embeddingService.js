// services/ai/embeddingService.js
const OpenAI = require("openai");
const { Pinecone } = require('@pinecone-database/pinecone');
const dotenv = require("dotenv");
dotenv.config(); // Load environment variables from .env file

class EmbeddingService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    this.pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
    });

    this.indexName = process.env.PINECONE_INDEX_NAME || 'influencer-search';
    this.embeddingModel = 'text-embedding-3-large';
    this.embeddingDimension = 3072;
  }

  async initializePineconeIndex() {
    try {
      // Check if index exists
      const indexList = await this.pinecone.listIndexes();
      const indexExists = indexList.indexes?.some(index => index.name === this.indexName);

      if (!indexExists) {
        console.log(`Creating Pinecone index: ${this.indexName}`);
        await this.pinecone.createIndex({
          name: this.indexName,
          dimension: this.embeddingDimension,
          metric: 'cosine',
          spec: {
            serverless: {
              cloud: 'aws',
              region: 'us-east-1'
            }
          }
        });
        
        // Wait for index to be ready
        console.log('Waiting for index to be ready...');
        await this.waitForIndexReady();
      }

      this.index = this.pinecone.index(this.indexName);
      console.log('Pinecone index initialized successfully');
    } catch (error) {
      console.error('Error initializing Pinecone index:', error);
      throw error;
    }
  }

  async waitForIndexReady() {
    let isReady = false;
    let attempts = 0;
    const maxAttempts = 30;

    while (!isReady && attempts < maxAttempts) {
      try {
        const indexStats = await this.pinecone.index(this.indexName).describeIndexStats();
        isReady = true;
        console.log('Index is ready!');
      } catch (error) {
        attempts++;
        console.log(`Waiting for index... (${attempts}/${maxAttempts})`);
        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
      }
    }

    if (!isReady) {
      throw new Error('Index failed to become ready within expected time');
    }
  }

  // Generate comprehensive text representation of a creator
  generateCreatorText(creator) {
    const parts = [];

    // Basic info
    parts.push(`Creator: ${creator.creator_name}`);
    parts.push(`Bio: ${creator.bio || 'No bio available'}`);
    parts.push(`Niche: ${creator.niche.replace('_', ' ')}`);
    parts.push(`Tier: ${creator.tier} influencer`);
    parts.push(`Primary platform: ${creator.primary_platform}`);
    parts.push(`Location: ${creator.location_city}, ${creator.location_country}`);

    // Platform metrics
    if (creator.platform_metrics) {
      Object.entries(creator.platform_metrics).forEach(([platform, metrics]) => {
        parts.push(`${platform}: ${metrics.follower_count} followers, ${metrics.engagement_rate}% engagement rate`);
      });
    }

    // Content categories
    if (creator.content_categories) {
      parts.push(`Content types: ${creator.content_categories.join(', ')}`);
    }

    // AI-enhanced content
    if (creator.content_examples) {
      parts.push(`Recent content: ${creator.content_examples.slice(0, 3).join('. ')}`);
    }

    if (creator.brand_collaborations) {
      const brands = creator.brand_collaborations.map(collab => collab.brand_name).slice(0, 5);
      parts.push(`Brand collaborations: ${brands.join(', ')}`);
    }

    if (creator.audience_insights) {
      if (creator.audience_insights.specific_interests) {
        parts.push(`Audience interests: ${creator.audience_insights.specific_interests.join(', ')}`);
      }
      if (creator.audience_insights.top_countries) {
        parts.push(`Top audience countries: ${creator.audience_insights.top_countries.slice(0, 3).join(', ')}`);
      }
    }

    if (creator.personality_profile) {
      parts.push(`Content style: ${creator.personality_profile.content_style}`);
      parts.push(`Communication tone: ${creator.personality_profile.communication_tone}`);
    }

    // Audience demographics
    if (creator.audience_demographics) {
      Object.entries(creator.audience_demographics).forEach(([platform, demo]) => {
        const ageGroups = [];
        if (demo.age_18_24 > 30) ageGroups.push('young adults');
        if (demo.age_25_34 > 30) ageGroups.push('millennials');
        if (demo.age_35_44 > 25) ageGroups.push('gen-x');
        
        if (ageGroups.length > 0) {
          parts.push(`${platform} audience: primarily ${ageGroups.join(' and ')}`);
        }

        if (demo.gender_female > 60) {
          parts.push(`${platform} audience: majority female`);
        } else if (demo.gender_male > 60) {
          parts.push(`${platform} audience: majority male`);
        }
      });
    }

    // Pricing info
    if (creator.pricing) {
      Object.entries(creator.pricing).forEach(([platform, pricing]) => {
        if (pricing.sponsored_post) {
          parts.push(`${platform} sponsored post rate: $${pricing.sponsored_post}`);
        }
      });
    }

    return parts.join('. ');
  }

  // Generate metadata for Pinecone filtering
  generateCreatorMetadata(creator) {
    const metadata = {
      creator_id: creator.id.toString(),
      creator_name: creator.creator_name,
      niche: creator.niche,
      tier: creator.tier,
      primary_platform: creator.primary_platform,
      location_country: creator.location_country,
      location_city: creator.location_city,
      verification_status: creator.verification_status || 'unverified',
      total_collaborations: creator.total_collaborations || 0,
      client_satisfaction_score: creator.client_satisfaction_score || 0,
    };

    // Add follower count and engagement rate from primary platform
    if (creator.platform_metrics && creator.platform_metrics[creator.primary_platform]) {
      const primaryMetrics = creator.platform_metrics[creator.primary_platform];
      metadata.follower_count = primaryMetrics.follower_count || 0;
      metadata.engagement_rate = primaryMetrics.engagement_rate || 0;
    }

    // Add pricing information
    if (creator.pricing && creator.pricing[creator.primary_platform]) {
      const primaryPricing = creator.pricing[creator.primary_platform];
      metadata.sponsored_post_rate = primaryPricing.sponsored_post || 0;
    }

    // Add audience demographics
    if (creator.audience_demographics && creator.audience_demographics[creator.primary_platform]) {
      const audienceDemo = creator.audience_demographics[creator.primary_platform];
      metadata.audience_age_primary = this.getPrimaryAgeGroup(audienceDemo);
      metadata.audience_gender_primary = this.getPrimaryGender(audienceDemo);
    }

    return metadata;
  }

  getPrimaryAgeGroup(demographics) {
    const ageGroups = {
      '13-17': demographics.age_13_17 || 0,
      '18-24': demographics.age_18_24 || 0,
      '25-34': demographics.age_25_34 || 0,
      '35-44': demographics.age_35_44 || 0,
      '45+': demographics.age_45_plus || 0,
    };

    return Object.entries(ageGroups).reduce((a, b) => 
      ageGroups[a[0]] > ageGroups[b[0]] ? a : b
    )[0];
  }

  getPrimaryGender(demographics) {
    const genders = {
      male: demographics.gender_male || 0,
      female: demographics.gender_female || 0,
      other: demographics.gender_other || 0,
    };

    return Object.entries(genders).reduce((a, b) => 
      genders[a[0]] > genders[b[0]] ? a : b
    )[0];
  }

  async generateEmbedding(text) {
    try {
      const response = await this.openai.embeddings.create({
        model: this.embeddingModel,
        input: text,
        encoding_format: "float",
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw error;
    }
  }

  async embedCreator(creator) {
    try {
      console.log(`Generating embedding for creator: ${creator.creator_name}`);
      
      const creatorText = this.generateCreatorText(creator);
      const embedding = await this.generateEmbedding(creatorText);
      const metadata = this.generateCreatorMetadata(creator);

      const vector = {
        id: `creator_${creator.id}`,
        values: embedding,
        metadata: metadata
      };

      await this.index.upsert([vector]);
      
      console.log(`✅ Embedded creator: ${creator.creator_name}`);
      return vector.id;
    } catch (error) {
      console.error(`Error embedding creator ${creator.creator_name}:`, error);
      throw error;
    }
  }

  async embedMultipleCreators(creators) {
    console.log(`Starting embedding process for ${creators.length} creators...`);
    
    const results = {
      successful: 0,
      failed: 0,
      errors: []
    };

    const batchSize = 10;
    
    for (let i = 0; i < creators.length; i += batchSize) {
      const batch = creators.slice(i, i + batchSize);
      const batchPromises = batch.map(async (creator) => {
        try {
          await this.embedCreator(creator);
          results.successful++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            creator_id: creator.id,
            creator_name: creator.creator_name,
            error: error.message
          });
        }
      });

      await Promise.all(batchPromises);
      
      console.log(`Processed batch ${Math.ceil((i + 1) / batchSize)} of ${Math.ceil(creators.length / batchSize)}`);
      
      // Rate limiting delay
      if (i + batchSize < creators.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`Embedding completed. Success: ${results.successful}, Failed: ${results.failed}`);
    return results;
  }

  async updateCreatorEmbedding(creatorId, updatedCreator) {
    try {
      await this.embedCreator(updatedCreator);
      console.log(`Updated embedding for creator ID: ${creatorId}`);
    } catch (error) {
      console.error(`Error updating embedding for creator ${creatorId}:`, error);
      throw error;
    }
  }

  async deleteCreatorEmbedding(creatorId) {
    try {
      await this.index.deleteOne(`creator_${creatorId}`);
      console.log(`Deleted embedding for creator ID: ${creatorId}`);
    } catch (error) {
      console.error(`Error deleting embedding for creator ${creatorId}:`, error);
      throw error;
    }
  }

  async getIndexStats() {
    try {
      const stats = await this.index.describeIndexStats();
      console.log("🚀 ~ EmbeddingService ~ getIndexStats ~ stats:", stats)
      return stats;
    } catch (error) {
      console.error('Error getting index stats:', error);
      throw error;
    }
  }
}

module.exports = new EmbeddingService();