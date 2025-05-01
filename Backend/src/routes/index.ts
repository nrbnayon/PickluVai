// src/routes/index.ts
import express from 'express';
import { UserRoutes } from '../app/modules/user/user.route';
import { MailRoutes } from '../app/modules/mail/mail.route';

const router = express.Router();

const apiRoutes = [
  { path: '/auth', route: UserRoutes },
  { path: '/mail', route: MailRoutes },
];

apiRoutes.forEach(route => router.use(route.path, route.route));

export default router;
