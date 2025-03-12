import { Request, Response, NextFunction } from 'express';
import jwt, { Secret } from 'jsonwebtoken';

interface AuthenticatedRequest extends Request {
    userId?: string | number;
}

// Fixed middleware function with proper typing
export const verifyToken = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    try {
        const authHeader = req.headers['authorization'];
        
        // Check if header exists
        if (!authHeader) {
            res.status(403).json({ message: "Token is not provided" });
            return;
        }
        
        // Handle "Bearer token" format
        let token = authHeader;
        if (authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1];
        }
        
        // Print token details for debugging
        // console.log(`Token received: ${token.substring(0, 10)}...`);
        // console.log(`Secret key length: ${(process.env.SECRET_KEY || '').length}`);
        
        // Verify token
        jwt.verify(token, process.env.SECRET_KEY as Secret, (err: any, decoded: any) => {
            if (err) {
                console.error("JWT Verification Error:", {
                    name: err.name,
                    message: err.message,
                    expiredAt: err.expiredAt
                });
                
                if (err.name === "TokenExpiredError") {
                    res.status(401).json({ message: "Token expired" });
                } else if (err.name === "JsonWebTokenError") {
                    res.status(401).json({ message: "Invalid token signature" });
                } else {
                    res.status(401).json({ message: "Invalid token" });
                }
                return;
            }
            
            // Log successful decoding
            // console.log("Decoded token payload:", decoded);
            req.userId = decoded.userId || decoded.id || decoded._id;
            next();
        });
    } catch (error) {
        console.error("Auth middleware unexpected error:", error);
        res.status(500).json({ message: "Authentication error" });
    }
};
