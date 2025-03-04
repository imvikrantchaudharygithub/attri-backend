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

// Middleware
app.use(cors());
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