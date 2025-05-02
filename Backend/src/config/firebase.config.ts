// src\config\firebase.config.ts
import * as admin from 'firebase-admin';
import config from '../config';

// Check if Firebase is already initialized to prevent multiple initializations
if (!admin.apps.length) {
  // Use the configuration from our config file
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: config.firebase.project_id,
      clientEmail: config.firebase.client_email,
      privateKey: config.firebase.private_key,
    }),
  });
}

// Export the admin instance
export const firebaseAdmin = admin;
