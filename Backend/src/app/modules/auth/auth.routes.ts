// src/app/modules/auth/auth.routes.ts
import { Router } from 'express';
import { authController } from './auth.controller';
import validateRequest from '../../middlewares/validateRequest';
import { phoneSchema, otpSchema } from './auth.validation';
import { otpRequestLimiter } from '../../middlewares/rateLimit.middleware';

const router = Router();

router.post(
  '/send-otp',
  validateRequest(phoneSchema),
  otpRequestLimiter,
  authController.sendOTP
);

router.post(
  '/verify-otp',
  validateRequest(otpSchema),
  authController.verifyOTP
);

export const AuthRoutes = router;