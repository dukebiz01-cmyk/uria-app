import { Router } from 'express';
import { validateBody } from '../../middleware/validate.js';
import { authRateLimiter } from '../../middleware/rateLimiter.js';
import { authenticate } from '../../middleware/auth.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { requestOtpSchema, verifyOtpSchema, refreshTokenSchema, logoutSchema } from './auth.schema.js';
import * as authService from './auth.service.js';

const router = Router();

const requestOtpHandler = asyncHandler(async (req, res) => {
  const result = await authService.requestOtp(req.body.phone);
  res.json({ data: result });
});

const verifyOtpHandler = asyncHandler(async (req, res) => {
  const result = await authService.verifyOtp(req.body);
  const statusCode = result.is_new_user ? 201 : 200;
  res.status(statusCode).json({ data: result });
});

router.post('/request-otp', authRateLimiter, validateBody(requestOtpSchema), requestOtpHandler);
router.post('/otp/request', authRateLimiter, validateBody(requestOtpSchema), requestOtpHandler);

router.post('/verify-otp', authRateLimiter, validateBody(verifyOtpSchema), verifyOtpHandler);
router.post('/otp/verify', authRateLimiter, validateBody(verifyOtpSchema), verifyOtpHandler);

router.post('/refresh', validateBody(refreshTokenSchema), asyncHandler(async (req, res) => {
  const result = await authService.refreshAccessToken(req.body.refresh_token);
  res.json({ data: result });
}));

router.post('/logout', authenticate, validateBody(logoutSchema), asyncHandler(async (req, res) => {
  const accessToken = req.headers.authorization?.slice(7);
  await authService.logout(req.body.refresh_token, accessToken);
  res.status(204).send();
}));

export default router;
