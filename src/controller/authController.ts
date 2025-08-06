import jwt from "jsonwebtoken";
import { Request, Response } from "express";
import { PrismaClient } from "../generated/prisma";
import bcrypt from "bcrypt";
import { OAuth2Client } from "google-auth-library";

const prisma = new PrismaClient();

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const secret = process.env.JWT_SECRET;
if (!secret) throw new Error("JWT_SECRET is not defined");

const createToken = (userId: string) => {
  const accessToken = jwt.sign({ userId }, secret, { expiresIn: "15m" });
  const refreshToken = jwt.sign({ userId }, secret, { expiresIn: "7d" });
  return { accessToken, refreshToken };
};

export const register = async (req: Request, res: Response) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ message: "All fields are required" });

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser)
    return res.status(400).json({ message: "User already exists" });

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      provider: "credentials",
      providerId: email,
    },
  });
  const tokens = createToken(user.id);
  res.json({ user, ...tokens });
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: "Missing email or password" });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.password)
    return res.status(401).json({ message: "Invalid credentials" });

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });

  const tokens = createToken(user.id);
  res.json({ user, ...tokens });
};

export const googleOAuth = async (req: Request, res: Response) => {
    const { token } = req.body;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
  
      const payload = ticket.getPayload();
      if (!payload || !payload.email) throw new Error("Invalid Google token");
  
      let user = await prisma.user.findUnique({ where: { providerId: payload.sub } });
  
      if (!user) {
        user = await prisma.user.create({
          data: {
            name: payload.name,
            email: payload.email,
            image: payload.picture,
            provider: "google",
            providerId: payload.sub,
          },
        });
      }
  
      const tokens = createToken(user.id);
      res.json({ user, ...tokens });
    } catch (error) {
      console.error(error);
      res.status(401).json({ message: "Invalid Google token" });
    }
  };