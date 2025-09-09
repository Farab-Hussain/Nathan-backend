import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/auth.routes";
import cartRoutes from "./routes/cart.routes";
import productRoutes from "./routes/product.routes";
import orderRoutes from "./routes/order.routes";
import threePackRoutes from "./routes/threePack.routes";
import threePackCartRoutes from "./routes/threePackCart.routes";
import inventoryRoutes from "./routes/inventory.routes";
import paymentsRoutes from "./routes/payments.routes";

import { logger } from "./utils/logger";
import { errorHandler, notFound } from "./middlewares/error.middleware";
import { 
  helmetConfig, 
  generalRateLimit, 
  authRateLimit, 
  securityHeaders, 
  requestLogger 
} from "./middlewares/security.middleware";

dotenv.config();

const app = express();

// Trust proxy (for rate limiting and IP detection)
app.set('trust proxy', 1);

// Security middleware
app.use(helmetConfig);
app.use(securityHeaders);

// CORS configuration
app.use(cors({ 
  origin: process.env.NODE_ENV === "production" 
    ? ["https://licorice4good.com", "https://www.licorice4good.com"] 
    : process.env.CLIENT_URL, 
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
  exposedHeaders: ["Set-Cookie"]
}));

// Rate limiting
app.use(generalRateLimit);

// Body parsing middleware
// Use raw body only for Stripe webhook route; json for others
app.use((req, res, next) => {
  if (req.originalUrl === "/payments/webhook") {
    next();
  } else {
    express.json({ limit: '10mb' })(req, res, next);
  }
});

app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Serve static files (uploaded images)
app.use("/uploads", express.static("uploads"));

// Request logging
app.use(requestLogger);

// Routes with specific rate limiting
app.use("/auth", authRateLimit, authRoutes);
app.use("/cart", cartRoutes);
app.use("/products", productRoutes);
app.use("/orders", orderRoutes);
app.use("/3pack", threePackRoutes);
app.use("/3pack/cart", threePackCartRoutes);
app.use("/inventory", inventoryRoutes);
app.use("/payments", paymentsRoutes);

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
  });
});

// 404 handler
app.use(notFound);

// Error handling middleware (must be last)
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT} in ${process.env.NODE_ENV} mode`);
});

server.on("error", (err) => {
  logger.error(`Server error: ${err.message}`);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});