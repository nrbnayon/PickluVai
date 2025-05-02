// // src/app.ts

// src/app.ts
import cors from 'cors';
import express from 'express';
import session from 'express-session';
import { StatusCodes } from 'http-status-codes';
import globalErrorHandler from './app/middlewares/globalErrorHandler';
import router from './routes';
import { Morgan } from './shared/morgen';
import responseInterceptor from './app/middlewares/responseInterceptor';
import config from './config';
import { homePageHTML } from './home';

const app = express();
const isDevelopment = process.env.NODE_ENV === 'development';

// Constants
const ALLOWED_ORIGINS = [
  config.frontend.url,
  'http://localhost:5173',
  'http://localhost:3000',
];

// Morgan logging
app.use(Morgan.successHandler);
app.use(Morgan.errorHandler);

// Basic CORS setup - simplified for debugging
app.use(cors({
  origin: '*', // For debugging purposes
  credentials: true
}));

// Session middleware
app.use(
  session({
    secret: config.jwt.secret || 'your-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: config.cookies.secure,
      httpOnly: config.cookies.httpOnly,
      sameSite: config.cookies.sameSite as 'none' | 'lax' | 'strict' | undefined,
      maxAge: config.cookies.maxAge,
      path: config.cookies.path,
      domain: config.cookies.domain,
    },
  })
);

// Apply response interceptor
app.use(responseInterceptor);

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files
app.use(express.static('uploads'));

// Basic routes first
app.get('/', (_req, res) => {
  res.send(homePageHTML);
});

// API routes
app.use('/api/v1', router);

// Error handling 
app.use(globalErrorHandler);

// Handle not found routes
app.use((req, res) => {
  console.log('Route not found:', req.originalUrl);
  res.status(StatusCodes.NOT_FOUND).json({
    success: false,
    message: '❌ API Not Found',
    errorMessages: [
      {
        path: req.originalUrl,
        message: "🚫 API DOESN'T EXIST",
      },
    ],
  });
});

export default app;
// import cors from 'cors';
// import express, { Request, Response, NextFunction } from 'express';
// import session from 'express-session';
// import { StatusCodes } from 'http-status-codes';
// import globalErrorHandler from './app/middlewares/globalErrorHandler';
// import router from './routes';
// import { Morgan } from './shared/morgen';
// import responseInterceptor from './app/middlewares/responseInterceptor';
// import config from './config';
// import { homePageHTML } from './home';

// const app = express();
// const isDevelopment = process.env.NODE_ENV === 'development';

// // Constants
// const ALLOWED_ORIGINS = [
//   config.frontend.url,
//   'http://localhost:5173',
//   'http://localhost:3000',
// ];

// const CORS_ALLOWED_HEADERS = [
//   'Content-Type',
//   'Authorization',
//   'Access-Control-Allow-Credentials',
//   'Access-Control-Allow-Origin',
// ];

// const CORS_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'];

// // Morgan logging
// app.use(Morgan.successHandler);
// app.use(Morgan.errorHandler);

// // CORS Configuration
// const corsOptions = {
//   origin: isDevelopment
//     ? true
//     : (
//         origin: string | undefined,
//         callback: (err: Error | null, allow?: boolean) => void
//       ) => {
//         // For debugging
//         console.log(`CORS request from origin: ${origin}`);

//         if (!origin || ALLOWED_ORIGINS.includes(origin)) {
//           callback(null, true);
//         } else {
//           console.log(`CORS blocked for origin: ${origin}`);
//           callback(new Error(`CORS not allowed for origin: ${origin}`));
//         }
//       },
//   credentials: true,
//   methods: CORS_METHODS,
//   allowedHeaders: CORS_ALLOWED_HEADERS,
//   exposedHeaders: ['set-cookie'],
// };

// // Enable pre-flight across all routes
// app.options('*', cors(corsOptions));

// // Apply CORS middleware
// app.use(cors(corsOptions));

// // Additional CORS headers handler for better compatibility
// app.use((req: Request, res: Response, next: NextFunction): void => {
//   // Skip for non-CORS requests that don't need special handling
//   if (!req.headers.origin) {
//     return next();
//   }

//   // Handle OPTIONS requests
//   if (req.method === 'OPTIONS') {
//     res.header('Access-Control-Allow-Methods', CORS_METHODS.join(', '));
//     res.header('Access-Control-Allow-Headers', CORS_ALLOWED_HEADERS.join(', '));
//     res.header('Access-Control-Allow-Credentials', 'true');

//     // Set appropriate origin header based on environment
//     if (isDevelopment) {
//       res.header('Access-Control-Allow-Origin', req.headers.origin);
//     } else if (ALLOWED_ORIGINS.includes(req.headers.origin)) {
//       res.header('Access-Control-Allow-Origin', req.headers.origin);
//     }

//     res.status(200).end();
//   }

//   // For regular requests, just set the origin if appropriate
//   if (isDevelopment || ALLOWED_ORIGINS.includes(req.headers.origin)) {
//     res.header('Access-Control-Allow-Origin', req.headers.origin);
//     res.header('Access-Control-Allow-Credentials', 'true');
//   }

//   next();
// });

// // Session middleware
// app.use(
//   session({
//     secret: config.jwt.secret || 'your-session-secret',
//     resave: false,
//     saveUninitialized: false,
//     cookie: {
//       secure: config.cookies.secure,
//       httpOnly: config.cookies.httpOnly,
//       sameSite: config.cookies.sameSite as
//         | 'none'
//         | 'lax'
//         | 'strict'
//         | undefined,
//       maxAge: config.cookies.maxAge,
//       path: config.cookies.path,
//       domain: config.cookies.domain,
//     },
//   })
// );

// // Apply response interceptor
// app.use(responseInterceptor);

// // Body parsers
// app.use(express.json({ limit: '10mb' }));
// app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// // Serve static files
// app.use(express.static('uploads'));

// // API routes
// app.use('/api/v1', router);

// // Home route - serving the HTML content
// app.get('/', (_req: Request, res: Response) => {
//   res.send(homePageHTML);
// });

// // Error handling
// app.use(globalErrorHandler);

// // Handle not found routes
// app.use((req: Request, res: Response) => {
//   console.log('Route not found:', req.originalUrl);
//   res.status(StatusCodes.NOT_FOUND).json({
//     success: false,
//     message: '❌ API Not Found',
//     errorMessages: [
//       {
//         path: req.originalUrl,
//         message: "🚫 API DOESN'T EXIST",
//       },
//     ],
//   });
// });

// export default app;
