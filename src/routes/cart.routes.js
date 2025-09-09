"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cartController_1 = require("../controller/cartController");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const upload_middleware_1 = require("../middlewares/upload.middleware");
const router = express_1.default.Router();
// All cart routes require authentication
router.use(auth_middleware_1.protect);
// Cart CRUD operations
router.post("/add", upload_middleware_1.uploadMultipleImages, upload_middleware_1.handleUploadError, cartController_1.addToCart);
router.get("/cart", cartController_1.getUserCart);
router.delete("/:id", cartController_1.deleteUserCart);
router.put("/:id", cartController_1.updateCartItem);
router.delete("/", cartController_1.clearUserCart);
exports.default = router;
