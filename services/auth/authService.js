// services/auth/authService.js
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const __config = require('../../config');

class AuthService {
  constructor() {
    this.pool = new Pool({
      user: __config.postgres.user,
      host: __config.postgres.host,
      database: __config.postgres.database,
      password: __config.postgres.password,
      port: __config.postgres.port,
      ssl: { rejectUnauthorized: false },
    });

    this.jwtSecret = process.env.JWT_SECRET || __config.authentication.jwtSecretKey;
    this.jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || __config.authentication.jwtSecretKey + '_refresh';
    this.accessTokenExpiry = process.env.JWT_ACCESS_EXPIRY || '15m';
    this.refreshTokenExpiry = process.env.JWT_REFRESH_EXPIRY || '7d';
  }

  // Generate JWT tokens
  generateTokens(user) {
    const payload = {
      id: user.id,
      email: user.email,
      role: user.role,
      first_name: user.first_name,
      last_name: user.last_name,
      status: user.status
    };

    const accessToken = jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.accessTokenExpiry,
      issuer: 'influencerflow-api',
      audience: 'influencerflow-client'
    });

    const refreshToken = jwt.sign(
      { id: user.id, type: 'refresh' },
      this.jwtRefreshSecret,
      {
        expiresIn: this.refreshTokenExpiry,
        issuer: 'influencerflow-api',
        audience: 'influencerflow-client'
      }
    );

    return { accessToken, refreshToken };
  }

  // Verify JWT token
  verifyAccessToken(token) {
    try {
      const decoded = jwt.verify(token, this.jwtSecret, {
        issuer: 'influencerflow-api',
        audience: 'influencerflow-client'
      });
      return { valid: true, decoded };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  // Verify refresh token
  verifyRefreshToken(token) {
    try {
      const decoded = jwt.verify(token, this.jwtRefreshSecret, {
        issuer: 'influencerflow-api',
        audience: 'influencerflow-client'
      });
      return { valid: true, decoded };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  // Create or update user from Google OAuth data
  async createOrUpdateGoogleUser(googleProfile, deviceInfo = {}) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      const { id: googleId, email, given_name, family_name, picture } = googleProfile;

      // Check if user exists
      let userQuery = 'SELECT * FROM users WHERE google_id = $1 OR email = $2';
      let userResult = await client.query(userQuery, [googleId, email]);

      let user;

      if (userResult.rows.length > 0) {
        // Update existing user
        user = userResult.rows[0];
        
        const updateQuery = `
          UPDATE users 
          SET google_id = $1, first_name = $2, last_name = $3, 
              profile_picture_url = $4, last_login_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $5 
          RETURNING *
        `;
        
        const updateResult = await client.query(updateQuery, [
          googleId, given_name, family_name, picture, user.id
        ]);
        
        user = updateResult.rows[0];
      } else {
        // Create new user
        const insertQuery = `
          INSERT INTO users (google_id, email, first_name, last_name, profile_picture_url, 
                           role, status, email_verified, last_login_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
          RETURNING *
        `;
        
        const insertResult = await client.query(insertQuery, [
          googleId, email, given_name, family_name, picture, 
          'brand', 'active', true
        ]);
        
        user = insertResult.rows[0];
      }

      await client.query('COMMIT');
      return user;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Store refresh token session
  async storeRefreshTokenSession(userId, refreshToken, deviceInfo = {}) {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const query = `
      INSERT INTO user_sessions (user_id, refresh_token_hash, device_info, 
                               ip_address, user_agent, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `;

    const result = await this.pool.query(query, [
      userId,
      tokenHash,
      JSON.stringify(deviceInfo),
      deviceInfo.ip_address || null,
      deviceInfo.user_agent || null,
      expiresAt
    ]);

    return result.rows[0].id;
  }

  // Validate refresh token session
  async validateRefreshTokenSession(refreshToken) {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    
    const query = `
      SELECT us.*, u.* 
      FROM user_sessions us
      JOIN users u ON us.user_id = u.id
      WHERE us.refresh_token_hash = $1 
        AND us.is_active = true 
        AND us.expires_at > CURRENT_TIMESTAMP
    `;

    const result = await this.pool.query(query, [tokenHash]);
    return result.rows[0] || null;
  }

  // Refresh access token
  async refreshAccessToken(refreshToken) {
    const tokenVerification = this.verifyRefreshToken(refreshToken);
    
    if (!tokenVerification.valid) {
      throw new Error('Invalid refresh token');
    }

    const session = await this.validateRefreshTokenSession(refreshToken);
    
    if (!session) {
      throw new Error('Refresh token session not found or expired');
    }

    // Generate new access token
    const user = {
      id: session.id,
      email: session.email,
      role: session.role,
      first_name: session.first_name,
      last_name: session.last_name,
      status: session.status
    };

    const { accessToken } = this.generateTokens(user);
    
    return { accessToken, user };
  }

  // Invalidate refresh token
  async invalidateRefreshToken(refreshToken) {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    
    const query = `
      UPDATE user_sessions 
      SET is_active = false 
      WHERE refresh_token_hash = $1
    `;

    await this.pool.query(query, [tokenHash]);
  }

  // Invalidate all user sessions
  async invalidateAllUserSessions(userId) {
    const query = `
      UPDATE user_sessions 
      SET is_active = false 
      WHERE user_id = $1
    `;

    await this.pool.query(query, [userId]);
  }

  // Get user by ID
  async getUserById(userId) {
    const query = 'SELECT * FROM users WHERE id = $1 AND status != $2';
    const result = await this.pool.query(query, [userId, 'suspended']);
    return result.rows[0] || null;
  }

  // Get user sessions
  async getUserSessions(userId) {
    const query = `
      SELECT id, device_info, ip_address, user_agent, expires_at, 
             is_active, created_at
      FROM user_sessions 
      WHERE user_id = $1 AND is_active = true
      ORDER BY created_at DESC
    `;

    const result = await this.pool.query(query, [userId]);
    return result.rows;
  }

  // Clean expired sessions
  async cleanExpiredSessions() {
    const query = `
      DELETE FROM user_sessions 
      WHERE expires_at < CURRENT_TIMESTAMP OR is_active = false
    `;

    const result = await this.pool.query(query);
    return result.rowCount;
  }

  // Update user role (admin only)
  async updateUserRole(userId, newRole, adminUserId) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Verify admin permissions
      const adminQuery = 'SELECT role FROM users WHERE id = $1';
      const adminResult = await client.query(adminQuery, [adminUserId]);
      
      if (!adminResult.rows[0] || adminResult.rows[0].role !== 'admin') {
        throw new Error('Insufficient permissions');
      }

      // Update user role
      const updateQuery = `
        UPDATE users 
        SET role = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `;
      
      const result = await client.query(updateQuery, [newRole, userId]);
      
      if (result.rows.length === 0) {
        throw new Error('User not found');
      }

      await client.query('COMMIT');
      return result.rows[0];

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Get user profile with brand info if applicable
  async getUserProfile(userId) {
    const query = `
      SELECT u.*, b.id as brand_id, b.brand_name, b.brand_slug, 
             b.website_url, b.industry, b.verification_status as brand_verification
      FROM users u
      LEFT JOIN brands b ON u.id = b.user_id AND b.is_active = true
      WHERE u.id = $1
    `;

    const result = await this.pool.query(query, [userId]);
    return result.rows[0] || null;
  }

  // Password utilities (for future non-OAuth users)
  async hashPassword(password) {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
  }

  async verifyPassword(password, hashedPassword) {
    return await bcrypt.compare(password, hashedPassword);
  }

  // Rate limiting helpers
  async checkLoginAttempts(identifier, maxAttempts = 5, windowMinutes = 15) {
    const cacheKey = `login_attempts:${identifier}`;
    // This would integrate with Redis if available
    // For now, return true (no rate limiting)
    return { allowed: true, attemptsLeft: maxAttempts };
  }

  // Security helpers
  generateSecureToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}

module.exports = new AuthService();
