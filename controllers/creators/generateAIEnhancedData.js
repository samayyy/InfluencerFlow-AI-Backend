const express = require('express')
const router = express.Router()
const __constants = require('../../config/constants')
const validationOfAPI = require('../../middlewares/validation')
const creatorService = require('../../services/creators/creatorService')
const aiEnhancedGenerator = require('../../services/creators/aiEnhancedMockGenerator')

const validationSchema = {
  type: 'object',
  required: false,
  properties: {
    count: { type: 'string', required: false },
    ai_percentage: { type: 'string', required: false },
    mode: { type: 'string', required: false } // 'full_ai', 'mixed', 'sample'
  }
}

const validation = (req, res, next) => {
  return validationOfAPI(req, res, next, validationSchema, 'query')
}

// controllers/creators/generateAIEnhancedData.js - Final Fixed Version

const generateAIEnhancedData = async (req, res) => {
  try {
    const count = parseInt(req.query.count) || 50
    const aiPercentage = parseInt(req.query.ai_percentage) || 20
    const mode = req.query.mode || 'mixed'

    console.log('🤖 Starting AI-enhanced creator generation...')
    console.log(`   Mode: ${mode}`)
    console.log(`   Count: ${count}`)
    if (mode === 'mixed') console.log(`   AI Enhancement: ${aiPercentage}%`)

    let creators

    switch (mode) {
      case 'full_ai':
        creators = await aiEnhancedGenerator.generateMultipleAIEnhancedCreators(
          count
        )
        break
      case 'sample':
        creators = await aiEnhancedGenerator.generateMultipleAIEnhancedCreators(
          Math.min(count, 5)
        )
        break
      case 'mixed':
      default:
        creators = await aiEnhancedGenerator.generateMixedDataset(
          count,
          aiPercentage
        )
        break
    }

    console.log('🗄️ Inserting creators into database...')

    const insertResults = {
      successful: 0,
      failed: 0,
      ai_enhanced: 0,
      creator_ids: [],
      errors: []
    }

    for (let i = 0; i < creators.length; i++) {
      try {
        const creator = creators[i]

        // ✅ DEBUG: Log AI enhancement status before insertion
        console.log(
          `🔍 Creator ${i + 1}: ${creator.creator_name} (ai_enhanced: ${
            creator.ai_enhanced
          })`
        )

        // ✅ FIXED: Use single createCreator method for all creators
        // The method now handles both regular and AI-enhanced creators
        const creatorId = await creatorService.createCreator(creator)

        // Track AI-enhanced creators
        if (creator.ai_enhanced === true) {
          insertResults.ai_enhanced++
          console.log(
            `   ✅ AI-enhanced creator inserted: ${creator.creator_name}`
          )
        } else {
          console.log(
            `   📝 Regular creator inserted: ${creator.creator_name}`
          )
        }

        insertResults.creator_ids.push(creatorId)
        insertResults.successful++

        if (i % 25 === 0) {
          console.log(
            `   📊 Progress: ${i + 1}/${creators.length} creators (${
              insertResults.ai_enhanced
            } AI-enhanced so far)`
          )
        }
      } catch (error) {
        console.error(`❌ Error inserting creator ${i + 1}:`, error.message)
        insertResults.failed++
        insertResults.errors.push({
          creator_index: i + 1,
          creator_name: creators[i]?.creator_name || 'Unknown',
          error: error.message,
          ai_enhanced: creators[i]?.ai_enhanced
        })

        // Continue with next creator instead of stopping
        continue
      }
    }

    console.log('✅ AI-enhanced creator generation completed!')
    console.log(`   Successful: ${insertResults.successful}`)
    console.log(`   AI-Enhanced: ${insertResults.ai_enhanced}`)
    console.log(`   Failed: ${insertResults.failed}`)

    // Show sample of errors if any
    if (insertResults.errors.length > 0) {
      console.log('⚠️  Sample errors:', insertResults.errors.slice(0, 3))
    }

    res.sendJson({
      type: __constants.RESPONSE_MESSAGES.SUCCESS,
      data: {
        message: `Generated ${insertResults.successful} creators with AI enhancement`,
        summary: {
          total_requested: count,
          successful_inserts: insertResults.successful,
          ai_enhanced_creators: insertResults.ai_enhanced,
          regular_creators:
            insertResults.successful - insertResults.ai_enhanced,
          failed_inserts: insertResults.failed,
          mode: mode,
          ai_percentage: mode === 'mixed' ? aiPercentage : 100
        },
        creator_ids: insertResults.creator_ids,
        sample_errors: insertResults.errors.slice(0, 5), // Show first 5 errors
        performance_note:
          'AI-enhanced creators include realistic bios, content examples, brand collaborations, and personality profiles stored in database',
        database_tables_populated: [
          'creators (with content_examples, personality_profile)',
          'creator_platform_metrics',
          'creator_audience_demographics (with AI insights)',
          'creator_pricing',
          'creator_brand_collaborations (AI-generated)',
          'creator_personality (AI-generated)'
        ]
      }
    })
  } catch (err) {
    console.error('💥 Critical error in generateAIEnhancedData:', err)
    return res.sendJson({
      type: err.type || __constants.RESPONSE_MESSAGES.SERVER_ERROR,
      err: err.message || err
    })
  }
}
router.post('/generateAIEnhancedData', validation, generateAIEnhancedData)

module.exports = router
