import express from "express";
import {
  getAllFlavors,
  createFlavor,
  updateFlavor,
  deleteFlavor,
  getAllCategories,
  createCategory,
  updateFlavorInventory,
  getInventoryAlerts,
  getSystemConfig,
} from "../controller/adminController";
import { protect } from "../middlewares/auth.middleware";
import { adminOnly } from "../middlewares/admin.middleware";

const router = express.Router();

// All admin routes require authentication and admin role
router.use(protect);
router.use(adminOnly);

// ==================== FLAVOR MANAGEMENT ====================
router.get("/flavors", getAllFlavors);
router.post("/flavors", createFlavor);
router.put("/flavors/:id", updateFlavor);
router.delete("/flavors/:id", deleteFlavor);

// ==================== CATEGORY MANAGEMENT ====================
router.get("/categories", getAllCategories);
router.post("/categories", createCategory);

// ==================== INVENTORY MANAGEMENT ====================
router.put("/inventory/:id", updateFlavorInventory);
router.get("/inventory/alerts", getInventoryAlerts);

// ==================== SYSTEM CONFIGURATION ====================
router.get("/config", getSystemConfig);

export default router;
