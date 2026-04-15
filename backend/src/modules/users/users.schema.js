import { z } from 'zod';

export const updateProfileSchema = z.object({
  nickname: z.string().min(2).max(20).optional(),
  bio: z.string().max(300).optional(),
}).strict();

export const updateLocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy_m: z.number().positive().max(10000).optional(),
});

export const userListQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radius_km: z.coerce.number().min(1).max(50).default(10),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(50).default(20),
});

export const userIdParamSchema = z.object({
  id: z.string().uuid('Invalid user ID'),
});
