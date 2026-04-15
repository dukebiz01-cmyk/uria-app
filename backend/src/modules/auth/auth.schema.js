import { z } from 'zod';

export const requestOtpSchema = z.object({
  phone: z
    .string()
    .regex(/^01[0-9]{8,9}$/, 'Invalid Korean phone number (e.g. 01012345678)')
    .min(10)
    .max(11),
});

export const verifyOtpSchema = z.object({
  phone: z
    .string()
    .regex(/^01[0-9]{8,9}$/, 'Invalid Korean phone number'),
  otp: z.string().length(6, 'OTP must be 6 digits').regex(/^\d{6}$/, 'OTP must be numeric'),
  // Registration fields (required for new users)
  gender: z.enum(['M', 'F']).optional(),
  birth_year: z
    .number()
    .int()
    .min(1950)
    .max(new Date().getFullYear() - 19)
    .optional(),
  nickname: z.string().min(2).max(20).optional(),
});

export const refreshTokenSchema = z.object({
  refresh_token: z.string().min(1),
});

export const logoutSchema = z.object({
  refresh_token: z.string().min(1),
});
