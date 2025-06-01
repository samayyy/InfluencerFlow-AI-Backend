// scripts/debugElevenLabs.js
// Script to debug ElevenLabs API issues

const axios = require('axios')
const dotenv = require('dotenv')
dotenv.config()

async function debugElevenLabs () {
  console.log('🔍 Debugging ElevenLabs API...\n')

  const apiKey = process.env.ELEVENLABS_API_KEY
  const agentId = process.env.ELEVENLABS_AGENT_ID

  if (!apiKey) {
    console.log('❌ ELEVENLABS_API_KEY not found in environment variables')
    return
  }

  if (!agentId) {
    console.log('⚠️ ELEVENLABS_AGENT_ID not found in environment variables')
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

  // Test 1: Basic API connectivity
  console.log('📡 Test 1: Basic API connectivity')
  try {
    const response = await client.get('/user')
    console.log('✅ API connection successful')
    console.log(`   User: ${response.data.email || 'N/A'}`)
    console.log(`   Plan: ${response.data.subscription?.tier || 'N/A'}`)
  } catch (error) {
    console.log('❌ API connection failed')
    console.log(`   Status: ${error.response?.status}`)
    console.log(`   Error: ${error.response?.data?.detail || error.message}`)
    return
  }

  // Test 2: List available agents
  console.log('\n🤖 Test 2: Available agents')
  try {
    const response = await client.get('/convai/agents')
    const agents = response.data.agents || []

    console.log(`✅ Found ${agents.length} agents`)

    if (agents.length === 0) {
      console.log('⚠️ No agents found. Create one at https://elevenlabs.io/')
    } else {
      agents.forEach((agent, index) => {
        console.log(`   ${index + 1}. ID: ${agent.agent_id}`)
        console.log(`      Name: ${agent.name || 'Unnamed'}`)
        console.log(`      Created: ${agent.created_at || 'N/A'}`)
      })

      // Check if the configured agent exists
      if (agentId) {
        const agentExists = agents.some(agent => agent.agent_id === agentId)
        if (agentExists) {
          console.log(`✅ Configured agent ${agentId} found`)
        } else {
          console.log(`❌ Configured agent ${agentId} NOT found`)
          console.log('💡 Update ELEVENLABS_AGENT_ID with one of the IDs above')
        }
      }
    }
  } catch (error) {
    console.log('❌ Failed to list agents')
    console.log(`   Status: ${error.response?.status}`)
    console.log(`   Error: ${error.response?.data?.detail || error.message}`)
  }

  // Test 3: Test conversation creation (if we have an agent)
  if (agentId) {
    console.log('\n💬 Test 3: Conversation creation')

    // Try different approaches
    const testCases = [
      {
        name: 'Simple payload',
        data: { agent_id: agentId }
      },
      {
        name: 'With variables',
        data: {
          agent_id: agentId,
          variables: {
            test: 'debug_call',
            timestamp: new Date().toISOString()
          }
        }
      },
      {
        name: 'Full payload',
        data: {
          agent_id: agentId,
          conversation_config: {
            conversation_config_override: {
              agent: {
                prompt: {
                  prompt: 'You are a helpful assistant for testing purposes.'
                }
              }
            }
          },
          variables: {
            creator_id: 'debug_test',
            call_context: 'testing'
          }
        }
      }
    ]

    for (const testCase of testCases) {
      console.log(`\n   Testing: ${testCase.name}`)
      try {
        const response = await client.post('/convai/conversations', testCase.data)
        console.log(`   ✅ Success! Conversation ID: ${response.data.conversation_id}`)

        // Clean up - delete the test conversation
        try {
          await client.delete(`/convai/conversations/${response.data.conversation_id}`)
          console.log('   🗑️ Test conversation cleaned up')
        } catch (cleanupError) {
          console.log('   ⚠️ Cleanup failed (not critical)')
        }

        break // If one method works, we're good
      } catch (error) {
        console.log(`   ❌ Failed: ${error.response?.status} ${error.response?.statusText}`)
        console.log(`   Details: ${JSON.stringify(error.response?.data)}`)
      }
    }
  }

  // Test 4: Check API endpoints
  console.log('\n🔗 Test 4: Available endpoints')
  const endpoints = [
    '/convai/agents',
    '/convai/conversations',
    '/voices',
    '/user'
  ]

  for (const endpoint of endpoints) {
    try {
      const response = await client.get(endpoint)
      console.log(`   ✅ ${endpoint} - ${response.status}`)
    } catch (error) {
      const status = error.response?.status
      if (status === 405) {
        console.log(`   ⚠️ ${endpoint} - 405 Method Not Allowed (GET not supported)`)
      } else if (status === 404) {
        console.log(`   ❌ ${endpoint} - 404 Not Found`)
      } else {
        console.log(`   ❌ ${endpoint} - ${status} ${error.response?.statusText}`)
      }
    }
  }

  console.log('\n🎯 Summary:')
  console.log('1. If API connection failed, check your ELEVENLABS_API_KEY')
  console.log('2. If no agents found, create one at https://elevenlabs.io/')
  console.log('3. If conversation creation failed, the API might have changed')
  console.log('4. Check ElevenLabs documentation for latest API format')
  console.log('\n💡 For now, the system will use fallback mode with basic TwiML')
}

if (require.main === module) {
  debugElevenLabs().catch(console.error)
}

module.exports = { debugElevenLabs }
