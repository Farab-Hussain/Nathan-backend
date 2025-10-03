import { Request, Response } from "express";
import { PrismaClient } from "../generated/prisma";
import fs from "fs";
import path from "path";
import {
  getAvailableCategories,
  getAvailableFlavors,
  generateFlavorCode,
  generateCategoryCode,
} from "../utils/skuGenerator";

const prisma = new PrismaClient();

// Helper function to delete image file
const deleteImageFile = (imageUrl: string | null) => {
  if (!imageUrl) return;

  try {
    const imagePath = path.join(process.cwd(), imageUrl);
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }
  } catch (error) {
    console.error("Error deleting image file:", error);
  }
};

// Helper function to get image filename from URL
const getImageFilename = (imageUrl: string | null): string | null => {
  if (!imageUrl) return null;
  return path.basename(imageUrl);
};

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
    const imageFile = req.file;

    // Handle aliases - could be string (JSON) or array
    let aliasesArray = [];
    if (typeof aliases === "string") {
      try {
        aliasesArray = JSON.parse(aliases);
      } catch {
        aliasesArray = aliases
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean);
      }
    } else if (Array.isArray(aliases)) {
      aliasesArray = aliases;
    }

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
      // Create flavor with optional image
      const newFlavor = await tx.flavor.create({
        data: {
          name: name.trim(),
          aliases: aliasesArray.filter(Boolean),
          active: true,
          imageUrl: imageFile ? `/uploads/flavors/${imageFile.filename}` : null,
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
    const imageFile = req.file;

    // Get the current flavor to check for existing image
    const currentFlavor = await prisma.flavor.findUnique({
      where: { id },
      select: { imageUrl: true },
    });

    if (!currentFlavor) {
      return res.status(404).json({ message: "Flavor not found" });
    }

    // Handle aliases - could be string (JSON) or array
    let aliasesArray = [];
    if (aliases !== undefined) {
      if (typeof aliases === "string") {
        try {
          aliasesArray = JSON.parse(aliases);
        } catch {
          aliasesArray = aliases
            .split(",")
            .map((a) => a.trim())
            .filter(Boolean);
        }
      } else if (Array.isArray(aliases)) {
        aliasesArray = aliases;
      }
    }

    const updateData: any = {
      name: name ? name.trim() : undefined,
      aliases: aliases !== undefined ? aliasesArray.filter(Boolean) : undefined,
      active: active !== undefined ? Boolean(active) : undefined,
    };

    // If a new image is uploaded, update the imageUrl and delete the old one
    if (imageFile) {
      // Delete the old image file if it exists
      if (currentFlavor.imageUrl) {
        deleteImageFile(currentFlavor.imageUrl);
      }
      updateData.imageUrl = `/uploads/flavors/${imageFile.filename}`;
    }

    const flavor = await prisma.flavor.update({
      where: { id },
      data: updateData,
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

    // Get the flavor to check for image before deletion
    const flavor = await prisma.flavor.findUnique({
      where: { id },
      select: { imageUrl: true },
    });

    if (!flavor) {
      return res.status(404).json({ message: "Flavor not found" });
    }

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

    // Delete the image file if it exists
    if (flavor.imageUrl) {
      deleteImageFile(flavor.imageUrl);
    }

    res.json({ message: "Flavor deleted successfully" });
  } catch (err) {
    console.error("Delete flavor error:", err);
    res.status(500).json({ message: "Error deleting flavor" });
  }
};

// Bulk update flavor images (Admin)
export const bulkUpdateFlavorImages = async (req: Request, res: Response) => {
  try {
    const { flavorIds, imageUrl } = req.body;

    if (!flavorIds || !Array.isArray(flavorIds) || flavorIds.length === 0) {
      return res.status(400).json({
        message: "flavorIds array is required and must not be empty",
      });
    }

    if (!imageUrl || typeof imageUrl !== "string") {
      return res.status(400).json({
        message: "imageUrl is required",
      });
    }

    // Update all specified flavors with the new image
    const updateResult = await prisma.flavor.updateMany({
      where: {
        id: {
          in: flavorIds,
        },
      },
      data: {
        imageUrl: imageUrl,
        updatedAt: new Date(),
      },
    });

    res.json({
      message: `Successfully updated ${updateResult.count} flavors with new image`,
      updatedCount: updateResult.count,
      imageUrl: imageUrl,
    });
  } catch (err) {
    console.error("Bulk update flavor images error:", err);
    res.status(500).json({ message: "Error updating flavor images" });
  }
};

// Clean up orphaned flavor images (Admin)
export const cleanupOrphanedImages = async (req: Request, res: Response) => {
  try {
    const uploadsDir = path.join(process.cwd(), "uploads", "flavors");

    if (!fs.existsSync(uploadsDir)) {
      return res.json({
        message: "No uploads directory found",
        deletedCount: 0,
        orphanedFiles: [],
      });
    }

    // Get all image files in the uploads directory
    const imageFiles = fs.readdirSync(uploadsDir);

    // Get all image URLs currently used by flavors
    const flavors = await prisma.flavor.findMany({
      select: { imageUrl: true },
    });

    const usedImageFiles = flavors
      .map((flavor) => getImageFilename(flavor.imageUrl))
      .filter(Boolean);

    // Find orphaned files (files not referenced by any flavor)
    const orphanedFiles = imageFiles.filter(
      (file) => !usedImageFiles.includes(file)
    );

    // Delete orphaned files
    let deletedCount = 0;
    for (const file of orphanedFiles) {
      try {
        const filePath = path.join(uploadsDir, file);
        fs.unlinkSync(filePath);
        deletedCount++;
      } catch (error) {
        console.error(`Error deleting orphaned file ${file}:`, error);
      }
    }

    res.json({
      message: `Cleanup completed. Deleted ${deletedCount} orphaned files.`,
      deletedCount,
      orphanedFiles: orphanedFiles.slice(0, 10), // Show first 10 for reference
    });
  } catch (err) {
    console.error("Cleanup orphaned images error:", err);
    res.status(500).json({ message: "Error cleaning up orphaned images" });
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
    const { onHand, reserved, safetyStock, stock } = req.body;

    // Support both 'stock' and 'onHand' for backward compatibility
    const newOnHand =
      stock !== undefined
        ? parseInt(stock)
        : onHand !== undefined
        ? parseInt(onHand)
        : undefined;

    const inventory = await prisma.flavorInventory.update({
      where: { flavorId: id },
      data: {
        onHand: newOnHand,
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
    // Get all inventory records and filter those where onHand <= safetyStock
    const alerts = await prisma.flavorInventory.findMany({
      include: {
        flavor: true,
      },
      orderBy: { onHand: "asc" },
    });

    // Filter alerts where stock is at or below safety stock level
    const lowStockAlerts = alerts.filter(
      (inventory) => inventory.onHand <= inventory.safetyStock
    );

    res.json({ alerts: lowStockAlerts });
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
