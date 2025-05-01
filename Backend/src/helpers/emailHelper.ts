import nodemailer from 'nodemailer';
import config from '../config';
import { errorLogger, logger } from '../shared/logger';
import { ISendEmail } from '../types/email';

// Transporter setup
const transporter = nodemailer.createTransport({
  host: config.email.host,
  port: config.email.port,
  secure: config.email.secure,
  auth: {
    user: config.email.user,
    pass: config.email.pass,
  },
});

// Debugging log
console.log('SMTP Email Sending from:', config.email.from);

const sendEmail = async (values: ISendEmail) => {
  try {
    const info = await transporter.sendMail({
      from: `"AI-ChatBot" <${config.email.from}>`,
      to: values.to,
      subject: values.subject,
      html: values.html,
    });

    if (info.accepted.length > 0) {
      logger.info(`✅ Email successfully sent to: ${values.to}`);
    } else {
      logger.warn(`⚠️ Email not accepted by recipient: ${values.to}`);
    }
  } catch (error: any) {
    errorLogger.error(`❌ Email sending failed to: ${values.to}`, {
      message: error.message,
      stack: error.stack,
    });
  }
};

export const emailHelper = {
  sendEmail,
};
