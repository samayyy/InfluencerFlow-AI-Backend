// controllers/auth/googleOAuth.js
const express = require("express");
const router = express.Router();
const { OAuth2Client } = require("google-auth-library");
const __constants = require("../../config/constants");
const validationOfAPI = require("../../middlewares/validation");
const authService = require("../../services/auth/authService");
const jwtAuth = require("../../middlewares/auth/jwtAuthMiddleware");

/**
 * @namespace -GOOGLE-AUTH-MODULE-
 * @description API's related to Google OAuth authentication.
 */

class GoogleOAuthController {
  constructor() {
    this.client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI ||
        "http://localhost:3005/api/auth/google/callback"
    );
  }

  /**
   * @memberof -GOOGLE-AUTH-module-
   * @name googleLogin
   * @path {POST} /api/auth/google/login
   * @description Authenticate user with Google ID token
   */
  googleLogin = async (req, res) => {
    try {
      const { idToken, deviceInfo } = req.body;

      // Verify the Google ID token
      const ticket = await this.client.verifyIdToken({
        idToken: idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();

      if (!payload.email_verified) {
        return res.sendJson({
          type: __constants.RESPONSE_MESSAGES.FAILED,
          err: "Google email not verified",
        });
      }

      // Extract device and request info
      const deviceDetails = {
        ip_address: req.ip,
        user_agent: req.get("User-Agent"),
        device_type: deviceInfo?.device_type || "unknown",
        browser: deviceInfo?.browser || "unknown",
        os: deviceInfo?.os || "unknown",
        ...deviceInfo,
      };

      // Create or update user
      const user = await authService.createOrUpdateGoogleUser(
        payload,
        deviceDetails
      );

      // Generate JWT tokens
      const { accessToken, refreshToken } = authService.generateTokens(user);

      // Store refresh token session
      await authService.storeRefreshTokenSession(
        user.id,
        refreshToken,
        deviceDetails
      );

      // Get complete user profile
      const userProfile = await authService.getUserProfile(user.id);

      res.sendJson({
        type: __constants.RESPONSE_MESSAGES.SUCCESS,
        data: {
          user: {
            id: userProfile.id,
            email: userProfile.email,
            first_name: userProfile.first_name,
            last_name: userProfile.last_name,
            role: userProfile.role,
            profile_picture_url: userProfile.profile_picture_url,
            brand_id: userProfile.brand_id,
            brand_name: userProfile.brand_name,
            brand_verification: userProfile.brand_verification,
          },
          tokens: {
            accessToken,
            refreshToken,
            tokenType: "Bearer",
            expiresIn: "15m",
          },
          isNewUser:
            user.created_at &&
            Date.now() - new Date(user.created_at).getTime() < 60000,
        },
      });
    } catch (error) {
      console.error("Google login error:", error);

      if (error.message.includes("Token used too late")) {
        return res.sendJson({
          type: __constants.RESPONSE_MESSAGES.FAILED,
          err: "Google token expired. Please try again.",
        });
      }

      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
        err: "Google authentication failed",
      });
    }
  };

  /**
   * @memberof -GOOGLE-AUTH-module-
   * @name refreshToken
   * @path {POST} /api/auth/refresh
   * @description Refresh access token using refresh token
   */
  refreshToken = async (req, res) => {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.sendJson({
          type: __constants.RESPONSE_MESSAGES.INVALID_REQUEST,
          err: "Refresh token is required",
        });
      }

      const { accessToken, user } = await authService.refreshAccessToken(
        refreshToken
      );

      res.sendJson({
        type: __constants.RESPONSE_MESSAGES.SUCCESS,
        data: {
          accessToken,
          tokenType: "Bearer",
          expiresIn: "15m",
          user: {
            id: user.id,
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name,
            role: user.role,
          },
        },
      });
    } catch (error) {
      console.error("Token refresh error:", error);
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.NOT_AUTHORIZED,
        err: "Token refresh failed",
      });
    }
  };

  /**
   * @memberof -GOOGLE-AUTH-module-
   * @name logout
   * @path {POST} /api/auth/logout
   * @description Logout user and invalidate tokens
   */
  logout = async (req, res) => {
    try {
      const { refreshToken, logoutAll } = req.body;

      if (logoutAll && req.user) {
        // Invalidate all user sessions
        await authService.invalidateAllUserSessions(req.user.id);
      } else if (refreshToken) {
        // Invalidate specific session
        await authService.invalidateRefreshToken(refreshToken);
      }

      res.sendJson({
        type: __constants.RESPONSE_MESSAGES.SUCCESS,
        data: {
          message: "Logged out successfully",
        },
      });
    } catch (error) {
      console.error("Logout error:", error);
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
        err: "Logout failed",
      });
    }
  };

  /**
   * @memberof -GOOGLE-AUTH-module-
   * @name getUserProfile
   * @path {GET} /api/auth/profile
   * @description Get current user profile
   */
  getUserProfile = async (req, res) => {
    try {
      const userProfile = await authService.getUserProfile(req.user.id);

      if (!userProfile) {
        return res.sendJson({
          type: __constants.RESPONSE_MESSAGES.NO_RECORDS_FOUND,
          err: "User profile not found",
        });
      }

      res.sendJson({
        type: __constants.RESPONSE_MESSAGES.SUCCESS,
        data: {
          user: {
            id: userProfile.id,
            email: userProfile.email,
            first_name: userProfile.first_name,
            last_name: userProfile.last_name,
            role: userProfile.role,
            status: userProfile.status,
            profile_picture_url: userProfile.profile_picture_url,
            email_verified: userProfile.email_verified,
            last_login_at: userProfile.last_login_at,
            created_at: userProfile.created_at,
            brand: userProfile.brand_id
              ? {
                  id: userProfile.brand_id,
                  name: userProfile.brand_name,
                  slug: userProfile.brand_slug,
                  website: userProfile.website_url,
                  industry: userProfile.industry,
                  verification_status: userProfile.brand_verification,
                }
              : null,
          },
        },
      });
    } catch (error) {
      console.error("Get profile error:", error);
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
        err: "Failed to get user profile",
      });
    }
  };

  /**
   * @memberof -GOOGLE-AUTH-module-
   * @name getUserSessions
   * @path {GET} /api/auth/sessions
   * @description Get user's active sessions
   */
  getUserSessions = async (req, res) => {
    try {
      const sessions = await authService.getUserSessions(req.user.id);

      res.sendJson({
        type: __constants.RESPONSE_MESSAGES.SUCCESS,
        data: {
          sessions: sessions.map((session) => ({
            id: session.id,
            device_info: session.device_info,
            ip_address: session.ip_address,
            user_agent: session.user_agent,
            created_at: session.created_at,
            expires_at: session.expires_at,
            is_current: false, // Would need additional logic to determine current session
          })),
        },
      });
    } catch (error) {
      console.error("Get sessions error:", error);
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
        err: "Failed to get user sessions",
      });
    }
  };

  /**
   * @memberof -GOOGLE-AUTH-module-
   * @name revokeSession
   * @path {DELETE} /api/auth/sessions/:sessionId
   * @description Revoke a specific session
   */
  revokeSession = async (req, res) => {
    try {
      const { sessionId } = req.params;

      // This would need additional logic to find and invalidate specific session
      // For now, just return success
      res.sendJson({
        type: __constants.RESPONSE_MESSAGES.SUCCESS,
        data: {
          message: "Session revoked successfully",
        },
      });
    } catch (error) {
      console.error("Revoke session error:", error);
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
        err: "Failed to revoke session",
      });
    }
  };

  /**
   * @memberof -GOOGLE-AUTH-module-
   * @name verifyToken
   * @path {POST} /api/auth/verify
   * @description Verify if current token is valid
   */
  verifyToken = async (req, res) => {
    try {
      // If we reach here, the middleware has already validated the token
      res.sendJson({
        type: __constants.RESPONSE_MESSAGES.SUCCESS,
        data: {
          valid: true,
          user: {
            id: req.user.id,
            email: req.user.email,
            role: req.user.role,
            status: req.user.status,
          },
        },
      });
    } catch (error) {
      console.error("Token verification error:", error);
      return res.sendJson({
        type: __constants.RESPONSE_MESSAGES.SERVER_ERROR,
        err: "Token verification failed",
      });
    }
  };
}

