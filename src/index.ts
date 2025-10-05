'use strict';
import express, { NextFunction, Request, Response } from 'express';
import bodyParser from 'body-parser';
import * as dotenv from 'dotenv';
import cors from 'cors';
import db from './db/db'; // Assuming you have a `db.ts` file in the `db` folder
import router from './routes/routes'; // Assuming you have a `router.ts` file in the `routes` folder
import path from 'path';
import fs from 'fs';
import { sendSMS } from './services/smsSevice';
// import { createShiprocketOrder } from '../src/controllers/shiprocketController';
// Load environment variables from .env file
dotenv.config();

// Initialize the Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Update CORS configuration
// In your backend code
const allowedOrigins = [
  'http://localhost:3000',
  'http://172.20.10.5:3000',
  'https://attri-frontend.vercel.app', // Add your frontend domain
  /https:\/\/.*\.vercel\.app$/  // Allow all Vercel subdomains
];

app.use((req, res, next) => {
  const allowedOrigins = ['http://localhost:3000', 'http://localhost:3001', 'http://172.20.10.5:3001'];
  const origin = req.headers.origin;
  
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  // sasa 2
  next();
});
app.options('*', cors());

// If using Express's built-in JSON parser (for Express 4.
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Serve static files (optional)
const staticPath = path.join(__dirname, 'public');
if (fs.existsSync(staticPath)) {
  app.use(express.static(staticPath));
}

// Update the db connection with proper error handling
try {
  db();
  console.log('Database connected successfully');
} catch (error) {
  console.error('Database connection error:', error);
  // Continue server startup even if DB fails
}

// API Routes
app.use('/api', router);

// Root GET endpoint
app.get('/', (req: Request, res: Response) => {
  res.send('Hello, World!');
});
// sendSMS("+919520887693", 123456).then((response) => {
//   console.log(response);
// }).catch((error) => {
//   console.log(error);
// });
// Start the server
// createShiprocketOrder("68c28fc5e0d04a5bff6eb978")
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});