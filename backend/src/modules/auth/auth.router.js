import { Router } from 'express';
import { validateBody } from '../../middleware/validate.js';
import { authRateLimiter } from '../../middleware/rateLimiter.js';
import { authenticate } from '../../middleware/auth.js';
import asyncHandler from '../../utils/asyncHandler.js';
import {
  requestOtpSchema,
  verifyOtpSchema,
  refreshTokenSchema,
  logoutSchema,
} from './auth.schema.js';
import * as authService from './auth.service.js';

const router = Router();

/**
 * POST /api/auth/request-otp
 * Send OTP to phone number (via KMC PASS in production)
 */
router.post(
  '/request-otp',
  authRateLimiter,
  validateBody(requestOtpSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.requestOtp(req.body.phone);
    res.json(result);
  }),
);

/**
 * POST /api/auth/verify-otp
 * Verify OTP and issue JWT tokens
 */
router.post(
  '/verify-otp',
  authRateLimiter,
  validateBody(verifyOtpSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.verifyOtp(req.body);
    const statusCode = result.is_new_user ? 201 : 200;
    res.status(statusCode).json(result);
  }),
);

/**
 * POST /api/auth/refresh
 * Exchange refresh token for new access token
 */
router.post(
  '/refresh',
  validateBody(refreshTokenSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.refreshAccessToken(req.body.refresh_token);
    res.json(result);
  }),
);

/**
 * POST /api/auth/logout
 * Invalidate refresh token
 */
router.post(
  '/logout',
  authenticate,
  validateBody(logoutSchema),
  asyncHandler(async (req, res) => {
    const accessToken = req.headers.authorization?.slice(7);
    await authService.logout(req.body.refresh_token, accessToken);
    res.status(204).send();
  }),
);

export default router;
