// src/app.ts
import cors from 'cors';
import express, { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import { StatusCodes } from 'http-status-codes';
import globalErrorHandler from './app/middlewares/globalErrorHandler';
import router from './routes';
import { Morgan } from './shared/morgen';
import responseInterceptor from './app/middlewares/responseInterceptor';
import passport from './config/passport';
import config from './config';


const app = express();

// Morgan logging
app.use(Morgan.successHandler);
app.use(Morgan.errorHandler);

// CORS Configuration based on environment
const isDevelopment = process.env.NODE_ENV === 'development';

let corsOptions;

if (isDevelopment) {
  // More permissive CORS for development
  corsOptions = {
    origin: true, // Allow any origin in development
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Access-Control-Allow-Credentials',
      'Access-Control-Allow-Origin',
    ],
    exposedHeaders: ['set-cookie'],
  };
} else {
  // Stricter CORS for production
  corsOptions = {
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void
    ) => {
      const allowedOrigins = [
        config.frontend.url,
        'http://localhost:5173',
        'http://172.168.0.206:3000',
        'http://192.168.10.206:5173',
        'http://172.16.0.2:3000',
        'http://172.16.0.2:5173',
        'http://192.168.10.206:5173/',
        // Add any other production origins you need
      ];

      // For debugging
      console.log(`CORS request from origin: ${origin}`);
      console.log(`Allowed origins: ${allowedOrigins.join(', ')}`);

      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.log(`CORS blocked for origin: ${origin}`);
        callback(new Error(`CORS not allowed for origin: ${origin}`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Access-Control-Allow-Credentials',
      'Access-Control-Allow-Origin',
    ],
    exposedHeaders: ['set-cookie'],
  };
}

// Enable pre-flight across all routes
app.options('*', cors(corsOptions));

// Apply CORS middleware
app.use(cors(corsOptions));

// Add CORS headers manually as backup - FIX THE TYPE ERROR HERE
app.use((req: Request, res: Response, next: NextFunction) => {
  // Handle OPTIONS requests separately
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH');
    res.header(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, Access-Control-Allow-Credentials, Access-Control-Allow-Origin'
    );
    res.header('Access-Control-Allow-Credentials', 'true');

    if (isDevelopment) {
      res.header(
        'Access-Control-Allow-Origin',
        (req.headers.origin as string) || '*'
      );
    } else if (req.headers.origin) {
      const allowedOrigins = [
        config.frontend.url,
        'http://localhost:5173',
        'http://172.168.0.206:3000',
        'http://192.168.10.206:5173',
        'http://172.16.0.2:3000',
        'http://172.16.0.2:5173',
        'http://192.168.10.206:5173/',
      ];

      if (allowedOrigins.includes(req.headers.origin)) {
        res.header('Access-Control-Allow-Origin', req.headers.origin);
      }
    }

    return res.status(200).end();
  }

  // For non-OPTIONS requests
  if (req.headers.origin) {
    if (isDevelopment) {
      res.header('Access-Control-Allow-Origin', req.headers.origin);
    } else {
      const allowedOrigins = [
        config.frontend.url,
        'http://localhost:5173',
        'http://172.168.0.206:3000',
        'http://192.168.10.206:5173',
        'http://172.16.0.2:3000',
        'http://172.16.0.2:5173',
        'http://192.168.10.206:5173/',
      ];

      if (allowedOrigins.includes(req.headers.origin)) {
        res.header('Access-Control-Allow-Origin', req.headers.origin);
      }
    }
    res.header('Access-Control-Allow-Credentials', 'true');
  }

  next();
});

// Session middleware
app.use(
  session({
    secret: config.jwt.secret || 'your-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: config.cookies.secure,
      httpOnly: config.cookies.httpOnly,
      sameSite: config.cookies.sameSite as
        | 'none'
        | 'lax'
        | 'strict'
        | undefined,
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

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());

// API routes
app.use('/api/v1', router);

// Home route - serving the HTML content
app.get('/', (req: Request, res: Response) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AI Chatbot Project - Client Information</title>
</head>
<body style="
      font-family: Verdana, Geneva, Tahoma, sans-serif;
      background-color: #f9f9f9;
      margin: 0;
      padding: 20px;
    ">
  <div style="
        background-color: #ffffff;
        max-width: 600px;
        margin: 0 auto;
        padding: 20px;
        border-radius: 10px;
        box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
      ">
    <!-- Header -->
    <h1 style="text-align:center; color:#A55FEF; font-family:Verdana;">Hey Frontend Developer, How can I assist you today!</h1>
    <div style="
          background-color: #4caf50;
          color: white;
          text-align: center;
          padding: 20px;
          border-radius: 10px 10px 0 0;
        ">
      <h1 style="margin: 0">AI Chatbot Project</h1>
    </div>

    <!-- Project Details -->
    <div style="padding: 20px; color: #333">
      <div style="margin-bottom: 20px">
        <h3 style="
              margin-bottom: 5px;
              font-size: 18px;
              background: gray;
              color: white;
              padding: 5px;
            ">
          Client Information
        </h3>
        <p><strong>Client Name:</strong> Konrad Gradalski</p>
        <p><strong>Project Start Date:</strong> March 10, 2025</p>
        <p><strong>Expected Completion:</strong> Ongoing</p>
      </div>

      <!-- Developer Information -->
      <div style="margin-bottom: 20px">
        <h3 style="
              margin-bottom: 5px;
              font-size: 18px;
              background: gray;
              color: white;
              padding: 5px;
            ">
          Developer Details
        </h3>
        <p><strong>Software Engineer:</strong> Nayon</p>
        <p><strong>Location:</strong> Dhaka, Bangladesh</p>
      </div>

      <!-- Project Scope -->
      <div style="margin-bottom: 20px">
        <h3 style="
              margin-bottom: 5px;
              font-size: 18px;
              background: gray;
              color: white;
              padding: 5px;
            ">
          Project Scope
        </h3>
        <p><strong>Project Type:</strong> AI Chatbot</p>
        <p><strong>Platforms:</strong> Gmail, Outlook, Yahoo</p>
        <p><strong>Features:</strong> AI-powered email responses, automated client interactions, multilingual support,
          and adaptive learning.</p>
      </div>

      <!-- Contact Information -->
      <div style="margin-bottom: 20px">
        <h3 style="
              margin-bottom: 5px;
              font-size: 18px;
              background: gray;
              color: white;
              padding: 5px;
            ">
          Contact Information
        </h3>
        <p><strong>Email:</strong> <a href="mailto:konrad@example.com">konrad@example.com</a></p>
        <p><strong>Phone:</strong> +1 (555) 123-4567</p>
      </div>
    </div>
  </div>
</body>
</html>
  `);
});

// Error handling
app.use(globalErrorHandler);

// Handle not found routes
app.use((req: Request, res: Response) => {
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
