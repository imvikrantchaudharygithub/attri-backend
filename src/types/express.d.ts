declare global {
  namespace Express {
    interface Request {
      user?: {
        _id: string;
        // Add other user properties as needed
      };
    }
  }
} 