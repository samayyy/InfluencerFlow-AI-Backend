// scripts/checkCreators.js
// Quick script to check your creators table structure and sample data

const { Pool } = require('pg')
const __config = require('../config')

const pool = new Pool({
  user: __config.postgres.user,
  host: __config.postgres.host,
  database: __config.postgres.database,
  password: __config.postgres.password,
  port: __config.postgres.port,
  ssl: { rejectUnauthorized: false }
})

async function checkCreators () {
  try {
    console.log('🔍 Checking creators table...\n')

    // Check table structure
    console.log('📋 Table structure:')
    const structureQuery = `
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'creators'
      ORDER BY ordinal_position
    `

    const structure = await pool.query(structureQuery)

    if (structure.rows.length === 0) {
      console.log('❌ Creators table not found!')
      return
    }

    structure.rows.forEach(row => {
      console.log(`   ${row.column_name}: ${row.data_type} ${row.is_nullable === 'NO' ? '(NOT NULL)' : ''}`)
    })

    // Check data count
    console.log('\n📊 Data summary:')
    const countResult = await pool.query('SELECT COUNT(*) FROM creators')
    console.log(`   Total creators: ${countResult.rows[0].count}`)

    if (parseInt(countResult.rows[0].count) > 0) {
      // Show sample data
      console.log('\n📄 Sample creators:')
      const sampleQuery = `
        SELECT id, creator_name, username, email, niche, tier, primary_platform
        FROM creators 
        ORDER BY created_at DESC 
        LIMIT 5
      `

      const samples = await pool.query(sampleQuery)
      samples.rows.forEach((creator, index) => {
        console.log(`   ${index + 1}. ID: ${creator.id} | Name: ${creator.creator_name} | Niche: ${creator.niche}`)
      })

      // Detect ID type
      const firstId = samples.rows[0].id
      const idType = typeof firstId
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(firstId)

      console.log('\n🔍 ID Analysis:')
      console.log(`   First ID: ${firstId}`)
      console.log(`   JavaScript type: ${idType}`)
      console.log(`   Is UUID format: ${isUuid}`)
      console.log(`   Recommended migration type: ${isUuid ? 'UUID' : idType === 'number' ? 'INTEGER' : 'TEXT'}`)
    } else {
      console.log('\n⚠️ No creators found in database')
      console.log('💡 You may want to create a test creator:')
      console.log('   Run: npm run standard')
      console.log('   Or manually: INSERT INTO creators (creator_name, username, email, niche, tier, primary_platform)')
      console.log('                VALUES (\'Test Creator\', \'test\', \'test@test.com\', \'tech_gaming\', \'micro\', \'youtube\');')
    }
  } catch (error) {
    console.error('❌ Error checking creators:', error)

    if (error.code === '42P01') {
      console.log('\n💡 The creators table doesn\'t exist. Please run your creator migrations first.')
    } else if (error.code === '28P01') {
      console.log('\n💡 Authentication failed. Check your database credentials in config/index.js')
    } else {
      console.log('\n💡 Make sure PostgreSQL is running and accessible.')
    }
  } finally {
    await pool.end()
  }
}

if (require.main === module) {
  checkCreators()
}

module.exports = { checkCreators }
