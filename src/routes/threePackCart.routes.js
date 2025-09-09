"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const threePackCartController_1 = require("../controller/threePackCartController");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = express_1.default.Router();
// All cart routes require authentication
router.use(auth_middleware_1.protect);
// 3-Pack Cart operations
router.post("/add", threePackCartController_1.addToCart); // Add 3-pack to cart
router.get("/", threePackCartController_1.getUserCart); // Get user's 3-pack cart
router.put("/:id", threePackCartController_1.updateCartLine); // Update cart line quantity
router.delete("/:id", threePackCartController_1.removeCartLine); // Remove cart line
router.delete("/", threePackCartController_1.clearCart); // Clear entire cart
exports.default = router;
