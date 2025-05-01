// src\app\modules\user\user.validation.ts
import { z } from 'zod';
import { USER_GENDER, USER_PLAN } from '../../../enums/common';

const emailSchema = z
  .string({ required_error: 'Email is required' })
  .email()
  .min(5)
  .max(255)
  .transform(val => val.toLowerCase().trim());

const passwordSchema = z
  .string({ required_error: 'Password is required' })
  .min(6)
  .max(100);

const nameSchema = z
  .string({ required_error: 'Name is required' })
  .min(2)
  .max(100)
  .trim();

const phoneSchema = z
  .string()
  .regex(/^\+?[1-9]\d{1,14}$/)
  .optional();

const addressSchema = z.string().max(500).optional();
const countrySchema = z.string().min(2).max(100).optional();
const dateSchema = z
  .string()
  .refine(val => !isNaN(Date.parse(val)), { message: 'Invalid date' })
  .transform(val => new Date(val))
  .optional();

const oauthLoginSchema = z.object({
  body: z.object({
    code: z.string({ required_error: 'Authorization code is required' }),
  }),
});

const loginZodSchema = z.object({
  body: z.object({
    email: emailSchema,
    password: passwordSchema,
  }),
});

const refreshTokenZodSchema = z.object({
  body: z.object({
    refreshToken: z.string({ required_error: 'Refresh token is required' }),
  }),
});

const updateProfileSchema = z.object({
  body: z
    .object({
      name: nameSchema.optional(),
      phone: phoneSchema,
      address: addressSchema,
      country: countrySchema,
      gender: z
        .enum(Object.values(USER_GENDER) as [string, ...string[]])
        .optional(),
      dateOfBirth: dateSchema,
    })
    .strict(),
});

const updateSubscriptionSchema = z.object({
  body: z
    .object({
      plan: z.enum(Object.values(USER_PLAN) as [string, ...string[]]),
      autoRenew: z.boolean().optional(),
    })
    .strict(),
});

export const UserValidation = {
  oauthLoginSchema,
  loginZodSchema,
  refreshTokenZodSchema,
  updateProfileSchema,
  updateSubscriptionSchema,
};
