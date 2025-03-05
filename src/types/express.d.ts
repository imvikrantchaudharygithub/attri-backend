import * as express from 'express';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string; // Adjust the type based on your user object structure
        // Add other user properties if needed
      };
    }
  }
} 