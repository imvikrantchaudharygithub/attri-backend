'use strict';
import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import * as dotenv from 'dotenv';
import cors from 'cors';
import db from './db/db'; // Assuming you have a `db.ts` file in the `db` folder
import router from './routes/routes'; // Assuming you have a `router.ts` file in the `routes` folder
import path from 'path';
import fs from 'fs';

// Load environment variables from .env file
dotenv.config();

// Initialize the Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Update CORS configuration
const allowedOrigins = [
  'http://localhost:3001', // Local development
  'https://your-frontend-domain.com', // Production frontend
  'https://*.vercel.app' // All Vercel preview deployments
];

const corsOptions: cors.CorsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.some(allowedOrigin => 
      origin === allowedOrigin || 
      origin.endsWith('.vercel.app')
    )) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-xsrf-token'],
  credentials: true,
  optionsSuccessStatus: 200
};

// Must be the first middleware
app.use(cors(corsOptions));

// Handle preflight requests globally
app.options('*', cors(corsOptions));

// If using Express's built-in JSON parser (for Express 4.16+)
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Serve static files (optional)
const staticPath = path.join(__dirname, 'public');
if (fs.existsSync(staticPath)) {
  app.use(express.static(staticPath));
}

db();

// API Routes
app.use('/api', router);

// Root GET endpoint
app.get('/', (req: Request, res: Response) => {
  res.send('Hello, World!');
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});