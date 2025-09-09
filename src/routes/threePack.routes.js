"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const threePackController_1 = require("../controller/threePackController");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const admin_middleware_1 = require("../middlewares/admin.middleware");
const router = express_1.default.Router();
// Public routes
router.get("/product", threePackController_1.getThreePackProduct); // Get 3-pack product with variants
router.get("/inventory/availability", threePackController_1.getInventoryAvailability); // Check inventory availability
// Admin routes (authentication + admin role required)
router.use(auth_middleware_1.protect);
router.get("/admin/flavors", admin_middleware_1.adminOnly, threePackController_1.getAllFlavors); // Get all flavors for admin
router.get("/admin/recipes", admin_middleware_1.adminOnly, threePackController_1.getAllPackRecipes); // Get all pack recipes for admin
exports.default = router;
