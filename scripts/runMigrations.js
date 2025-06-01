// scripts/runMigrations.js
const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')
const __config = require('../config')

const pool = new Pool({
  user: __config.postgres.user,
  host: __config.postgres.host,
  database: __config.postgres.database,
  password: __config.postgres.password,
  port: __config.postgres.port,
  ssl: __config.postgres.ssl
})

async function runMigrations () {
  const client = await pool.connect()

  try {
    console.log('🚀 Starting database migrations...\n')

    // Create migrations tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        migration_name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    const migrationsDir = path.join(__dirname, '..', 'migrations')
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort()

    if (migrationFiles.length === 0) {
      console.log('❌ No migration files found in migrations directory')
      return
    }

    console.log(`📁 Found ${migrationFiles.length} migration files:`)
    migrationFiles.forEach((file) => console.log(`   - ${file}`))
    console.log('')

    for (const migrationFile of migrationFiles) {
      const migrationName = path.basename(migrationFile, '.sql')

      // Check if migration already executed
      const existingMigration = await client.query(
        'SELECT id FROM schema_migrations WHERE migration_name = $1',
        [migrationName]
      )

      if (existingMigration.rows.length > 0) {
        console.log(`⏭️  Skipping ${migrationName} (already executed)`)
        continue
      }

      console.log(`🔄 Executing migration: ${migrationName}`)

      try {
        await client.query('BEGIN')

        // Read and execute migration SQL
        const migrationSQL = fs.readFileSync(
          path.join(migrationsDir, migrationFile),
          'utf8'
        )

        await client.query(migrationSQL)

        // Record migration as executed
        await client.query(
          'INSERT INTO schema_migrations (migration_name) VALUES ($1)',
          [migrationName]
        )

        await client.query('COMMIT')
        console.log(`✅ Successfully executed: ${migrationName}`)
      } catch (error) {
        await client.query('ROLLBACK')
        console.error(`❌ Failed to execute ${migrationName}:`, error.message)
        throw error
      }
    }

    console.log('\n🎉 All migrations completed successfully!')

    // Show table summary
    const tableCount = await client.query(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `)

    console.log(`📊 Database now contains ${tableCount.rows[0].count} tables`)

    // Show key tables
    const keyTables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        AND table_name IN ('users', 'brands', 'products', 'campaigns', 'creators')
      ORDER BY table_name
    `)

    if (keyTables.rows.length > 0) {
      console.log('\n🔑 Key application tables:')
      keyTables.rows.forEach((row) => {
        console.log(`   ✓ ${row.table_name}`)
      })
    }
  } catch (error) {
    console.error('\n💥 Migration failed:', error)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

async function rollbackLastMigration () {
  const client = await pool.connect()

  try {
    console.log('⏪ Rolling back last migration...\n')

    // Get last executed migration
    const lastMigration = await client.query(`
      SELECT migration_name, executed_at 
      FROM schema_migrations 
      ORDER BY executed_at DESC 
      LIMIT 1
    `)

    if (lastMigration.rows.length === 0) {
      console.log('❌ No migrations to rollback')
      return
    }

    const migrationName = lastMigration.rows[0].migration_name
    console.log(`🔄 Rolling back: ${migrationName}`)

    // Check for rollback file
    const rollbackFile = path.join(
      __dirname,
      '..',
      'migrations',
      'rollbacks',
      `${migrationName}_rollback.sql`
    )

    if (!fs.existsSync(rollbackFile)) {
      console.log(`⚠️  No rollback file found for ${migrationName}`)
      console.log('   Manual rollback may be required')
      return
    }

    try {
      await client.query('BEGIN')

      // Execute rollback SQL
      const rollbackSQL = fs.readFileSync(rollbackFile, 'utf8')
      await client.query(rollbackSQL)

      // Remove migration record
      await client.query(
        'DELETE FROM schema_migrations WHERE migration_name = $1',
        [migrationName]
      )

      await client.query('COMMIT')
      console.log(`✅ Successfully rolled back: ${migrationName}`)
    } catch (error) {
      await client.query('ROLLBACK')
      console.error(`❌ Failed to rollback ${migrationName}:`, error.message)
      throw error
    }
  } catch (error) {
    console.error('\n💥 Rollback failed:', error)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

async function showMigrationStatus () {
  const client = await pool.connect()

  try {
    console.log('📋 Migration Status:\n')

    const migrations = await client.query(`
      SELECT migration_name, executed_at 
      FROM schema_migrations 
      ORDER BY executed_at DESC
    `)

    if (migrations.rows.length === 0) {
      console.log('❌ No migrations have been executed')
      return
    }

    console.log('✅ Executed migrations:')
    migrations.rows.forEach((row) => {
      console.log(
        `   ${row.migration_name} (${new Date(
          row.executed_at
        ).toLocaleString()})`
      )
    })

    console.log(`\n📊 Total migrations executed: ${migrations.rows.length}`)
  } catch (error) {
    console.error('Error getting migration status:', error)
  } finally {
    client.release()
    await pool.end()
  }
}

// CLI interface
const command = process.argv[2]

switch (command) {
  case 'up':
  case 'migrate':
    runMigrations()
    break
  case 'down':
  case 'rollback':
    rollbackLastMigration()
    break
  case 'status':
    showMigrationStatus()
    break
  case 'reset':
    console.log('⚠️  Database reset not implemented for safety')
    console.log('   Please drop and recreate the database manually if needed')
    break
  default:
    console.log('🔧 Database Migration Tool')
    console.log('')
    console.log('Usage:')
    console.log(
      '  node scripts/runMigrations.js migrate  - Run pending migrations'
    )
    console.log(
      '  node scripts/runMigrations.js up       - Run pending migrations'
    )
    console.log(
      '  node scripts/runMigrations.js rollback - Rollback last migration'
    )
    console.log(
      '  node scripts/runMigrations.js down     - Rollback last migration'
    )
    console.log(
      '  node scripts/runMigrations.js status   - Show migration status'
    )
    console.log('')
    console.log('Examples:')
    console.log('  npm run migrate')
    console.log('  npm run db:status')
    break
}

module.exports = { runMigrations, rollbackLastMigration, showMigrationStatus }
