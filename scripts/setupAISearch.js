// scripts/setupAISearch.js
const __config = require('../config')
const embeddingService = require('../services/ai/embeddingService')
const creatorService = require('../services/creators/creatorService')
const aiSearchOrchestrator = require('../services/search/aiSearchOrchestrator')

async function setupAISearch () {
  console.log('🚀 Setting up AI-powered creator search system...\n')

  try {
    // Check environment variables
    console.log('📋 Checking environment configuration...')
    const requiredEnvVars = [
      'OPENAI_API_KEY',
      'PINECONE_API_KEY',
      'PINECONE_INDEX_NAME'
    ]

    const missingVars = requiredEnvVars.filter(
      (varName) => !process.env[varName]
    )
    if (missingVars.length > 0) {
      console.error('❌ Missing required environment variables:')
      missingVars.forEach((varName) => console.error(`   - ${varName}`))
      console.error('\nPlease add these to your .env file and try again.')
      process.exit(1)
    }
    console.log('✅ Environment variables configured\n')

    // Initialize database connections
    console.log('🔌 Initializing database connections...')
    const __db = require('../lib/db')
    await __db.init()
    console.log('✅ Database connections established\n')

    // Initialize AI services
    console.log('🤖 Initializing AI services...')
    await embeddingService.initializePineconeIndex()
    await aiSearchOrchestrator.initialize()
    console.log('✅ AI services initialized\n')

    // Check if we have creators to embed
    console.log('👥 Checking existing creators...')
    const creatorsPage = await creatorService.getAllCreators(
      {},
      { page: 1, limit: 10 }
    )
    const totalCreators = creatorsPage.pagination?.total || 0

    if (totalCreators === 0) {
      console.log('⚠️ No creators found in database.')
      console.log(
        '💡 Consider running: curl -X POST "http://localhost:3005/api/creators/generateAIEnhancedData?mode=full_ai&count=100"'
      )
      console.log('   to generate sample creators first.\n')
    } else {
      console.log(`✅ Found ${totalCreators} creators in database\n`)
    }

    // Check Pinecone index stats
    console.log('📊 Checking vector index status...')
    const indexStats = await embeddingService.getIndexStats()
    const vectorCount = indexStats.totalRecordCount || 0

    console.log(`   - Total vectors in index: ${vectorCount}`)
    console.log(`   - Index dimension: ${indexStats.dimension || 'N/A'}`)
    console.log(
      `   - Index fullness: ${(
        (vectorCount / (indexStats.indexFullness || 1)) *
        100
      ).toFixed(2)}%\n`
    )

    // Determine next steps based on current state
    if (totalCreators > 0 && vectorCount === 0) {
      console.log('🎯 Next steps:')
      console.log('1. Initialize embeddings for existing creators:')
      console.log(
        '   curl -X POST "http://localhost:3005/api/search/admin/initialize" \\'
      )
      console.log('     -H "Content-Type: application/json" \\')
      console.log("     -d '{\"batch_size\": 50}'\n")
      console.log('2. Test the search system:')
      console.log('   curl -X GET "http://localhost:3005/api/search/health"\n')
    } else if (vectorCount > 0) {
      console.log('🎯 System appears ready! Test it with:')
      console.log(
        'curl -X POST "http://localhost:3005/api/search/aiSearch" \\'
      )
      console.log('  -H "Content-Type: application/json" \\')
      console.log(
        '  -d \'{"query": "tech YouTubers with high engagement"}\'\n'
      )
    } else {
      console.log('🎯 Next steps:')
      console.log('1. Generate sample creators (if needed)')
      console.log('2. Initialize embeddings')
      console.log('3. Test search functionality\n')
    }

    // Run a quick health check
    console.log('🏥 Running system health check...')
    const healthCheck = await aiSearchOrchestrator.healthCheck()

    if (healthCheck.status === 'healthy') {
      console.log('✅ All systems healthy!\n')
    } else {
      console.log('⚠️ Some components may need attention:')
      console.log(JSON.stringify(healthCheck, null, 2))
      console.log('')
    }

    // Performance recommendations
    console.log('⚡ Performance recommendations:')
    console.log('- Enable Redis caching for better search performance')
    console.log('- Monitor OpenAI API usage and rate limits')
    console.log('- Consider batch processing for large creator updates')
    console.log('- Set up monitoring for search query performance\n')

    console.log('🎉 AI search setup completed successfully!')
    console.log('📚 Check the API documentation for usage examples.')
  } catch (error) {
    console.error('❌ Setup failed:', error)
    console.error('\nTroubleshooting:')
    console.error('1. Verify all environment variables are set correctly')
    console.error('2. Check internet connection for API access')
    console.error('3. Ensure database is running and accessible')
    console.error('4. Verify API keys have sufficient permissions/credits')
    process.exit(1)
  }

  process.exit(0)
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Setup interrupted by user')
  process.exit(0)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
  process.exit(1)
})

// Run setup if this script is executed directly
if (require.main === module) {
  setupAISearch()
}

module.exports = { setupAISearch }
