// scripts/checkElevenLabsPlan.js
// Check your ElevenLabs plan and available features

const axios = require('axios')
const dotenv = require('dotenv')
dotenv.config()

async function checkElevenLabsPlan () {
  console.log('🔍 Checking ElevenLabs account and plan...\n')

  const apiKey = process.env.ELEVENLABS_API_KEY

  if (!apiKey) {
    console.log('❌ ELEVENLABS_API_KEY not found in environment variables')
    console.log('💡 Add your API key to .env file: ELEVENLABS_API_KEY=your_key_here')
    return
  }

  const client = axios.create({
    baseURL: 'https://api.elevenlabs.io/v1',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'xi-api-key': apiKey
    },
    timeout: 30000
  })

  try {
    // Get user info
    console.log('👤 Account Information:')
    const userResponse = await client.get('/user')
    const user = userResponse.data

    console.log(`   Email: ${user.email || 'N/A'}`)
    console.log(`   User ID: ${user.xi_api_key ? user.xi_api_key.substring(0, 8) + '...' : 'N/A'}`)

    // Check subscription details
    if (user.subscription) {
      console.log('\n💳 Subscription Details:')
      console.log(`   Tier: ${user.subscription.tier || 'Unknown'}`)
      console.log(`   Status: ${user.subscription.status || 'Unknown'}`)
      console.log(`   Character Count: ${user.subscription.character_count || 0}`)
      console.log(`   Character Limit: ${user.subscription.character_limit || 'N/A'}`)
      console.log(`   Can Extend Character Limit: ${user.subscription.can_extend_character_limit || false}`)
      console.log(`   Can Use Instant Voice Cloning: ${user.subscription.can_use_instant_voice_cloning || false}`)
      console.log(`   Can Use Professional Voice Cloning: ${user.subscription.can_use_professional_voice_cloning || false}`)

      // Check for conversational AI features
      if (user.subscription.available_models) {
        console.log(`   Available Models: ${user.subscription.available_models.join(', ')}`)
      }
    }

    // Test Conversational AI access
    console.log('\n🤖 Testing Conversational AI Access:')

    try {
      const agentsResponse = await client.get('/convai/agents')
      console.log('   ✅ Conversational AI endpoint accessible')
      console.log(`   📊 Available agents: ${agentsResponse.data.agents?.length || 0}`)

      if (agentsResponse.data.agents && agentsResponse.data.agents.length > 0) {
        console.log('\n   📋 Your Agents:')
        agentsResponse.data.agents.forEach((agent, index) => {
          console.log(`      ${index + 1}. ID: ${agent.agent_id}`)
          console.log(`         Name: ${agent.name || 'Unnamed'}`)
          console.log(`         Created: ${new Date(agent.created_at).toLocaleDateString()}`)
        })
      } else {
        console.log('   💡 No agents found. Create one at: https://elevenlabs.io/')
      }
    } catch (error) {
      const status = error.response?.status
      const message = error.response?.data?.detail || error.message

      if (status === 405) {
        console.log('   ❌ 405 Method Not Allowed - Conversational AI not available on your plan')
        console.log('   💡 This feature may require a paid subscription')
      } else if (status === 403) {
        console.log('   ❌ 403 Forbidden - Insufficient permissions for Conversational AI')
        console.log('   💡 Upgrade your plan to access this feature')
      } else if (status === 404) {
        console.log('   ❌ 404 Not Found - Conversational AI endpoint not found')
        console.log('   💡 This feature might not be available yet')
      } else {
        console.log(`   ❌ Error ${status}: ${message}`)
      }
    }

    // Test basic TTS (should work on free tier)
    console.log('\n🎙️ Testing Text-to-Speech (should work on free tier):')
    try {
      const voicesResponse = await client.get('/voices')
      console.log('   ✅ TTS endpoint accessible')
      console.log(`   📊 Available voices: ${voicesResponse.data.voices?.length || 0}`)
    } catch (error) {
      console.log(`   ❌ TTS test failed: ${error.response?.status} ${error.response?.statusText}`)
    }

    // Plan recommendations
    console.log('\n💡 Recommendations:')

    if (user.subscription?.tier === 'free') {
      console.log('   📋 You\'re on the FREE tier')
      console.log('   🚫 Conversational AI typically requires STARTER tier or higher')
      console.log('   💰 Consider upgrading to use AI calling features')
      console.log('   🔗 Upgrade at: https://elevenlabs.io/pricing')

      console.log('\n   🛠️ Alternative solutions for FREE tier:')
      console.log('      1. Use fallback mode (current system works!)')
      console.log('      2. Pre-record messages using TTS')
      console.log('      3. Use simple voice prompts')
      console.log('      4. Upgrade when ready for full AI conversations')
    } else {
      console.log(`   📋 You're on the ${user.subscription?.tier?.toUpperCase()} tier`)
      console.log('   🔧 If Conversational AI still doesn\'t work, contact ElevenLabs support')
    }
  } catch (error) {
    console.error('❌ Failed to check account details:', error.response?.data || error.message)

    if (error.response?.status === 401) {
      console.log('\n💡 API key issues:')
      console.log('   - Check if your API key is correct')
      console.log('   - Regenerate API key in ElevenLabs dashboard')
      console.log('   - Ensure no extra spaces in .env file')
    }
  }
}

if (require.main === module) {
  checkElevenLabsPlan().catch(console.error)
}

module.exports = { checkElevenLabsPlan }
