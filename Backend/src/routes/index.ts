// src/routes/index.ts
import express from 'express';
import { AuthRoutes } from '../app/modules/auth/auth.routes';
const router = express.Router();

const apiRoutes = [
  { path: '/auth', route: AuthRoutes },
  // { path: '/mail', route: MailRoutes },
];

apiRoutes.forEach(route => {
  console.log('Mounting route with path:', route.path);
  router.use(route.path, route.route);
});

// Log all registered routes for debugging
router.stack.forEach((layer: any) => {
  if (layer.route) {
    console.log('Registered route:', layer.route.path);
  } else if (layer.name === 'router' && layer.handle.stack) {
    console.log('Router middleware path:', layer.regexp);
    layer.handle.stack.forEach((nestedLayer: any) => {
      if (nestedLayer.route) {
        console.log('  - Nested route:', nestedLayer.route.path);
      }
    });
  }
});

export default router;
