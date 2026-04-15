import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { apiRateLimiter } from '../../middleware/rateLimiter.js';
import asyncHandler from '../../utils/asyncHandler.js';
import * as chatService from './chat.service.js';

const router = Router();

router.use(authenticate);
router.use(apiRateLimiter);

const roomIdParam = z.object({ id: z.string().uuid() });
const messageBody = z.object({ content: z.string().min(1).max(1000) });
const messagesQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(50).default(30),
});

/**
 * GET /api/chat/rooms
 * List all chat rooms for the authenticated user
 */
router.get(
  '/rooms',
  asyncHandler(async (req, res) => {
    const rooms = await chatService.getRooms(req.user.id);
    res.json({ rooms });
  }),
);

/**
 * GET /api/chat/rooms/:id/messages
 * Get messages for a chat room (cursor paginated)
 */
router.get(
  '/rooms/:id/messages',
  validate({ params: roomIdParam, query: messagesQuery }),
  asyncHandler(async (req, res) => {
    const result = await chatService.getRoomMessages(
      req.user.id,
      req.params.id,
      req.query,
    );
    res.json(result);
  }),
);

/**
 * POST /api/chat/rooms/:id/messages
 * Send a message via REST (fallback from WebSocket)
 */
router.post(
  '/rooms/:id/messages',
  validate({ params: roomIdParam, body: messageBody }),
  asyncHandler(async (req, res) => {
    const message = await chatService.sendMessage(
      req.user.id,
      req.params.id,
      req.body.content,
    );
    res.status(201).json({ message });
  }),
);

export default router;
