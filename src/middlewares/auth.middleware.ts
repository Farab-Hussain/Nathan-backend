import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";

interface DecodedToken {
  id: string;
  role?: string;
}

export const protect = (req: Request, res: Response, next: NextFunction) => {
  let token;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  } else if (req.cookies?.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({
      message:
        "Authentication required. Please log in to access this resource.",
      code: "NO_TOKEN",
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as DecodedToken;
    (req as any).user = { id: decoded.id, role: decoded.role };
    
    // Debug logging for order-related and payment-related requests
    if (req.path.includes('/orders') || req.path.includes('/payments')) {
      console.log("🔐 Auth middleware - User authenticated:", {
        userId: decoded.id,
        role: decoded.role,
        path: req.path,
        method: req.method
      });
    }
    
    next();
  } catch {
    // Token is invalid or expired
    res.status(401).json({
      message: "Invalid or expired authentication token. Please log in again.",
      code: "INVALID_TOKEN",
    });
  }
};
