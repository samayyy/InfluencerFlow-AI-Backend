const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')
const __config = require('../config')

const pool = new Pool({
  user: __config.postgres.user,
  host: __config.postgres.host,
  database: __config.postgres.database,
  password: __config.postgres.password,
  port: __config.postgres.port
})

async function runMigration () {
  try {
    console.log('Starting database migration...')

    const migrationSQL = fs.readFileSync(
      path.join(__dirname, '001_create_creators_tables.sql'),
      'utf8'
    )

    await pool.query(migrationSQL)

    console.log('Migration completed successfully!')
    console.log('Created tables:')
    console.log('- creators')
    console.log('- creator_platform_metrics')
    console.log('- creator_audience_demographics')
    console.log('- creator_pricing')
    console.log('- creator_recent_performance')
    console.log('- creator_collaborations')
  } catch (error) {
    console.error('Migration failed:', error)
  } finally {
    await pool.end()
  }
}

if (require.main === module) {
  runMigration()
}

module.exports = { runMigration }
