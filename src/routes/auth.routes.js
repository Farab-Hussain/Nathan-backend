"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authController_1 = require("../controller/authController");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const security_middleware_1 = require("../middlewares/security.middleware");
const express_validator_1 = require("express-validator");
const router = express_1.default.Router();
// Register route with validation
router.post("/register", [
    security_middleware_1.validateName,
    security_middleware_1.validateEmail,
    security_middleware_1.validatePassword,
    security_middleware_1.validateRequest
], authController_1.register);
// Login route with validation
router.post("/login", [
    security_middleware_1.validateEmail,
    (0, express_validator_1.body)('password').notEmpty().withMessage('Password is required'),
    security_middleware_1.validateRequest
], authController_1.login);
// Forgot password route with validation
router.post("/forgot-password", [
    security_middleware_1.validateEmail,
    security_middleware_1.validateRequest
], authController_1.forgotPassword);
// Reset password route with validation
router.post("/reset-password", [
    (0, express_validator_1.body)('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    (0, express_validator_1.body)('code').isLength({ min: 6, max: 6 }).withMessage('Code must be 6 digits'),
    security_middleware_1.validatePassword,
    security_middleware_1.validateRequest
], authController_1.resetPassword);
router.post("/logout", authController_1.logout);
router.get("/me", auth_middleware_1.protect, authController_1.me);
exports.default = router;