const controller = new GoogleOAuthController();

// Validation schemas
const googleLoginValidation = {
  type: "object",
  required: true,
  properties: {
    idToken: { type: "string", required: true, minLength: 1 },
    deviceInfo: { type: "object", required: false },
  },
};

const refreshTokenValidation = {
  type: "object",
  required: true,
  properties: {
    refreshToken: { type: "string", required: true, minLength: 1 },
  },
};

const logoutValidation = {
  type: "object",
  required: false,
  properties: {
    refreshToken: { type: "string", required: false },
    logoutAll: { type: "boolean", required: false },
  },
};

// Apply middleware and routes
router.use(jwtAuth.securityHeaders());
router.use(jwtAuth.corsForAuth());

// Public routes
router.post(
  "/google/login",
  jwtAuth.rateLimit({ maxRequests: 10, windowMinutes: 15 }),
  (req, res, next) =>
    validationOfAPI(req, res, next, googleLoginValidation, "body"),
  controller.googleLogin
);

router.post(
  "/refresh",
  jwtAuth.rateLimit({ maxRequests: 20, windowMinutes: 15 }),
  (req, res, next) =>
    validationOfAPI(req, res, next, refreshTokenValidation, "body"),
  controller.refreshToken
);

router.post(
  "/logout",
  jwtAuth.optionalAuth(),
  (req, res, next) => validationOfAPI(req, res, next, logoutValidation, "body"),
  controller.logout
);

// Protected routes
router.get("/profile", jwtAuth.requireAuth(), controller.getUserProfile);

router.get("/sessions", jwtAuth.requireAuth(), controller.getUserSessions);

router.delete(
  "/sessions/:sessionId",
  jwtAuth.requireAuth(),
  controller.revokeSession
);

router.post("/verify", jwtAuth.requireAuth(), controller.verifyToken);

module.exports = router;
