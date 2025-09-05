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

import { logger } from "./utils/logger";

dotenv.config();

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// Serve static files (uploaded images)
app.use("/uploads", express.static("uploads"));

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

app.use("/auth", authRoutes);
app.use("/cart", cartRoutes);
app.use("/products", productRoutes);
app.use("/orders", orderRoutes);
app.use("/3pack", threePackRoutes);
app.use("/3pack/cart", threePackCartRoutes);
app.use("/inventory", inventoryRoutes);

const server = app.listen(process.env.PORT, () => {
  console.log(`Server is running on port ${process.env.PORT}`);
});

server.on("error", (err) => {
  console.error("Server error:", err);
});