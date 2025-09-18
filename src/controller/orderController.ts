import { Request, Response } from "express";
import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();

// Create order from cart or direct order items (checkout)
export const createOrder = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    // Verify user exists in database
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, email: true, isVerified: true },
    });

    if (!dbUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const {
      shippingAddress,
      orderNotes,
      orderItems,
      total: requestTotal,
    } = req.body;

    // Shipping address validation - allow empty since Stripe will collect it
    // If shippingAddress is provided, validate it, otherwise allow empty (Stripe will collect)
    if (shippingAddress && typeof shippingAddress === 'object') {
      const { street, city, state, zipCode, country } = shippingAddress;
      
      // If any field is provided, all required fields must be provided
      if (street || city || state || zipCode || country) {
        if (!street || !city || !state || !zipCode || !country) {
          return res.status(400).json({
            message: "All shipping address fields are required: street, city, state, zipCode, and country",
          });
        }

        if (street.trim() === '' || city.trim() === '' || state.trim() === '' || zipCode.trim() === '') {
          return res.status(400).json({
            message: "Shipping address fields cannot be empty",
          });
        }
      }
    }

    let orderItemsToCreate: any[] = [];
    let calculatedTotal = 0;
    let cartLines: any[] = []; // Store cart lines for inventory updates

    // Check if frontend sent orderItems directly (new approach)
    if (orderItems && Array.isArray(orderItems) && orderItems.length > 0) {
      console.log("Creating order from direct orderItems:", orderItems);

      // Validate and process direct order items
      for (const item of orderItems) {
        if (!item.productId || !item.quantity || !item.price) {
          return res.status(400).json({
            message:
              "Invalid order item: productId, quantity, and price are required",
          });
        }

        // Verify product exists and has sufficient stock
        const product = await prisma.product.findUnique({
          where: { id: item.productId, isActive: true },
        });

        if (!product) {
          return res.status(400).json({
            message: `Product not found: ${item.productId}`,
          });
        }

        if (product.stock < item.quantity) {
          return res.status(400).json({
            message: `Insufficient stock for ${product.name}. Available: ${product.stock}, Requested: ${item.quantity}`,
          });
        }

        const itemTotal = item.price * item.quantity;
        orderItemsToCreate.push({
          productId: item.productId,
          quantity: item.quantity,
          price: item.price,
          total: itemTotal,
        });

        calculatedTotal += itemTotal;
      }
    } else {
      // 3-PACK CART APPROACH - Convert CartLine items to OrderItems
      console.log("Creating order from 3-pack cart");

      cartLines = await prisma.cartLine.findMany({
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

      if (cartLines.length === 0) {
        return res
          .status(400)
          .json({ message: "Cart is empty and no order items provided" });
      }

      // Check stock availability for cart lines
      for (const cartLine of cartLines) {
        if (cartLine.packRecipe) {
          // Handle predefined recipes
          for (const item of cartLine.packRecipe.items) {
            const inventory = item.flavor.inventory;
            if (!inventory) {
              return res.status(400).json({
                message: `No inventory found for flavor: ${item.flavor.name}`,
              });
            }

            const required = item.quantity * cartLine.quantity;
            const available =
              inventory.onHand - inventory.reserved - inventory.safetyStock;

            if (available < required) {
              return res.status(400).json({
                message: `Insufficient stock for ${item.flavor.name}. Available: ${available}, Required: ${required}`,
              });
            }
          }
        } else if (cartLine.flavorIds.length > 0) {
          // Handle custom packs
          const flavors = await prisma.flavor.findMany({
            where: { id: { in: cartLine.flavorIds } },
            include: { inventory: true },
          });

          for (const flavor of flavors) {
            const inventory = flavor.inventory;
            if (!inventory) {
              return res.status(400).json({
                message: `No inventory found for flavor: ${flavor.name}`,
              });
            }

            const available =
              inventory.onHand - inventory.reserved - inventory.safetyStock;

            if (available < cartLine.quantity) {
              return res.status(400).json({
                message: `Insufficient stock for ${flavor.name}. Available: ${available}, Required: ${cartLine.quantity}`,
              });
            }
          }
        }
      }

      // Convert cart lines to order items
      orderItemsToCreate = cartLines.map((cartLine) => ({
        productId: cartLine.productId,
        quantity: cartLine.quantity,
        price: cartLine.unitPrice,
        total: cartLine.quantity * cartLine.unitPrice,
      }));

      calculatedTotal = cartLines.reduce(
        (sum, cartLine) => sum + (cartLine.quantity * cartLine.unitPrice),
        0
      );

      // Clear the cart after successful order creation
      await prisma.cartLine.deleteMany({
        where: { userId: user.id },
      });
    }

    // Use provided total or calculated total
    const finalTotal = requestTotal || calculatedTotal;

    // Create order and order items
    const order = await prisma.order.create({
      data: {
        userId: user.id,
        total: finalTotal,
        shippingAddress,
        orderNotes,
        orderItems: {
          create: orderItemsToCreate,
        },
      },
      include: {
        orderItems: true,
      },
    });

    // Update inventory for all order items
    for (const item of orderItemsToCreate) {
      try {
        // For 3-pack products, we need to deduct from flavor inventory
        if (item.productId === "3-pack") {
          // Get the cart line to find flavor details
          const cartLine = cartLines.find(cl => cl.productId === item.productId);
          
          if (cartLine?.packRecipe) {
            // Handle predefined recipes
            for (const recipeItem of cartLine.packRecipe.items) {
              await prisma.flavorInventory.update({
                where: { flavorId: recipeItem.flavor.id },
                data: {
                  onHand: {
                    decrement: recipeItem.quantity * item.quantity,
                  },
                  reserved: {
                    decrement: recipeItem.quantity * item.quantity,
                  },
                },
              });
            }
          } else if (cartLine?.flavorIds.length > 0) {
            // Handle custom packs
            for (const flavorId of cartLine.flavorIds) {
              await prisma.flavorInventory.update({
                where: { flavorId },
                data: {
                  onHand: {
                    decrement: item.quantity,
                  },
                  reserved: {
                    decrement: item.quantity,
                  },
                },
              });
            }
          }
        } else {
          // Handle regular products
          await prisma.product.update({
            where: { id: item.productId },
            data: {
              stock: {
                decrement: item.quantity,
              },
            },
          });
        }
      } catch (error) {
        console.warn(
          `Could not update inventory for product ${item.productId}:`,
          error
        );
      }
    }

    // SINGLE PRODUCT CART CLEARING - COMMENTED OUT (ONLY USING 3-PACK CART)
    /*
    // Clear user's cart only if we used cart-based approach
    if (!orderItems || orderItems.length === 0) {
      await prisma.cartItem.deleteMany({
        where: { userId: user.id },
      });
    }
    */

    res.status(201).json({
      message: "Order created successfully",
      order,
    });
  } catch (err) {
    console.error("Create order error:", err);
    res.status(500).json({ message: "Error creating order" });
  }
};

// Get user's orders
export const getUserOrders = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { status, page = 1, limit = 10 } = req.query;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = { userId: user.id };
    if (status) {
      where.status = status;
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: "desc" },
        include: {
          orderItems: {
            include: {
              product: true,
            },
          },
        },
      }),
      prisma.order.count({ where }),
    ]);

    res.json({
      orders,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        pages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Error fetching orders" });
  }
};

