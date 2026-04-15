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
const messagesQuery = z.object({ cursor: z.string().optional(), limit: z.coerce.number().min(1).max(50).default(30) });

router.get('/rooms', asyncHandler(async (req, res) => {
  res.json({ data: await chatService.getRooms(req.user.id) });
}));

router.get('/rooms/:id/messages', validate({ params: roomIdParam, query: messagesQuery }), asyncHandler(async (req, res) => {
  res.json({ data: await chatService.getRoomMessages(req.user.id, req.params.id, req.query) });
}));

router.post('/rooms/:id/messages', validate({ params: roomIdParam, body: messageBody }), asyncHandler(async (req, res) => {
  res.status(201).json({ data: await chatService.sendMessage(req.user.id, req.params.id, req.body.content) });
}));

export default router;
