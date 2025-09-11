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
      select: { id: true, email: true, isVerified: true }
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

    let orderItemsToCreate = [];
    let calculatedTotal = 0;

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
      // Fallback to cart-based approach (existing approach)
      console.log("Creating order from cart items");

      const cartItems = await prisma.cartItem.findMany({
        where: { userId: user.id },
      });

      if (cartItems.length === 0) {
        return res
          .status(400)
          .json({ message: "Cart is empty and no order items provided" });
      }

      // Check if cart has valid products
      const validCartItems = cartItems.filter(
        (item) => item.productId && item.productId !== "unknown"
      );
      if (validCartItems.length === 0) {
        return res.status(400).json({
          message:
            "Cart contains no valid products. Please add products to cart first.",
        });
      }

      // Check stock availability for cart items
      for (const item of validCartItems) {
        if (item.productId) {
          const product = await prisma.product.findUnique({
            where: { id: item.productId },
          });

          if (product && product.stock < item.quantity) {
            return res.status(400).json({
              message: `Insufficient stock for ${product.name}`,
            });
          }
        }
      }

      // Convert cart items to order items
      orderItemsToCreate = validCartItems.map((item) => ({
        productId: item.productId!,
        quantity: item.quantity,
        price: item.total / item.quantity,
        total: item.total,
      }));

      calculatedTotal = validCartItems.reduce(
        (sum, item) => sum + item.total,
        0
      );
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

    // Update product stock for all order items
    for (const item of orderItemsToCreate) {
      try {
        await prisma.product.update({
          where: { id: item.productId },
          data: {
            stock: {
              decrement: item.quantity,
            },
          },
        });
      } catch (error) {
        console.warn(
          `Could not update stock for product ${item.productId}:`,
          error
        );
      }
    }

    // Clear user's cart only if we used cart-based approach
    if (!orderItems || orderItems.length === 0) {
      await prisma.cartItem.deleteMany({
        where: { userId: user.id },
      });
    }

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
