// src/helpers/encryptionHelper.ts
import crypto from 'crypto';
import config from '../config';

const ENCRYPTION_KEY = crypto.scryptSync(
  config.encryption.key as string,
  config.encryption.salt || 'salt',
  32
);
const IV_LENGTH = 16;

export const encryptionHelper = {
  encrypt(text: string): string {
    if (!text) return '';

    try {
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
      let encrypted = cipher.update(text, 'utf8', 'hex'); // Specify output encoding
      encrypted += cipher.final('hex');
      return `${iv.toString('hex')}:${encrypted}`;
    } catch (error) {
      console.error('Encryption error:', error);
      throw new Error('Failed to encrypt data');
    }
  },

  decrypt(text: string): string {
    if (!text || !text.includes(':')) return '';

    try {
      const [ivHex, encryptedText] = text.split(':');
      const iv = Buffer.from(ivHex, 'hex');
      const encrypted = Buffer.from(encryptedText, 'hex');
      const decipher = crypto.createDecipheriv(
        'aes-256-cbc',
        ENCRYPTION_KEY,
        iv
      );
      let decrypted = decipher.update(encrypted, 'hex', 'utf8'); // Specify input/output encoding
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
      console.error('Decryption error:', error);
      throw new Error('Failed to decrypt data');
    }
  },
};
