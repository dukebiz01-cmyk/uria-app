import { z } from 'zod';

export const createSignalSchema = z.object({
  receiver_id: z.string().uuid('Invalid receiver ID'),
  message: z.string().max(50).optional(),
});

export const respondSignalSchema = z.object({
  action: z.enum(['accept', 'reject', 'hold']),
});

export const signalListQuerySchema = z.object({
  direction: z.enum(['sent', 'received', 'inbox', 'outbox']).default('received'),
  status: z.enum(['pending', 'accepted', 'rejected', 'held', 'expired', 'cancelled']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(50).default(20),
});

export const signalIdParamSchema = z.object({ id: z.string().uuid('Invalid signal ID') });
