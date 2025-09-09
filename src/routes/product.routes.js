"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const productController_1 = require("../controller/productController");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const admin_middleware_1 = require("../middlewares/admin.middleware");
const upload_middleware_1 = require("../middlewares/upload.middleware");
const router = express_1.default.Router();
// Public routes (no authentication required)
router.get("/", productController_1.getAllProducts); // Get all products
router.get("/categories", productController_1.getCategories); // Get all product categories
router.get("/:id", productController_1.getProductById); // Get product by ID
// Admin routes (authentication + admin role required)
router.use(auth_middleware_1.protect);
router.get("/admin/all", admin_middleware_1.adminOnly, productController_1.getAllProductsForAdmin); // Get all products for admin (including inactive)
router.post("/admin/products", admin_middleware_1.adminOnly, upload_middleware_1.uploadProductImage, upload_middleware_1.handleUploadError, productController_1.createProduct); // Create a new product
router.put("/admin/:id", admin_middleware_1.adminOnly, productController_1.updateProduct); // Update a product
router.delete("/admin/:id", admin_middleware_1.adminOnly, productController_1.deleteProduct); // Delete a product
exports.default = router;
