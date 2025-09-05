import { Request, Response } from "express";
import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();

// SKU generation helper (same as in threePackController)
const generateSKU = (
  kind: string,
  items: Array<{ flavor: { name: string }; quantity: number }>
): string => {
  const kindMap: { [key: string]: string } = {
    Traditional: "TRD",
    Sour: "SOR",
    Sweet: "SWE",
  };

  const flavorCodeMap: { [key: string]: string } = {
    "Red Twist": "RED",
    "Blue Raspberry": "BLURAS",
    "Fruit Rainbow": "FRURAI",
    "Green Apple": "GREAPP",
    Watermelon: "WAT",
    Cherry: "CHE",
    "Berry Delight": "BERDEL",
    "Cotton Candy": "COT",
    "Strawberry Banana": "STRBAN",
  };

  const kindCode = kindMap[kind] || "UNK";

  const components = items.map((item) => {
    const flavorCode = flavorCodeMap[item.flavor.name] || "UNK";
    return item.quantity > 1 ? `${flavorCode}x${item.quantity}` : flavorCode;
  });

  return `3P-${kindCode}-${components.join("-")}`;
};

// Add 3-pack to cart
export const addToCart = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { product_id, recipe_id, qty } = req.body;

    // Validate required fields
    if (!product_id || !recipe_id || !qty) {
      return res.status(400).json({
        message:
          "Missing required fields: product_id, recipe_id, and qty are required",
      });
    }

    // Validate product_id is 3-pack
    if (product_id !== "3-pack") {
      return res.status(400).json({
        message: "Only 3-pack products are supported",
      });
    }

    const requestedQty = parseInt(qty);
    if (requestedQty <= 0) {
      return res.status(400).json({
        message: "Quantity must be greater than 0",
      });
    }

    // Get the pack recipe with its items and flavors
    const packRecipe = await prisma.packRecipe.findUnique({
      where: { id: recipe_id },
      include: {
        items: {
          include: {
            flavor: {
              include: {
                inventory: true,
              },
            },
          },
        },
      },
    });

    if (!packRecipe) {
      return res.status(404).json({ message: "Pack recipe not found" });
    }

    if (!packRecipe.active) {
      return res.status(400).json({ message: "Pack recipe is not active" });
    }

    // Validate recipe total = 3
    const totalItems = packRecipe.items.reduce(
      (sum, item) => sum + item.quantity,
      0
    );
    if (totalItems !== 3) {
      return res.status(400).json({
        message: `Invalid recipe: total items is ${totalItems}, must be 3`,
      });
    }

    // Check inventory availability
    for (const item of packRecipe.items) {
      const inventory = item.flavor.inventory[0];
      if (!inventory) {
        return res.status(400).json({
          message: `No inventory found for flavor: ${item.flavor.name}`,
        });
      }

      const required = item.quantity * requestedQty;
      const available =
        inventory.onHand - inventory.reserved - inventory.safetyStock;

      if (available < required) {
        return res.status(400).json({
          message: `Insufficient stock for ${item.flavor.name}. Available: ${available}, Required: ${required}`,
        });
      }
    }

    // Generate SKU
    const sku = generateSKU(packRecipe.kind, packRecipe.items);

    // Check if user already has this recipe in cart
    const existingCartLine = await prisma.cartLine.findFirst({
      where: {
        userId: user.id,
        productId: product_id,
        recipeId: recipe_id,
      },
    });

    let cartLine;
    if (existingCartLine) {
      // Update existing cart line
      cartLine = await prisma.cartLine.update({
        where: { id: existingCartLine.id },
        data: {
          quantity: existingCartLine.quantity + requestedQty,
          unitPrice: 27.0, // Fixed price
        },
        include: {
          packRecipe: {
            include: {
              items: {
                include: {
                  flavor: true,
                },
              },
            },
          },
        },
      });
    } else {
      // Create new cart line
      cartLine = await prisma.cartLine.create({
        data: {
          userId: user.id,
          productId: product_id,
          recipeId: recipe_id,
          quantity: requestedQty,
          unitPrice: 27.0, // Fixed price
          sku: sku,
        },
        include: {
          packRecipe: {
            include: {
              items: {
                include: {
                  flavor: true,
                },
              },
            },
          },
        },
      });
    }

    // Reserve inventory
    for (const item of packRecipe.items) {
      const inventory = item.flavor.inventory[0];
      const reserveAmount = item.quantity * requestedQty;

      await prisma.flavorInventory.update({
        where: { flavorId: item.flavor.id },
        data: {
          reserved: inventory.reserved + reserveAmount,
        },
      });
    }

    res.status(201).json({
      message: "Added to cart",
      cartLine: {
        id: cartLine.id,
        product_id: cartLine.productId,
        recipe_id: cartLine.recipeId,
        recipe_title: cartLine.packRecipe.title,
        quantity: cartLine.quantity,
        unit_price: cartLine.unitPrice,
        total: cartLine.quantity * cartLine.unitPrice,
        sku: cartLine.sku,
      },
    });
  } catch (error) {
    console.error("Error adding to cart:", error);
    res.status(500).json({ message: "Error adding to cart" });
  }
};

