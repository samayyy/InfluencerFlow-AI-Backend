// middlewares/auth/jwtAuthMiddleware.js
const authService = require('../../services/auth/authService')
const __constants = require('../../config/constants')

class JWTAuthMiddleware {
  // Extract token from request headers
  extractToken (req) {
    const authHeader = req.headers.authorization

    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7)
    }

    // Also check cookies for token
    if (req.cookies && req.cookies.accessToken) {
      return req.cookies.accessToken
    }

    return null
  }

  // Authenticate user with JWT
  authenticate (options = {}) {
    const { required = true, allowedRoles = [] } = options

    return async (req, res, next) => {
      try {
        const token = this.extractToken(req)

        if (!token) {
          if (!required) {
            req.user = null
            return next()
          }

          return res.sendJson({
            type: __constants.RESPONSE_MESSAGES.NOT_AUTHORIZED,
            err: 'Access token is required'
          })
        }

        // Verify token
        const verification = authService.verifyAccessToken(token)

        if (!verification.valid) {
          return res.sendJson({
            type: __constants.RESPONSE_MESSAGES.NOT_AUTHORIZED,
            err: 'Invalid or expired access token'
          })
        }

        // Get fresh user data
        const user = await authService.getUserById(verification.decoded.id)

        if (!user) {
          return res.sendJson({
            type: __constants.RESPONSE_MESSAGES.NOT_AUTHORIZED,
            err: 'User not found'
          })
        }

        if (user.status !== 'active') {
          return res.sendJson({
            type: __constants.RESPONSE_MESSAGES.ACCESS_DENIED,
            err: `Account is ${user.status}`
          })
        }

        // Check role permissions
        if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
          return res.sendJson({
            type: __constants.RESPONSE_MESSAGES.ACCESS_DENIED,
            err: 'Insufficient permissions for this resource'
          })
        }

        // Attach user to request
        req.user = user
        req.auth = {
          userId: user.id,
          userRole: user.role,
          tokenPayload: verification.decoded
        }

        next()
      } catch (error) {
        console.error('Authentication error:', error)
        return res.sendJson({
          type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
          err: 'Authentication failed'
        })
      }
    }
  }

  // Admin only access
  requireAdmin () {
    return this.authenticate({ required: true, allowedRoles: ['admin'] })
  }

  // Brand/Agency access (includes admin)
  requireBrand () {
    return this.authenticate({
      required: true,
      allowedRoles: ['admin', 'brand', 'agency']
    })
  }

  // Any authenticated user
  requireAuth () {
    return this.authenticate({ required: true })
  }

  // Optional authentication (user may or may not be logged in)
  optionalAuth () {
    return this.authenticate({ required: false })
  }

  // Check if user owns resource or is admin
  requireOwnership (getResourceOwnerId) {
    return async (req, res, next) => {
      try {
        if (!req.user) {
          return res.sendJson({
            type: __constants.RESPONSE_MESSAGES.NOT_AUTHORIZED,
            err: 'Authentication required'
          })
        }

        // Admin can access everything
        if (req.user.role === 'admin') {
          return next()
        }

        const resourceOwnerId = await getResourceOwnerId(req)

        if (req.user.id !== resourceOwnerId) {
          return res.sendJson({
            type: __constants.RESPONSE_MESSAGES.ACCESS_DENIED,
            err: 'You can only access your own resources'
          })
        }

        next()
      } catch (error) {
        console.error('Ownership check error:', error)
        return res.sendJson({
          type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
          err: 'Access verification failed'
        })
      }
    }
  }

  // Check brand ownership for brand-specific resources
  requireBrandOwnership (getBrandOwnerId) {
    return async (req, res, next) => {
      try {
        if (!req.user) {
          return res.sendJson({
            type: __constants.RESPONSE_MESSAGES.NOT_AUTHORIZED,
            err: 'Authentication required'
          })
        }

        // Admin can access everything
        if (req.user.role === 'admin') {
          return next()
        }

        const brandOwnerId = await getBrandOwnerId(req)

        if (req.user.id !== brandOwnerId) {
          return res.sendJson({
            type: __constants.RESPONSE_MESSAGES.ACCESS_DENIED,
            err: 'You can only access your own brand resources'
          })
        }

        next()
      } catch (error) {
        console.error('Brand ownership check error:', error)
        return res.sendJson({
          type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
          err: 'Brand access verification failed'
        })
      }
    }
  }

  // Rate limiting middleware
  rateLimit (options = {}) {
    const { maxRequests = 100, windowMinutes = 15, skipAuth = false } = options

    return async (req, res, next) => {
      try {
        const identifier = skipAuth ? req.ip : req.user?.id || req.ip

        // This would integrate with Redis for production rate limiting
        // For now, just pass through
        next()
      } catch (error) {
        console.error('Rate limiting error:', error)
        next() // Don't block on rate limiting errors
      }
    }
  }

  // Security headers middleware
  securityHeaders () {
    return (req, res, next) => {
      // Set security headers
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.setHeader('X-Frame-Options', 'DENY')
      res.setHeader('X-XSS-Protection', '1; mode=block')
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')

      // Don't cache sensitive endpoints
      if (req.path.includes('/api/auth') || req.path.includes('/api/admin')) {
        res.setHeader(
          'Cache-Control',
          'no-store, no-cache, must-revalidate, proxy-revalidate'
        )
        res.setHeader('Pragma', 'no-cache')
        res.setHeader('Expires', '0')
      }

      next()
    }
  }

  // CORS for specific origins
  corsForAuth () {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://influncer-flow-ai-ui.sachai.io',
      process.env.FRONTEND_URL
    ].filter(Boolean)

    return (req, res, next) => {
      const origin = req.headers.origin

      if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin)
      }

      res.setHeader('Access-Control-Allow-Credentials', 'true')
      res.setHeader(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, DELETE, OPTIONS'
      )
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Requested-With'
      )

      if (req.method === 'OPTIONS') {
        return res.status(200).end()
      }

      next()
    }
  }

  // Audit logging for sensitive operations
  auditLog (action) {
    return (req, res, next) => {
      // Log the action with user details
      const auditData = {
        action,
        userId: req.user?.id,
        userEmail: req.user?.email,
        userRole: req.user?.role,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString(),
        path: req.originalUrl,
        method: req.method,
        body: req.method !== 'GET' ? req.body : null
      }

      console.log('AUDIT LOG:', JSON.stringify(auditData))

      // In production, this would be sent to a secure logging service
      // or stored in a dedicated audit table

      next()
    }
  }

  // Validate API key for external integrations
  validateApiKey () {
    return async (req, res, next) => {
      try {
        const apiKey = req.headers['x-api-key']

        if (!apiKey) {
          return res.sendJson({
            type: __constants.RESPONSE_MESSAGES.NOT_AUTHORIZED,
            err: 'API key is required'
          })
        }

        // Validate API key (this would check against a database)
        // For now, just check against environment variable
        if (apiKey !== process.env.INTERNAL_API_KEY) {
          return res.sendJson({
            type: __constants.RESPONSE_MESSAGES.NOT_AUTHORIZED,
            err: 'Invalid API key'
          })
        }

        req.apiAuth = true
        next()
      } catch (error) {
        console.error('API key validation error:', error)
        return res.sendJson({
          type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
          err: 'API key validation failed'
        })
      }
    }
  }
}

module.exports = new JWTAuthMiddleware()
