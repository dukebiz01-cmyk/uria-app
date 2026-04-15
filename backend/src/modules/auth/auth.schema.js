import { z } from 'zod';

export const requestOtpSchema = z.object({
  phone: z.string().regex(/^01[0-9]{8,9}$/, 'Invalid Korean phone number').min(10).max(11),
});

export const verifyOtpSchema = z.object({
  phone: z.string().regex(/^01[0-9]{8,9}$/, 'Invalid Korean phone number'),
  otp: z.string().length(6).regex(/^\d{6}$/).optional(),
  code: z.string().length(6).regex(/^\d{6}$/).optional(),
  gender: z.enum(['M', 'F']).optional(),
  birth_year: z.number().int().min(1950).max(new Date().getFullYear() - 19).optional(),
  nickname: z.string().min(2).max(20).optional(),
}).superRefine((data, ctx) => {
  if (!data.otp && !data.code) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['otp'], message: 'OTP or code is required' });
  }
}).transform((data) => ({ ...data, otp: data.otp || data.code }));

export const refreshTokenSchema = z.object({
  refresh_token: z.string().optional(),
  refreshToken: z.string().optional(),
}).superRefine((data, ctx) => {
  if (!data.refresh_token && !data.refreshToken) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['refresh_token'], message: 'refresh token is required' });
  }
}).transform((data) => ({ refresh_token: data.refresh_token || data.refreshToken }));

export const logoutSchema = z.object({
  refresh_token: z.string().optional(),
  refreshToken: z.string().optional(),
}).superRefine((data, ctx) => {
  if (!data.refresh_token && !data.refreshToken) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['refresh_token'], message: 'refresh token is required' });
  }
}).transform((data) => ({ refresh_token: data.refresh_token || data.refreshToken }));
