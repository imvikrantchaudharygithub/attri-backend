import { Request, Response, NextFunction } from 'express';
import jwt, { Secret } from 'jsonwebtoken';
import User from '../models/user.model';

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
            
            const userId = decoded.userId || decoded.id || decoded._id;

            // Tokens minted before the last password change are dead. Adds one
            // indexed lookup per authenticated request — negligible at current
            // volume, and the alternative is a stolen 168h token retaining
            // access to a withdrawable wallet after the owner resets.
            //
            // `tv` is absent on tokens issued before this field existed; both
            // sides coalesce to 0 so already-active sessions keep working.
            User.findById(userId)
                .select('tokenVersion')
                .lean()
                .then((user: any) => {
                    if (!user || (user.tokenVersion || 0) !== (decoded.tv || 0)) {
                        res.status(401).json({ message: "Session expired. Please log in again." });
                        return;
                    }
                    req.userId = userId;
                    next();
                })
                .catch((lookupError) => {
                    console.error("Auth middleware lookup error:", lookupError);
                    res.status(500).json({ message: "Authentication error" });
                });
        });
    } catch (error) {
        console.error("Auth middleware unexpected error:", error);
        res.status(500).json({ message: "Authentication error" });
    }
};