// Get order by ID
export const getOrderById = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;

    const order = await prisma.order.findFirst({
      where: {
        id,
        userId: user.id,
      },
      include: {
        orderItems: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.json(order);
  } catch (err) {
    res.status(500).json({ message: "Error fetching order" });
  }
};

// Update order status (Admin only)
export const updateOrderStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, paymentStatus } = req.body;

    // Check if user is admin
    const user = (req as any).user;
    if (user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    const order = await prisma.order.update({
      where: { id },
      data: {
        status,
        paymentStatus,
      },
    });

    res.json({ message: "Order status updated successfully", order });
  } catch (err) {
    console.error("Update order status error:", err);
    res.status(500).json({ message: "Error updating order status" });
  }
};

// Get all orders (Admin only)
export const getAllOrders = async (req: Request, res: Response) => {
  try {
    // Check if user is admin
    const user = (req as any).user;
    if (user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    const { status, paymentStatus, page = 1, limit = 10 } = req.query;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = {};
    if (status) where.status = status;
    if (paymentStatus) where.paymentStatus = paymentStatus;

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          orderItems: {
            include: {
              product: true,
            },
          },
        },
      }),
      prisma.order.count({ where }),
    ]);

    res.json({
      orders,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        pages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Error fetching orders" });
  }
};
