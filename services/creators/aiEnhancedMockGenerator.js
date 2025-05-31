const mockCreatorGenerator = require('./mockCreatorGenerator');
const openaiService = require('../ai/openaiService');
const { faker } = require('@faker-js/faker');

class AIEnhancedMockGenerator {
  constructor() {
    this.baseGenerator = mockCreatorGenerator;
  }

  async generateAIEnhancedCreator() {
    // Start with base creator
    const baseCreator = this.baseGenerator.generateSingleCreator();
    
    try {
      // Enhance with AI-generated content
      const [bio, contentExamples, brandCollabs, audienceInsights, personality] = await Promise.all([
        openaiService.generateCreatorBio(baseCreator),
        openaiService.generateContentExamples(baseCreator),
        openaiService.generateBrandCollaborations(baseCreator),
        openaiService.generateAudienceInsights(baseCreator),
        openaiService.generateCreatorPersonality(baseCreator)
      ]);

      return {
        ...baseCreator,
        bio: bio,
        content_examples: contentExamples,
        brand_collaborations: brandCollabs,
        audience_insights: {
          ...baseCreator.audience_demographics,
          ...audienceInsights
        },
        personality_profile: personality,
        ai_enhanced: true
      };

    } catch (error) {
      console.error('Error in AI enhancement:', error);
      return {
        ...baseCreator,
        ai_enhanced: false,
        ai_error: error.message
      };
    }
  }

  async generateMultipleAIEnhancedCreators(count = 50) {
    console.log(`🤖 Starting AI-enhanced generation of ${count} creators...`);
    console.log('⏱️ This will take approximately', Math.ceil(count * 1.5), 'minutes due to API rate limits');
    
    const creators = [];
    const batchSize = 50; // Process in batches to manage memory
    
    for (let i = 0; i < count; i += batchSize) {
      const batchEnd = Math.min(i + batchSize, count);
      const batchCreators = [];
      
      // Generate base creators for this batch
      for (let j = i; j < batchEnd; j++) {
        batchCreators.push(this.baseGenerator.generateSingleCreator());
      }
      
      // Enhance batch with AI
      const enhancedBatch = await openaiService.generateBatchCreatorProfiles(batchCreators);
      creators.push(...enhancedBatch);
      
      console.log(`✅ Completed batch ${Math.ceil((i + 1) / batchSize)} of ${Math.ceil(count / batchSize)}`);
      
      // Longer delay between batches to be respectful to API limits
      if (batchEnd < count) {
        console.log('⏳ Waiting 30 seconds before next batch...');
        await new Promise(resolve => setTimeout(resolve, 30000));
      }
    }
    
    console.log(`🎉 Successfully generated ${creators.length} AI-enhanced creators!`);
    return creators;
  }

  async generateMixedDataset(totalCount = 500, aiEnhancedPercentage = 20) {
    const aiEnhancedCount = Math.floor(totalCount * (aiEnhancedPercentage / 100));
    const regularCount = totalCount - aiEnhancedCount;
    
    console.log(`🎯 Generating mixed dataset:`);
    console.log(`   - ${aiEnhancedCount} AI-enhanced creators (${aiEnhancedPercentage}%)`);
    console.log(`   - ${regularCount} regular mock creators`);
    
    // Generate AI-enhanced creators first (more time-consuming)
    const aiEnhancedCreators = aiEnhancedCount > 0 ? 
      await this.generateMultipleAIEnhancedCreators(aiEnhancedCount) : [];
    
    // Generate regular creators quickly
    console.log('🚀 Generating regular mock creators...');
    const regularCreators = this.baseGenerator.generateMultipleCreators(regularCount);
    
    // Shuffle the combined array for realistic distribution
    const allCreators = [...aiEnhancedCreators, ...regularCreators];
    for (let i = allCreators.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allCreators[i], allCreators[j]] = [allCreators[j], allCreators[i]];
    }
    
    return allCreators;
  }
}

module.exports = new AIEnhancedMockGenerator();