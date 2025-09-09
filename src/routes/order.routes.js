"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const orderController_1 = require("../controller/orderController");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const admin_middleware_1 = require("../middlewares/admin.middleware");
const router = express_1.default.Router();
// All order routes require authentication
router.use(auth_middleware_1.protect);
// User routes
router.post("/", orderController_1.createOrder);
router.get("/", orderController_1.getUserOrders);
router.get("/:id", orderController_1.getOrderById);
// Admin routes (admin role required)
router.put("/:id/status", admin_middleware_1.adminOnly, orderController_1.updateOrderStatus);
router.get("/admin/all", admin_middleware_1.adminOnly, orderController_1.getAllOrders);
exports.default = router;
