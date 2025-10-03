import express from "express";
import {
  createOrder,
  getUserOrders,
  getOrderById,
  updateOrderStatus,
  getAllOrders,
  bulkUpdateOrders,
  bulkDeleteOrders,
} from "../controller/orderController";
import { protect } from "../middlewares/auth.middleware";
import { adminOnly } from "../middlewares/admin.middleware";

const router = express.Router();

// All order routes require authentication
router.use(protect);

// User routes
router.post("/", createOrder);
router.get("/", getUserOrders);
router.get("/:id", getOrderById);

// Admin routes (admin role required)
router.put("/:id/status", adminOnly, updateOrderStatus);
router.get("/admin/all", adminOnly, getAllOrders);
router.put("/admin/bulk-update", adminOnly, bulkUpdateOrders);
router.delete("/admin/bulk-delete", adminOnly, bulkDeleteOrders);

export default router;
