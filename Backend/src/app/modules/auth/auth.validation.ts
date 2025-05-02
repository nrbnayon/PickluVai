// src\app\modules\auth\auth.validation.ts
import { z } from 'zod';

export const phoneSchema = z.object({
  body: z.object({
    phoneNumber: z.string().refine(val => /^(\+880|\+91)\d{9,10}$/.test(val), {
      message: 'Invalid Bangladesh (+880) or Indian (+91) phone number',
    }),
  }),
});

export const otpSchema = z.object({
  body: z.object({
    sessionInfo: z.string().min(1, 'Session info is required'),
    code: z.string().length(6, 'OTP must be 6 digits'),
  }),
});

export default { phoneSchema, otpSchema };