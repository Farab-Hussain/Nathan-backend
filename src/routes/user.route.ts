import { Router } from "express";
import { protect } from "../middlewares/auth.middleware";
import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();
const router = Router();

router.get("/me", protect, async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        provider: true,
      },
    });

    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;