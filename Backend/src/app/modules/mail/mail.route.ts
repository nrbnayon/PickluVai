// src/app/modules/mail/mail.routes.ts
import express from 'express';
import { MailController } from './mail.controller';
import auth from '../../middlewares/auth';
import { USER_ROLES } from '../../../enums/common';
import { apiLimiter } from '../../middlewares/rateLimit.middleware';
import multer from 'multer';

const storage = multer.memoryStorage(); // Use memory storage for dynamic provider handling
const upload = multer({ storage });

const router = express.Router();

// Email Access Routes
router.get(
  '/emails',
  auth(USER_ROLES.USER),
  apiLimiter,
  MailController.fetchEmails
);
router.post(
  '/emails',
  auth(USER_ROLES.USER),
  apiLimiter,
  upload.array('attachments'),
  MailController.sendEmail
);
router.get(
  '/emails/:id',
  auth(USER_ROLES.USER),
  apiLimiter,
  MailController.readEmail
);
router.post(
  '/emails/:id/trash',
  auth(USER_ROLES.USER),
  apiLimiter,
  MailController.trashEmail
);
router.post(
  '/emails/:id/archive',
  auth(USER_ROLES.USER),
  apiLimiter,
  MailController.archiveEmail
);
router.post(
  '/emails/:id/reply',
  auth(USER_ROLES.USER),
  apiLimiter,
  upload.array('attachments'),
  MailController.replyToEmail
);
router.get(
  '/emails/search',
  auth(USER_ROLES.USER),
  apiLimiter,
  MailController.searchEmails
);
router.post(
  '/emails/:id/markRead',
  auth(USER_ROLES.USER),
  apiLimiter,
  MailController.markEmailAsRead
);
router.get(
  '/emails/:id/open',
  auth(USER_ROLES.USER),
  apiLimiter,
  MailController.openEmail
);

// MCP Server Routes
router.get(
  '/prompts',
  auth(USER_ROLES.USER),
  apiLimiter,
  MailController.listPrompts
);
router.get(
  '/prompts/:name',
  auth(USER_ROLES.USER),
  apiLimiter,
  MailController.getPrompt
);
router.get(
  '/tools',
  auth(USER_ROLES.USER),
  apiLimiter,
  MailController.listTools
);

router.get(
  '/emails/:id/summary',
  auth(USER_ROLES.USER),
  apiLimiter,
  MailController.summarizeEmail
);
router.post(
  '/chat',
  auth(USER_ROLES.USER),
  apiLimiter,
  MailController.chatWithBot
);
export const MailRoutes = router;
