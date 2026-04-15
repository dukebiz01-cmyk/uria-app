import { z } from 'zod';

export const createMomentSchema = z.object({
  signal_id: z.string().uuid('Invalid signal ID'),
});

export const checkinSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy_m: z.number().positive().max(10000),
});

export const reviewSchema = z.object({
  reviewee_id: z.string().uuid('Invalid reviewee ID'),
  eval_safe: z.boolean().optional(),
  eval_profile_match: z.boolean().optional(),
  eval_promise: z.boolean().optional(),
  eval_again: z.boolean().optional(),
});

export const momentIdParamSchema = z.object({
  id: z.string().uuid('Invalid moment ID'),
});
