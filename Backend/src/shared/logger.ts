// src/shared/logger.ts

import winston from 'winston';
import config from '../config';

// Define log format
const { combine, timestamp, label, printf } = winston.format;
const myFormat = printf(({ level, message, label, timestamp }) => {
  return `${timestamp} [${label}] ${level}: ${message}`;
});

// Create a console-only logger for Vercel environment
const logger = winston.createLogger({
  level: config.node_env === 'development' ? 'debug' : 'info',
  format: combine(label({ label: 'AI-CHATBOT' }), timestamp(), myFormat),
  transports: [new winston.transports.Console()],
});

// Create error logger (also console-only for Vercel)
const errorLogger = winston.createLogger({
  level: 'error',
  format: combine(label({ label: 'AI-CHATBOT-ERROR' }), timestamp(), myFormat),
  transports: [new winston.transports.Console()],
});

export { logger, errorLogger };

// import path from 'path';
// import DailyRotateFile from 'winston-daily-rotate-file';
// const { createLogger, format, transports } = require('winston');
// const { combine, timestamp, label, printf } = format;

// const myFormat = printf(
//   ({
//     level,
//     message,
//     label,
//     timestamp,
//   }: {
//     level: string;
//     message: string;
//     label: string;
//     timestamp: Date;
//   }) => {
//     const date = new Date(timestamp);
//     const hour = date.getHours();
//     const minutes = date.getMinutes();
//     const seconds = date.getSeconds();

//     return `${date.toDateString()} ${hour}:${minutes}:${seconds} [${label}] ${level}: ${message}`;
//   }
// );

// const logger = createLogger({
//   level: 'info',
//   format: combine(label({ label: 'AiChatBot' }), timestamp(), myFormat),
//   transports: [
//     new transports.Console(),
//     new DailyRotateFile({
//       filename: path.join(
//         process.cwd(),
//         'winston',
//         'success',
//         '%DATE%-success.log'
//       ),
//       datePattern: 'DD-MM-YYYY-HH',
//       maxSize: '20m',
//       maxFiles: '1d',
//     }),
//   ],
// });

// const errorLogger = createLogger({
//   level: 'error',
//   format: combine(label({ label: 'AiChatBot' }), timestamp(), myFormat),
//   transports: [
//     new transports.Console(),
//     new DailyRotateFile({
//       filename: path.join(
//         process.cwd(),
//         'winston',
//         'error',
//         '%DATE%-error.log'
//       ),
//       datePattern: 'DD-MM-YYYY-HH',
//       maxSize: '20m',
//       maxFiles: '1d',
//     }),
//   ],
// });

// export { errorLogger, logger };
