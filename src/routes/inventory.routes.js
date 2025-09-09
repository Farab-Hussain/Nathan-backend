"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const inventoryController_1 = require("../controller/inventoryController");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const admin_middleware_1 = require("../middlewares/admin.middleware");
const router = express_1.default.Router();
// All inventory routes require authentication
router.use(auth_middleware_1.protect);
// Public inventory routes (authenticated users can view)
router.get("/", inventoryController_1.getAllInventory); // Get all inventory
router.get("/alerts", inventoryController_1.getLowStockAlerts); // Get low stock alerts
router.get("/:flavorId", inventoryController_1.getFlavorInventory); // Get specific flavor inventory
// Admin-only inventory routes
router.put("/:flavorId", admin_middleware_1.adminOnly, inventoryController_1.updateInventory); // Update specific flavor inventory
router.put("/bulk", admin_middleware_1.adminOnly, inventoryController_1.bulkUpdateInventory); // Bulk update inventory
exports.default = router;
