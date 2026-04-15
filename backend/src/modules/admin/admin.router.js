import { Router } from 'express';
import { z } from 'zod';
import { adminAuth } from '../../middleware/adminAuth.js';
import { validate, validateBody, validateParams } from '../../middleware/validate.js';
import asyncHandler from '../../utils/asyncHandler.js';
import * as adminService from './admin.service.js';

const router = Router();

// All admin routes require admin auth
router.use(adminAuth);

const paginationQuery = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  status: z.string().optional(),
});

const userIdParam = z.object({ id: z.string().uuid() });

/**
 * GET /api/admin/users
 * List all users with optional status filter
 */
router.get(
  '/users',
  validate({ query: paginationQuery }),
  asyncHandler(async (req, res) => {
    const result = await adminService.listUsers(req.query);
    res.json(result);
  }),
);

/**
 * PATCH /api/admin/users/:id/status
 * Update user status
 */
router.patch(
  '/users/:id/status',
  validateParams(userIdParam),
  validateBody(z.object({
    status: z.enum(['active', 'resting', 'suspended', 'banned']),
    reason: z.string().max(500).optional(),
  })),
  asyncHandler(async (req, res) => {
    // Use a system admin ID (or extract from JWT if admin has full auth)
    const result = await adminService.updateUserStatus('system', req.params.id, req.body);
    res.json({ user: result });
  }),
);

/**
 * GET /api/admin/reports
 * List reports with optional status filter
 */
router.get(
  '/reports',
  validate({ query: paginationQuery }),
  asyncHandler(async (req, res) => {
    const result = await adminService.getReports(req.query);
    res.json(result);
  }),
);

/**
 * POST /api/admin/moderation
 * Apply a moderation action
 */
router.post(
  '/moderation',
  validateBody(z.object({
    target_id: z.string().uuid(),
    action_type: z.enum(['warn', 'suspend', 'ban', 'unsuspend', 'refund', 'adjust_score']),
    reason: z.string().max(500).optional(),
    payload: z.record(z.unknown()).optional(),
  })),
  asyncHandler(async (req, res) => {
    const result = await adminService.moderateUser('system', req.body);
    res.json(result);
  }),
);

/**
 * GET /api/admin/ledger/:userId
 * View wallet ledger for a user
 */
router.get(
  '/ledger/:userId',
  validateParams(z.object({ userId: z.string().uuid() })),
  validate({ query: paginationQuery }),
  asyncHandler(async (req, res) => {
    const entries = await adminService.getUserLedger(req.params.userId, req.query);
    res.json({ entries });
  }),
);

export default router;
