import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../config/database";
import { generateToken } from "../utils/jwt";
import crypto from "crypto";
import { sendResetEmail } from "../utils/mailer";
import { logger } from "../utils/logger";

export const register = async (req: Request, res: Response) => {
  const { name, email, password } = req.body;
  try {
    const userExists = await prisma.user.findUnique({ where: { email } });
    if (userExists)
      return res.status(400).json({ message: "User already exists" });

    const hashed = await bcrypt.hash(password, 10);
    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        password: hashed,
        role: "user",
        provider: "local",
        providerId: `local_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`,
      },
    });

    const token = generateToken(String(newUser.id), newUser.role);

    res
      .cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        domain: process.env.NODE_ENV === "production" ? ".licorice4good.com" : undefined,
        path: "/",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      })
      .status(201)
      .json({ user: { ...newUser, password: undefined } });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err });
  }
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    if (!user.password)
      return res.status(400).json({ message: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Invalid credentials" });

    const token = generateToken(String(user.id), user.role);
    res
      .cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        domain: process.env.NODE_ENV === "production" ? ".licorice4good.com" : undefined,
        path: "/",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      })
      .status(200)
      .json({
        user: { ...user, password: undefined },
        token: token,
      });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err });
  }
};

export const forgotPassword = async (req: Request, res: Response) => {
  const { email } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ message: "User not found" });

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const resetTokenExpiry = new Date(Date.now() + 600000); // 10 minutes

    await prisma.user.update({
      where: { email },
      data: {
        resetToken: code,
        resetTokenExpiry,
      },
    });

    await sendResetEmail(email, code);
    res.status(200).json({ message: "Reset code sent to your email" });
  } catch (err) {
    res.status(500).json({ message: "Error sending email", error: err });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  // Accept both "newPassword" (backend contract) and "password" (frontend alias)
  const { code, newPassword, password } = req.body as {
    code?: string;
    newPassword?: string;
    password?: string;
  };
  const nextPassword = newPassword || password;
  try {
    if (!code || !nextPassword) {
      return res
        .status(400)
        .json({ message: "Reset code and new password are required" });
    }
    const user = await prisma.user.findFirst({
      where: {
        resetToken: code,
        resetTokenExpiry: { gt: new Date() },
      },
    });

    if (!user)
      return res.status(400).json({ message: "Invalid or expired code" });

    const hashed = await bcrypt.hash(nextPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashed,
        resetToken: null,
        resetTokenExpiry: null,
      },
    });

    res.status(200).json({ message: "Password reset successful" });
  } catch (err) {
    console.error("Error resetting password:", err);
    res.status(500).json({ message: "Error resetting password" });
  }
};

export const logout = (req: Request, res: Response) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    domain: process.env.NODE_ENV === "production" ? ".licorice4good.com" : undefined,
    path: "/",
  });
  res.status(200).json({ message: "Logged out successfully", user: null });
};

export const me = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        provider: true,
        role: true,
      },
    });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};
