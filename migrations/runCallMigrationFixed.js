// migrations/runCallMigrationFixed.js
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

async function detectCreatorIdType () {
  try {
    const query = `
      SELECT data_type 
      FROM information_schema.columns 
      WHERE table_name = 'creators' 
      AND column_name = 'id'
    `

    const result = await pool.query(query)

    if (result.rows.length === 0) {
      throw new Error('Creators table or id column not found')
    }

    const dataType = result.rows[0].data_type
    console.log(`📋 Detected creators.id data type: ${dataType}`)

    // Map PostgreSQL data types to our migration types
    if (dataType === 'uuid') {
      return 'UUID'
    } else if (dataType === 'integer' || dataType === 'bigint') {
      return 'INTEGER'
    } else if (dataType === 'character varying' || dataType === 'text') {
      return 'TEXT'
    } else {
      console.warn(`⚠️ Unknown data type: ${dataType}, defaulting to TEXT`)
      return 'TEXT'
    }
  } catch (error) {
    console.error('Error detecting creator ID type:', error)
    throw error
  }
}

async function runCallMigration () {
  try {
    console.log('🚀 Starting call system database migration...')

    // First, detect the data type of creators.id
    const creatorIdType = await detectCreatorIdType()
    console.log(`✅ Will use ${creatorIdType} for creator_id foreign key`)

    // Create the migration SQL with the correct data type
    const migrationSQL = `
-- Calls table to track all outbound calls
CREATE TABLE IF NOT EXISTS calls (
    id SERIAL PRIMARY KEY,
    creator_id ${creatorIdType} REFERENCES creators(id),
    phone_number VARCHAR(20) NOT NULL,
    call_sid VARCHAR(100) UNIQUE,
    status VARCHAR(50) DEFAULT 'initiated',
    direction VARCHAR(20) DEFAULT 'outbound',
    duration_seconds INTEGER DEFAULT 0,
    call_recording_url TEXT,
    conversation_summary TEXT,
    elevenlabs_conversation_id VARCHAR(100),
    caller_id VARCHAR(20),
    cost_usd DECIMAL(10,4),
    call_outcome VARCHAR(50), -- 'completed', 'no-answer', 'busy', 'failed', 'canceled'
    notes TEXT,
    initiated_by_user_id INTEGER, -- If you have user management
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Call events table for detailed call flow tracking
CREATE TABLE IF NOT EXISTS call_events (
    id SERIAL PRIMARY KEY,
    call_id INTEGER REFERENCES calls(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL, -- 'initiated', 'ringing', 'answered', 'completed', 'failed'
    event_data JSONB,
    twilio_event_data JSONB,
    timestamp TIMESTAMP DEFAULT NOW()
);

-- Call analytics table for business metrics
CREATE TABLE IF NOT EXISTS call_analytics (
    id SERIAL PRIMARY KEY,
    call_id INTEGER REFERENCES calls(id) ON DELETE CASCADE,
    talk_time_seconds INTEGER,
    wait_time_seconds INTEGER,
    sentiment_score DECIMAL(3,2), -- -1.0 to 1.0
    conversation_quality_score DECIMAL(3,2), -- 0.0 to 1.0
    lead_score INTEGER, -- 1-10 rating
    conversion_probability DECIMAL(3,2), -- 0.0 to 1.0
    key_topics TEXT[], -- Array of topics discussed
    follow_up_required BOOLEAN DEFAULT FALSE,
    next_action VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_calls_creator_id ON calls(creator_id);
CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status);
CREATE INDEX IF NOT EXISTS idx_calls_created_at ON calls(created_at);
CREATE INDEX IF NOT EXISTS idx_calls_phone_number ON calls(phone_number);
CREATE INDEX IF NOT EXISTS idx_call_events_call_id ON call_events(call_id);
CREATE INDEX IF NOT EXISTS idx_call_events_type ON call_events(event_type);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop trigger if it exists and recreate
DROP TRIGGER IF EXISTS update_calls_updated_at ON calls;
CREATE TRIGGER update_calls_updated_at 
    BEFORE UPDATE ON calls 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
    `

    console.log('📝 Executing migration...')
    await pool.query(migrationSQL)

    console.log('✅ Migration completed successfully!')
    console.log('📋 Created tables:')
    console.log('   - calls (with creator_id type: ' + creatorIdType + ')')
    console.log('   - call_events')
    console.log('   - call_analytics')
    console.log('📊 Created indexes for performance')
    console.log('🔄 Created trigger for automatic timestamp updates')

    // Test basic functionality
    console.log('\n🧪 Testing database connection...')
    const testResult = await pool.query('SELECT COUNT(*) FROM calls')
    console.log(`✅ Database test successful. Current calls count: ${testResult.rows[0].count}`)

    // Test foreign key constraint
    console.log('\n🔗 Testing foreign key constraint...')
    const creatorTestResult = await pool.query('SELECT COUNT(*) FROM creators')
    console.log(`✅ Creators table accessible. Total creators: ${creatorTestResult.rows[0].count}`)

    if (parseInt(creatorTestResult.rows[0].count) === 0) {
      console.log('\n⚠️ Warning: No creators found in database.')
      console.log('💡 You may want to create a test creator:')
      console.log('   INSERT INTO creators (creator_name, username, email, niche, tier, primary_platform)')
      console.log('   VALUES (\'Test Creator\', \'test\', \'test@test.com\', \'tech_gaming\', \'micro\', \'youtube\');')
    }
  } catch (error) {
    console.error('❌ Migration failed:', error)
    console.error('\n🔧 Troubleshooting:')
    console.error('1. Ensure PostgreSQL is running')
    console.error('2. Check database connection settings in config/index.js')
    console.error('3. Verify the creators table exists (required for foreign key)')
    console.error('4. Check database user permissions')

    if (error.message.includes('uuid')) {
      console.error('5. UUID type issue - this script should auto-detect and fix this')
    }

    if (error.message.includes('does not exist')) {
      console.error('5. Make sure creators table exists in your database')
    }
  } finally {
    await pool.end()
  }
}

// Additional helper function to check current schema
async function checkCurrentSchema () {
  try {
    console.log('🔍 Checking current database schema...')

    // Check if calls table already exists
    const tableCheck = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('calls', 'call_events', 'call_analytics')
    `)

    if (tableCheck.rows.length > 0) {
      console.log('⚠️ Some call tables already exist:')
      tableCheck.rows.forEach(row => {
        console.log(`   - ${row.table_name}`)
      })
      console.log('\n🔄 Migration will use IF NOT EXISTS to avoid conflicts')
    }

    // Check creators table structure
    const creatorsCheck = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'creators'
      ORDER BY ordinal_position
    `)

    if (creatorsCheck.rows.length > 0) {
      console.log('\n📋 Creators table structure:')
      creatorsCheck.rows.forEach(row => {
        console.log(`   ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`)
      })
    } else {
      console.log('\n❌ Creators table not found! Please create it first.')
    }
  } catch (error) {
    console.error('Error checking schema:', error)
  }
}

if (require.main === module) {
  if (process.argv.includes('--check')) {
    checkCurrentSchema().then(() => pool.end())
  } else {
    runCallMigration()
  }
}

module.exports = { runCallMigration, checkCurrentSchema, detectCreatorIdType }
