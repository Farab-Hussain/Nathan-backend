import { Request, Response } from "express";
import { PrismaClient } from "../generated/prisma";
import {
  getAvailableCategories,
  getAvailableFlavors,
  generateFlavorCode,
  generateCategoryCode,
} from "../utils/skuGenerator";

const prisma = new PrismaClient();

// ==================== FLAVOR MANAGEMENT ====================

// Get all flavors (Admin)
export const getAllFlavors = async (req: Request, res: Response) => {
  try {
    const flavors = await prisma.flavor.findMany({
      orderBy: { name: "asc" },
      include: {
        inventory: true,
        _count: {
          select: {
            productFlavors: true,
            packRecipeItems: true,
          },
        },
      },
    });

    res.json({ flavors });
  } catch (err) {
    console.error("Get all flavors error:", err);
    res.status(500).json({ message: "Error fetching flavors" });
  }
};

// Create new flavor (Admin)
export const createFlavor = async (req: Request, res: Response) => {
  try {
    const { name, aliases = [] } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ message: "Flavor name is required" });
    }

    // Check if flavor already exists
    const existingFlavor = await prisma.flavor.findFirst({
      where: {
        OR: [
          { name: { equals: name.trim(), mode: "insensitive" } },
          { aliases: { has: name.trim() } },
        ],
      },
    });

    if (existingFlavor) {
      return res.status(400).json({ message: "Flavor already exists" });
    }

    const flavor = await prisma.$transaction(async (tx) => {
      // Create flavor
      const newFlavor = await tx.flavor.create({
        data: {
          name: name.trim(),
          aliases: aliases.filter(Boolean),
          active: true,
        },
      });

      // Create inventory entry
      await tx.flavorInventory.create({
        data: {
          flavorId: newFlavor.id,
          onHand: 0,
          reserved: 0,
          safetyStock: 5,
        },
      });

      return newFlavor;
    });

    res.status(201).json({
      message: "Flavor created successfully",
      flavor,
      generatedCode: generateFlavorCode(name.trim()),
    });
  } catch (err) {
    console.error("Create flavor error:", err);
    res.status(500).json({ message: "Error creating flavor" });
  }
};

// Update flavor (Admin)
export const updateFlavor = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, aliases, active } = req.body;

    const flavor = await prisma.flavor.update({
      where: { id },
      data: {
        name: name ? name.trim() : undefined,
        aliases: aliases !== undefined ? aliases.filter(Boolean) : undefined,
        active: active !== undefined ? Boolean(active) : undefined,
      },
    });

    res.json({
      message: "Flavor updated successfully",
      flavor,
      generatedCode: generateFlavorCode(flavor.name),
    });
  } catch (err) {
    console.error("Update flavor error:", err);
    res.status(500).json({ message: "Error updating flavor" });
  }
};

// Delete flavor (Admin)
export const deleteFlavor = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if flavor is used in any products
    const usageCount = await prisma.productFlavor.count({
      where: { flavorId: id },
    });

    if (usageCount > 0) {
      return res.status(400).json({
        message: `Cannot delete flavor. It is used in ${usageCount} product(s).`,
      });
    }

    await prisma.$transaction(async (tx) => {
      // Delete inventory first
      await tx.flavorInventory.deleteMany({
        where: { flavorId: id },
      });

      // Delete flavor
      await tx.flavor.delete({
        where: { id },
      });
    });

    res.json({ message: "Flavor deleted successfully" });
  } catch (err) {
    console.error("Delete flavor error:", err);
    res.status(500).json({ message: "Error deleting flavor" });
  }
};

// ==================== CATEGORY MANAGEMENT ====================

// Get all categories (Admin)
export const getAllCategories = async (req: Request, res: Response) => {
  try {
    const categories = await getAvailableCategories();

    // Get category usage counts
    const categoryStats = await Promise.all(
      categories.map(async (category) => {
        const count = await prisma.product.count({
          where: { category, isActive: true },
        });
        return {
          name: category,
          productCount: count,
          generatedCode: generateCategoryCode(category),
        };
      })
    );

    res.json({ categories: categoryStats });
  } catch (err) {
    console.error("Get all categories error:", err);
    res.status(500).json({ message: "Error fetching categories" });
  }
};

// Create new category (Admin)
export const createCategory = async (req: Request, res: Response) => {
  try {
    const { name } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ message: "Category name is required" });
    }

    // Check if category already exists
    const existingCategory = await prisma.product.findFirst({
      where: {
        category: { equals: name.trim(), mode: "insensitive" },
      },
    });

    if (existingCategory) {
      return res.status(400).json({ message: "Category already exists" });
    }

    res.json({
      message: "Category created successfully",
      category: name.trim(),
      generatedCode: generateCategoryCode(name.trim()),
    });
  } catch (err) {
    console.error("Create category error:", err);
    res.status(500).json({ message: "Error creating category" });
  }
};

// ==================== INVENTORY MANAGEMENT ====================

// Update flavor inventory (Admin)
export const updateFlavorInventory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { onHand, reserved, safetyStock } = req.body;

    const inventory = await prisma.flavorInventory.update({
      where: { flavorId: id },
      data: {
        onHand: onHand !== undefined ? parseInt(onHand) : undefined,
        reserved: reserved !== undefined ? parseInt(reserved) : undefined,
        safetyStock:
          safetyStock !== undefined ? parseInt(safetyStock) : undefined,
      },
    });

    res.json({
      message: "Inventory updated successfully",
      inventory,
    });
  } catch (err) {
    console.error("Update inventory error:", err);
    res.status(500).json({ message: "Error updating inventory" });
  }
};

// Get inventory alerts (Admin)
export const getInventoryAlerts = async (req: Request, res: Response) => {
  try {
    const alerts = await prisma.flavorInventory.findMany({
      where: {
        onHand: {
          lte: prisma.flavorInventory.fields.safetyStock,
        },
      },
      include: {
        flavor: true,
      },
      orderBy: { onHand: "asc" },
    });

    res.json({ alerts });
  } catch (err) {
    console.error("Get inventory alerts error:", err);
    res.status(500).json({ message: "Error fetching inventory alerts" });
  }
};

// ==================== SYSTEM CONFIGURATION ====================

// Get system configuration (Admin)
export const getSystemConfig = async (req: Request, res: Response) => {
  try {
    const config = {
      supportedCategories: process.env.SUPPORTED_CATEGORIES?.split(",") || [
        "Traditional",
        "Sour",
        "Sweet",
      ],
      supportedProductTypes: process.env.SUPPORTED_PRODUCT_TYPES?.split(
        ","
      ) || ["3-pack", "5-pack"],
      defaultPrices: {
        "3-pack": parseFloat(process.env.DEFAULT_3PACK_PRICE || "27.00"),
        "5-pack": parseFloat(process.env.DEFAULT_5PACK_PRICE || "45.00"),
      },
      totalFlavors: await prisma.flavor.count(),
      totalProducts: await prisma.product.count(),
      totalCategories: (await getAvailableCategories()).length,
    };

    res.json({ config });
  } catch (err) {
    console.error("Get system config error:", err);
    res.status(500).json({ message: "Error fetching system configuration" });
  }
};
