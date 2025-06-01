// migrations/runCallMigration.js
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const __config = require('../config');

const pool = new Pool({
  user: __config.postgres.user,
  host: __config.postgres.host,
  database: __config.postgres.database,
  password: __config.postgres.password,
  port: __config.postgres.port,
  ssl: { rejectUnauthorized: false }
});

async function runCallMigration() {
  try {
    console.log('🚀 Starting call system database migration...');
    
    // Read the migration SQL file
    const migrationSQL = `
-- Calls table to track all outbound calls
CREATE TABLE IF NOT EXISTS calls (
    id SERIAL PRIMARY KEY,
    creator_id INTEGER REFERENCES creators(id),
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

CREATE TRIGGER update_calls_updated_at 
    BEFORE UPDATE ON calls 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
    `;
    
    await pool.query(migrationSQL);
    
    console.log('✅ Migration completed successfully!');
    console.log('📋 Created tables:');
    console.log('   - calls');
    console.log('   - call_events');
    console.log('   - call_analytics');
    console.log('📊 Created indexes for performance');
    console.log('🔄 Created trigger for automatic timestamp updates');
    
    // Test basic functionality
    console.log('\n🧪 Testing database connection...');
    const testResult = await pool.query('SELECT COUNT(*) FROM calls');
    console.log(`✅ Database test successful. Current calls count: ${testResult.rows[0].count}`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    console.error('\n🔧 Troubleshooting:');
    console.error('1. Ensure PostgreSQL is running');
    console.error('2. Check database connection settings in config/index.js');
    console.error('3. Verify the creators table exists (required for foreign key)');
    console.error('4. Check database user permissions');
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  runCallMigration();
}

module.exports = { runCallMigration };