import { Request, Response, NextFunction } from 'express';
import jwt, { Secret } from 'jsonwebtoken';

interface AuthenticatedRequest extends Request {
    userId?: string | number;
}

// Middleware function to verify JWT
export function verifyToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const token = req.headers['authorization'];

    if (!token) {
        return res.status(403).json({ message: "Token is not provided" });
    }

    jwt.verify(token as string, process.env.SECRET_KEY as Secret, (err:any, decoded:any) => {
        if (err) {
            return res.status(401).json({ message: "Invalid token" });
        }
        req.userId = (decoded as { userId: string | number }).userId;
        next();
    });
}
