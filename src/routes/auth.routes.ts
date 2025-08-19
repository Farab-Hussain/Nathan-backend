import express from "express";
import {
  register,
  login,
  forgotPassword,
  resetPassword,
  logout,
  me,
} from "../controller/authController";
import { protect } from "../middlewares/auth.middleware";

const router = express.Router();

router.post("/register", register);

router.post("/login", login);

router.post("/forgot-password", forgotPassword);

router.post("/reset-password", resetPassword);

router.post("/logout", logout);

router.get("/me", protect, me);

export default router;