// Get user's 3-pack cart
export const getUserCart = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    const cartLines = await prisma.cartLine.findMany({
      where: { userId: user.id },
      include: {
        packRecipe: {
          include: {
            items: {
              include: {
                flavor: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const cart = cartLines.map((line) => ({
      id: line.id,
      product_id: line.productId,
      recipe_id: line.recipeId,
      recipe_title: line.packRecipe.title,
      recipe_kind: line.packRecipe.kind,
      quantity: line.quantity,
      unit_price: line.unitPrice,
      total: line.quantity * line.unitPrice,
      sku: line.sku,
      items: line.packRecipe.items.map((item) => ({
        flavor_id: item.flavor.id,
        flavor_name: item.flavor.name,
        quantity: item.quantity,
      })),
    }));

    const cartTotal = cart.reduce((sum, line) => sum + line.total, 0);

    res.json({
      cart,
      total_items: cartLines.length,
      cart_total: cartTotal,
    });
  } catch (error) {
    console.error("Error fetching cart:", error);
    res.status(500).json({ message: "Error fetching cart" });
  }
};

// Update cart line quantity
export const updateCartLine = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const cartLineId = req.params.id;
    const { qty } = req.body;

    if (!qty || qty <= 0) {
      return res.status(400).json({
        message: "Quantity must be greater than 0",
      });
    }

    // Find the cart line
    const cartLine = await prisma.cartLine.findFirst({
      where: {
        id: cartLineId,
        userId: user.id,
      },
      include: {
        packRecipe: {
          include: {
            items: {
              include: {
                flavor: {
                  include: {
                    inventory: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!cartLine) {
      return res.status(404).json({ message: "Cart line not found" });
    }

    const newQty = parseInt(qty);
    const qtyDifference = newQty - cartLine.quantity;

    if (qtyDifference > 0) {
      // Check if we can add more items
      for (const item of cartLine.packRecipe.items) {
        const inventory = item.flavor.inventory[0];
        const required = item.quantity * qtyDifference;
        const available =
          inventory.onHand - inventory.reserved - inventory.safetyStock;

        if (available < required) {
          return res.status(400).json({
            message: `Insufficient stock for ${item.flavor.name}. Available: ${available}, Required: ${required}`,
          });
        }
      }

      // Reserve additional inventory
      for (const item of cartLine.packRecipe.items) {
        const inventory = item.flavor.inventory[0];
        const reserveAmount = item.quantity * qtyDifference;

        await prisma.flavorInventory.update({
          where: { flavorId: item.flavor.id },
          data: {
            reserved: inventory.reserved + reserveAmount,
          },
        });
      }
    } else if (qtyDifference < 0) {
      // Release inventory
      for (const item of cartLine.packRecipe.items) {
        const inventory = item.flavor.inventory[0];
        const releaseAmount = item.quantity * Math.abs(qtyDifference);

        await prisma.flavorInventory.update({
          where: { flavorId: item.flavor.id },
          data: {
            reserved: Math.max(0, inventory.reserved - releaseAmount),
          },
        });
      }
    }

    // Update cart line
    const updatedCartLine = await prisma.cartLine.update({
      where: { id: cartLineId },
      data: { quantity: newQty },
      include: {
        packRecipe: {
          include: {
            items: {
              include: {
                flavor: true,
              },
            },
          },
        },
      },
    });

    res.json({
      message: "Cart line updated successfully",
      cartLine: {
        id: updatedCartLine.id,
        product_id: updatedCartLine.productId,
        recipe_id: updatedCartLine.recipeId,
        recipe_title: updatedCartLine.packRecipe.title,
        quantity: updatedCartLine.quantity,
        unit_price: updatedCartLine.unitPrice,
        total: updatedCartLine.quantity * updatedCartLine.unitPrice,
        sku: updatedCartLine.sku,
      },
    });
  } catch (error) {
    console.error("Error updating cart line:", error);
    res.status(500).json({ message: "Error updating cart line" });
  }
};

// Remove cart line
export const removeCartLine = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const cartLineId = req.params.id;

    // Find the cart line
    const cartLine = await prisma.cartLine.findFirst({
      where: {
        id: cartLineId,
        userId: user.id,
      },
      include: {
        packRecipe: {
          include: {
            items: {
              include: {
                flavor: {
                  include: {
                    inventory: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!cartLine) {
      return res.status(404).json({ message: "Cart line not found" });
    }

    // Release reserved inventory
    for (const item of cartLine.packRecipe.items) {
      const inventory = item.flavor.inventory[0];
      const releaseAmount = item.quantity * cartLine.quantity;

      await prisma.flavorInventory.update({
        where: { flavorId: item.flavor.id },
        data: {
          reserved: Math.max(0, inventory.reserved - releaseAmount),
        },
      });
    }

    // Delete cart line
    await prisma.cartLine.delete({
      where: { id: cartLineId },
    });

    res.json({ message: "Cart line removed successfully" });
  } catch (error) {
    console.error("Error removing cart line:", error);
    res.status(500).json({ message: "Error removing cart line" });
  }
};

// Clear entire cart
export const clearCart = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    // Get all cart lines for the user
    const cartLines = await prisma.cartLine.findMany({
      where: { userId: user.id },
      include: {
        packRecipe: {
          include: {
            items: {
              include: {
                flavor: {
                  include: {
                    inventory: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // Release all reserved inventory
    for (const cartLine of cartLines) {
      for (const item of cartLine.packRecipe.items) {
        const inventory = item.flavor.inventory[0];
        const releaseAmount = item.quantity * cartLine.quantity;

        await prisma.flavorInventory.update({
          where: { flavorId: item.flavor.id },
          data: {
            reserved: Math.max(0, inventory.reserved - releaseAmount),
          },
        });
      }
    }

    // Delete all cart lines
    await prisma.cartLine.deleteMany({
      where: { userId: user.id },
    });

    res.json({ message: "Cart cleared successfully" });
  } catch (error) {
    console.error("Error clearing cart:", error);
    res.status(500).json({ message: "Error clearing cart" });
  }
};
