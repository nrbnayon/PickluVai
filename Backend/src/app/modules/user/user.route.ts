import express from 'express';
import { UserController } from './user.controller';
import auth, { setRefreshedTokenCookie } from '../../middlewares/auth';
import validateRequest from '../../middlewares/validateRequest';
import { UserValidation } from './user.validation';
import { USER_ROLES } from '../../../enums/common';
import passport from '../../../config/passport';
import {
  apiLimiter,
  authLimiter,
} from '../../middlewares/rateLimit.middleware';
import config from '../../../config';

const router = express.Router();

// OAuth Routes
router.get(
  '/google/login',
  passport.authenticate('google', {
    scope: [
      'profile',
      'email',
      'https://www.googleapis.com/auth/gmail.readonly',
    ],
    session: false, // Using stateless JWT auth
    accessType: 'offline',
    prompt: 'consent',
  })
);

router.get(
  '/google/callback',
  passport.authenticate('google', {
    failureRedirect: `${config.frontend.url}/login?error=Google authentication failed`,
    session: false,
  }),
  UserController.googleCallback
);

router.get(
  '/microsoft/login',
  passport.authenticate('microsoft', {
    scope: ['user.read', 'Mail.Read'],
    session: false,
  })
);

router.get(
  '/microsoft/callback',
  passport.authenticate('microsoft', {
    failureRedirect: `${config.frontend.url}/login?error=Microsoft authentication failed`,
    session: false,
  }),
  UserController.microsoftCallback
);

// Yahoo OAuth
router.get('/yahoo/login', UserController.yahooLogin);
router.get('/yahoo/callback', UserController.yahooCallback);

// Local Authentication Routes
router.post(
  '/login',
  authLimiter,
  validateRequest(UserValidation.loginZodSchema),
  UserController.localLogin
);

router.post(
  '/refresh-token',
  validateRequest(UserValidation.refreshTokenZodSchema),
  UserController.refreshToken
);

router.post(
  '/logout',
  auth(),
  setRefreshedTokenCookie,
  apiLimiter,
  UserController.logout
);

// Protected Routes
router.get(
  '/me',
  auth(USER_ROLES.USER, USER_ROLES.ADMIN),
  setRefreshedTokenCookie, // Add the middleware to set refreshed token cookies
  apiLimiter,
  UserController.getCurrentUser
);

router.patch(
  '/profile',
  auth(USER_ROLES.USER, USER_ROLES.ADMIN),
  setRefreshedTokenCookie,
  apiLimiter,
  validateRequest(UserValidation.updateProfileSchema),
  UserController.updateProfile
);

router.patch(
  '/subscription',
  auth(USER_ROLES.USER),
  setRefreshedTokenCookie,
  apiLimiter,
  validateRequest(UserValidation.updateSubscriptionSchema),
  UserController.updateSubscription
);

export const UserRoutes = router;
