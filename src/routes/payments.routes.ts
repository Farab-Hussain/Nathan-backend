import express from "express";
import Stripe from "stripe";
import { PrismaClient } from "../generated/prisma";

const router = express.Router();
const prisma = new PrismaClient();

// Lazy Stripe init to allow running without keys in dev/demo
function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: "2024-06-20" } as any);
}

router.post("/create-checkout-session", async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({ message: "Stripe not configured" });
    }

    const { orderId, orderData, items, successUrl, cancelUrl } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "No items provided" });
    }

    const line_items = items.map((it: any) => ({
      price_data: {
        currency: "usd",
        product_data: { name: String(it.productName || it.name || "Item") },
        unit_amount: Math.max(0, Math.round(Number(it.price || 0) * 100)),
      },
      quantity: Math.max(1, Number(it.quantity || 1)),
    }));

    // Store order data in Stripe metadata for webhook processing
    // NO order created in database until successful payment
    const metadata: any = {};
    
    if (orderId) {
      // Existing order (retry payment)
      metadata.orderId = String(orderId);
    } else if (orderData) {
      // New order - store compressed data in metadata
      // We'll create the order ONLY after successful payment in webhook
      const compressedData = {
        total: orderData.total,
        notes: orderData.orderNotes,
        items: orderData.orderItems.map((item: any) => ({
          pid: item.productId,
          qty: item.quantity,
          price: item.price,
          total: item.total,
          flavors: item.flavorIds || [],
          custom: item.customPackName || null,
        })),
        address: {
          name: orderData.shippingAddress.name,
          email: orderData.shippingAddress.email,
          phone: orderData.shippingAddress.phone,
          street: orderData.shippingAddress.street,
          city: orderData.shippingAddress.city,
          state: orderData.shippingAddress.state,
          zip: orderData.shippingAddress.zipCode,
          country: orderData.shippingAddress.country,
        }
      };
      
      const dataString = JSON.stringify(compressedData);
      if (dataString.length > 500) {
        return res.status(400).json({ message: "Order data too large for Stripe metadata" });
      }
      
      metadata.orderData = dataString;
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      success_url:
        successUrl ||
        `${process.env.CLIENT_URL}/orders/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${process.env.CLIENT_URL}/cart`,
      metadata,
      shipping_address_collection: {
        allowed_countries: ["US", "CA"],
      },
      shipping_options: [
        {
          shipping_rate_data: {
            display_name: "Standard Shipping",
            type: "fixed_amount",
            fixed_amount: { amount: 0, currency: "usd" },
          },
        },
      ],
    });

    return res.json({ url: session.url });
  } catch (err) {
    console.error("Stripe session error:", err);
    return res
      .status(500)
      .json({ message: "Failed to create checkout session" });
  }
});

router.post("/retry-payment", async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({ message: "Stripe not configured" });
    }

    const { orderId, successUrl, cancelUrl } = req.body || {};
    if (!orderId) {
      return res.status(400).json({ message: "Order ID is required" });
    }

    // Fetch the existing order with its items
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        orderItems: true,
      },
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Check if order payment is actually failed
    if (order.paymentStatus !== "failed") {
      return res.status(400).json({
        message: "Can only retry payment for failed orders",
        currentStatus: order.paymentStatus,
      });
    }

    // Convert order items to Stripe line items
    const line_items = order.orderItems.map((item: any) => ({
      price_data: {
        currency: "usd",
        product_data: {
          name: String(item.productName || item.productId || "Item"),
          description: item.isCustomPack
            ? `Custom 3-Pack: ${item.flavorIds?.join(", ") || "Custom flavors"}`
            : undefined,
        },
        unit_amount: Math.max(0, Math.round(Number(item.price || 0) * 100)),
      },
      quantity: Math.max(1, Number(item.quantity || 1)),
    }));

    // Create new Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      success_url:
        successUrl ||
        `${process.env.CLIENT_URL}/orders/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${process.env.CLIENT_URL}/profile`,
      metadata: {
        orderId: String(orderId),
        isRetry: "true",
      },
      shipping_address_collection: {
        allowed_countries: ["US", "CA"],
      },
      shipping_options: [
        {
          shipping_rate_data: {
            display_name: "Standard Shipping",
            type: "fixed_amount",
            fixed_amount: { amount: 0, currency: "usd" },
          },
        },
      ],
    });

    // Update order status to pending while payment is being retried
    await prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: "pending",
        updatedAt: new Date(),
      },
    });

    return res.json({ url: session.url });
  } catch (err) {
    console.error("Payment retry error:", err);
    return res
      .status(500)
      .json({ message: "Failed to create retry payment session" });
  }
});

// Verify payment status for stuck payments
router.post("/verify-payment-status", async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({ message: "Stripe not configured" });
    }

    const { orderId } = req.body;
    if (!orderId) {
      return res.status(400).json({ message: "Order ID is required" });
    }

    // Get order from database
    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // If payment has been pending for more than 1 hour, check with Stripe
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (order.paymentStatus === "pending" && order.updatedAt < oneHourAgo) {
      // Search for recent checkout sessions for this order
      const sessions = await stripe.checkout.sessions.list({
        limit: 10,
      });

      const orderSession = sessions.data.find(
        (session) => session.metadata?.orderId === orderId
      );

      if (orderSession) {
        if (orderSession.payment_status === "paid") {
          // Update order status to paid
          await prisma.order.update({
            where: { id: orderId },
            data: {
              paymentStatus: "paid",
              status: "confirmed",
              updatedAt: new Date(),
            },
          });

          return res.json({
            message: "Payment status updated to paid",
            paymentStatus: "paid",
            fixed: true,
          });
        } else if (orderSession.payment_status === "unpaid") {
          // Payment failed or was cancelled
          await prisma.order.update({
            where: { id: orderId },
            data: {
              paymentStatus: "failed",
              updatedAt: new Date(),
            },
          });

          return res.json({
            message: "Payment status updated to failed",
            paymentStatus: "failed",
            fixed: true,
          });
        }
      } else {
        // No session found, likely expired - mark as failed
        await prisma.order.update({
          where: { id: orderId },
          data: {
            paymentStatus: "failed",
            updatedAt: new Date(),
          },
        });

        return res.json({
          message: "No payment session found, marked as failed",
          paymentStatus: "failed",
          fixed: true,
        });
      }
    }

    return res.json({
      message: "Payment status is current",
      paymentStatus: order.paymentStatus,
      fixed: false,
    });
  } catch (error) {
    console.error("Payment verification error:", error);
    return res.status(500).json({ message: "Failed to verify payment status" });
  }
});

// Stripe webhook handler
router.post("/webhook", async (req, res) => {
  const webhookStartTime = Date.now();
  console.log("🔔 Webhook received:", {
    timestamp: new Date().toISOString(),
    headers: {
      "stripe-signature": req.headers["stripe-signature"] ? "present" : "missing",
      "content-type": req.headers["content-type"],
      "user-agent": req.headers["user-agent"],
    },
    bodySize: req.body ? Buffer.byteLength(req.body) : 0,
    ip: req.ip,
    method: req.method,
    url: req.originalUrl,
  });

  const stripe = getStripe();
  if (!stripe) {
    console.error("❌ Stripe not configured");
    return res.status(503).send("Stripe not configured");
  }

  const sig = req.headers["stripe-signature"] as string | undefined;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  console.log("🔐 Webhook security check:", {
    hasSignature: !!sig,
    hasSecret: !!webhookSecret,
    secretLength: webhookSecret ? webhookSecret.length : 0,
    secretPrefix: webhookSecret ? webhookSecret.substring(0, 10) + "..." : "none",
  });
  
  if (!sig || !webhookSecret) {
    console.error("❌ Missing webhook signature or secret", {
      hasSignature: !!sig,
      hasSecret: !!webhookSecret,
    });
    return res.status(400).send("Missing webhook signature or secret");
  }

  let event: Stripe.Event;
  try {
    console.log("🔍 Verifying webhook signature...");
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      webhookSecret
    );
    console.log("✅ Webhook event verified successfully:", {
      type: event.type,
      id: event.id,
      created: new Date(event.created * 1000).toISOString(),
      livemode: event.livemode,
      apiVersion: event.api_version,
    });
  } catch (err: any) {
    console.error("❌ Webhook signature verification failed:", {
      error: err.message,
      type: err.type,
      detail: err.detail,
      headers: err.headers,
      requestId: err.requestId,
      statusCode: err.statusCode,
      userMessage: err.userMessage,
      charge: err.charge,
      decline_code: err.decline_code,
      payment_intent: err.payment_intent,
      payment_method: err.payment_method,
      payment_method_type: err.payment_method_type,
      setup_intent: err.setup_intent,
      source: err.source,
      header: sig,
      payload: req.body?.toString()
    });
    return res.status(400).send("Webhook Error");
  }

  try {
    console.log(`🎯 Processing webhook event: ${event.type}`);
    
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.orderId;
      const isRetry = session.metadata?.isRetry === "true";

      console.log("💳 Processing checkout.session.completed:", {
        sessionId: session.id,
        orderId,
        isRetry,
        paymentStatus: session.payment_status,
        amountTotal: session.amount_total,
        currency: session.currency,
        customerEmail: session.customer_details?.email,
        paymentIntentId: session.payment_intent,
      });

      if (orderId) {
        console.log(`🔍 Looking up order: ${orderId}`);
        // Verify the order exists
        const existingOrder = await prisma.order.findUnique({
          where: { id: orderId },
        });

        if (!existingOrder) {
          console.error("❌ Order not found for webhook:", orderId);
          return res.status(404).json({ error: "Order not found" });
        }

        console.log("📋 Found existing order:", {
          orderId: existingOrder.id,
          currentStatus: existingOrder.status,
          currentPaymentStatus: existingOrder.paymentStatus,
          currentTotal: existingOrder.total,
          createdAt: existingOrder.createdAt,
        });

        // Handle existing order updates (for retry payments)
        const shippingDetails: any = (session as any).shipping_details || null;
        const customerDetails: any = (session as any).customer_details || null;

        const updateData: any = {
          paymentStatus: "paid",
          status: "confirmed",
          updatedAt: new Date(),
        };

        // Only update total if it's different
        if (session.amount_total && session.amount_total !== Math.round(existingOrder.total * 100)) {
          updateData.total = session.amount_total / 100;
          console.log("💰 Updating order total:", {
            oldTotal: existingOrder.total,
            newTotal: session.amount_total / 100,
            stripeAmount: session.amount_total,
          });
        }

        // Only update shipping address if we have new data
        if (shippingDetails || customerDetails) {
          updateData.shippingAddress = shippingDetails || customerDetails;
          console.log("📦 Updating shipping address:", {
            hasShippingDetails: !!shippingDetails,
            hasCustomerDetails: !!customerDetails,
          });
        }

        console.log("🔄 Updating order with data:", updateData);

        const updatedOrder = await prisma.order.update({
          where: { id: orderId },
          data: updateData,
        });

        console.log("✅ Order updated successfully:", {
          orderId,
          oldStatus: existingOrder.status,
          oldPaymentStatus: existingOrder.paymentStatus,
          newStatus: updatedOrder.status,
          newPaymentStatus: updatedOrder.paymentStatus,
          processingTime: Date.now() - webhookStartTime + "ms",
        });

        // Create Shippo shipment for the updated order if it doesn't exist
        if (!updatedOrder.shipmentId) {
          try {
            const { getShippingRates, createShipment } = await import("../services/shippoService");
            
            // Use the shipping address from the order
            const shippingAddress = updatedOrder.shippingAddress as any;
            if (shippingAddress) {
              // First get shipping rates
              const rates = await getShippingRates(
                shippingAddress,
                [{
                  length: '6',
                  width: '4',
                  height: '2',
                  weight: '0.5',
                  massUnit: 'lb' as const,
                  distanceUnit: 'in' as const,
                }]
              );
              
              if (rates.length > 0) {
                // Use the first rate
                await createShipment({
                  orderId: updatedOrder.id,
                  toAddress: shippingAddress,
                  parcels: [{
                    length: '6',
                    width: '4',
                    height: '2',
                    weight: '0.5',
                    massUnit: 'lb' as const,
                    distanceUnit: 'in' as const,
                  }],
                }, rates[0].objectId);
                console.log("📦 Shippo shipment created for updated order");
              } else {
                console.log("⚠️ No shipping rates available for updated order");
              }
            }
          } catch (shipmentError) {
            console.error("⚠️ Failed to create Shippo shipment for updated order:", shipmentError);
            // Don't fail the webhook for shipment errors
          }
        }
      } else if (session.metadata?.orderData) {
        // Create new order from metadata (ONLY after successful payment)
        console.log("🆕 Creating order from payment metadata - PAYMENT SUCCESSFUL");
        
        try {
          const compressedData = JSON.parse(session.metadata.orderData);
          const customerEmail = session.customer_details?.email;
          
          if (!customerEmail) {
            console.error("❌ No customer email in session");
            return res.status(400).json({ error: "Customer email required" });
          }

          // Find user by email
          const user = await prisma.user.findUnique({
            where: { email: customerEmail },
          });

          if (!user) {
            console.error("❌ User not found for email:", customerEmail);
            return res.status(404).json({ error: "User not found" });
          }

          // Reconstruct full order data
          const orderData = {
            total: compressedData.total,
            orderNotes: compressedData.notes,
            orderItems: compressedData.items.map((item: any) => ({
              productId: item.pid,
              quantity: item.qty,
              price: item.price,
              total: item.total,
              flavorIds: item.flavors,
              customPackName: item.custom,
            })),
            shippingAddress: {
              name: compressedData.address.name,
              email: compressedData.address.email,
              phone: compressedData.address.phone,
              street1: compressedData.address.street,
              city: compressedData.address.city,
              state: compressedData.address.state,
              zip: compressedData.address.zip,
              country: compressedData.address.country,
            }
          };

          // Create order with confirmed status and paid payment status
          const newOrder = await prisma.order.create({
            data: {
              userId: user.id,
              status: "confirmed",
              paymentStatus: "paid",
              total: orderData.total,
              shippingAddress: orderData.shippingAddress,
              orderNotes: orderData.orderNotes,
              orderItems: {
                create: orderData.orderItems.map((item: any) => ({
                  productId: item.productId,
                  quantity: item.quantity,
                  price: item.price,
                  total: item.total,
                  flavorIds: item.flavorIds || [],
                  customPackName: item.customPackName || null,
                })),
              },
            },
            include: {
              orderItems: true,
            },
          });

          console.log("✅ Order created from payment:", {
            orderId: newOrder.id,
            status: newOrder.status,
            paymentStatus: newOrder.paymentStatus,
            total: newOrder.total,
          });

          // Create Shippo shipment for the new order
          try {
            const { getShippingRates, createShipment } = await import("../services/shippoService");
            
            console.log("🔍 Getting shipping rates for address:", {
              name: orderData.shippingAddress.name,
              street1: orderData.shippingAddress.street1,
              city: orderData.shippingAddress.city,
              state: orderData.shippingAddress.state,
              zip: orderData.shippingAddress.zip,
              country: orderData.shippingAddress.country,
            });
            
            // First get shipping rates
            const rates = await getShippingRates(
              orderData.shippingAddress as any,
              [{
                length: '6',
                width: '4',
                height: '2',
                weight: '0.5',
                massUnit: 'lb' as const,
                distanceUnit: 'in' as const,
              }]
            );
            
            console.log("📊 Shippo rates response:", {
              ratesCount: rates.length,
              rates: rates.map(r => ({
                serviceName: r.serviceName,
                carrier: r.carrier,
                amount: r.amount,
                estimatedDays: r.estimatedDays
              }))
            });
            
            if (rates.length > 0) {
              // Use the first rate
              await createShipment({
                orderId: newOrder.id,
                toAddress: orderData.shippingAddress as any,
                parcels: [{
                  length: '6',
                  width: '4',
                  height: '2',
                  weight: '0.5',
                  massUnit: 'lb' as const,
                  distanceUnit: 'in' as const,
                }],
              }, rates[0].objectId);
              console.log("📦 Shippo shipment created for new order");
            } else {
              console.log("⚠️ No shipping rates available for new order");
            }
          } catch (shipmentError) {
            console.error("⚠️ Failed to create Shippo shipment:", shipmentError);
            // Don't fail the webhook for shipment errors
          }

          return res.json({ received: true, orderCreated: true });
        } catch (parseError) {
          console.error("❌ Failed to parse order data:", parseError);
          return res.status(400).json({ error: "Invalid order data" });
        }
      } else {
        console.log("⚠️ No orderId or orderData in session metadata");
        return res.status(400).json({ error: "No order information in session" });
      }
    } else if (event.type === "payment_intent.payment_failed") {
      const pi = event.data.object as Stripe.PaymentIntent;
      const orderId = (pi.metadata as any)?.orderId;
      
      console.log("💥 Processing payment_intent.payment_failed:", {
        paymentIntentId: pi.id,
        orderId,
        failureReason: pi.last_payment_error?.message,
      });

      // If this is an existing order (retry payment), mark it as failed
      if (orderId) {
        try {
        await prisma.order.update({
          where: { id: orderId },
          data: { 
            paymentStatus: "failed",
            updatedAt: new Date(),
          },
        });
          console.log("❌ Order marked as failed:", orderId);
        } catch (updateError) {
          console.error("❌ Failed to update order:", updateError);
        }
      } else {
        console.log("ℹ️ No order to update - order was not created yet (as expected)");
      }
    } else if (event.type === "charge.updated") {
      const charge = event.data.object as Stripe.Charge;
      
      console.log("⚡ Processing charge.updated:", {
        chargeId: charge.id,
        amount: charge.amount,
        status: charge.status,
        paid: charge.paid,
        paymentIntentId: charge.payment_intent,
        currency: charge.currency,
        created: new Date(charge.created * 1000).toISOString(),
      });

      // For charge.updated, we need to find the order by payment intent
      if (charge.payment_intent) {
        console.log(`🔍 Searching for checkout session with payment intent: ${charge.payment_intent}`);
        
        // Search for checkout sessions with this payment intent
        const sessions = await stripe.checkout.sessions.list({
          limit: 10,
        });

        const session = sessions.data.find(
          (s) => s.payment_intent === charge.payment_intent
        );

        if (session && session.metadata?.orderId) {
          const orderId = session.metadata.orderId;
          console.log(`📋 Found session for order: ${orderId}`);
          
          if (charge.status === "succeeded" && charge.paid) {
            console.log(`🔄 Updating order from charge.updated: ${orderId}`);
            await prisma.order.update({
              where: { id: orderId },
              data: {
                paymentStatus: "paid",
                status: "confirmed",
                updatedAt: new Date(),
              },
            });
            console.log("✅ Order updated from charge.updated:", {
              orderId,
              chargeId: charge.id,
              status: "confirmed",
              processingTime: Date.now() - webhookStartTime + "ms",
            });
          } else {
            console.log("ℹ️ Charge not succeeded, skipping order update:", {
              chargeStatus: charge.status,
              chargePaid: charge.paid,
            });
          }
        } else {
          console.warn("⚠️ No session found for payment intent:", charge.payment_intent);
        }
      } else {
        console.warn("⚠️ No payment intent in charge:", charge.id);
      }
    } else {
      console.log("ℹ️ Unhandled webhook event type:", {
        type: event.type,
        id: event.id,
        created: new Date(event.created * 1000).toISOString(),
      });
    }

    console.log("🎉 Webhook processed successfully:", {
      eventType: event.type,
      eventId: event.id,
      totalProcessingTime: Date.now() - webhookStartTime + "ms",
    });

    return res.json({ received: true });
  } catch (err) {
    console.error("❌ Webhook handling error:", {
      error: err,
      eventType: event?.type,
      eventId: event?.id,
      processingTime: Date.now() - webhookStartTime + "ms",
    });
    return res.status(500).json({ error: "Webhook handler error" });
  }
});

// Redirect GET requests to webhook to test endpoint
router.get("/webhook", (req, res) => {
  res.redirect(301, "/payments/webhook-test");
});

// Webhook test endpoint for debugging
router.get("/webhook-test", async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({ message: "Stripe not configured" });
    }

    // Test webhook endpoint accessibility
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    res.json({
      message: "Webhook endpoint is accessible",
      timestamp: new Date().toISOString(),
      hasStripe: !!stripe,
      hasWebhookSecret: !!webhookSecret,
      webhookSecretLength: webhookSecret ? webhookSecret.length : 0,
      webhookSecretPrefix: webhookSecret ? webhookSecret.substring(0, 10) + "..." : "none",
      environment: process.env.NODE_ENV,
    });
  } catch (error) {
    console.error("Webhook test error:", error);
    res.status(500).json({ error: "Webhook test failed" });
  }
});

// Webhook signature test endpoint
router.post("/webhook-signature-test", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({ message: "Stripe not configured" });
    }

    const sig = req.headers["stripe-signature"] as string | undefined;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    console.log("Signature test:", {
      hasSignature: !!sig,
      hasSecret: !!webhookSecret,
      signature: sig,
      bodySize: req.body ? Buffer.byteLength(req.body) : 0,
      bodyType: typeof req.body,
    });

    if (!sig || !webhookSecret) {
      return res.status(400).json({ 
        error: "Missing signature or secret",
        hasSignature: !!sig,
        hasSecret: !!webhookSecret
      });
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        webhookSecret
      );
      
      res.json({
        success: true,
        eventType: event.type,
        eventId: event.id,
        message: "Signature verification successful"
      });
    } catch (err: any) {
      console.error("Signature verification failed:", err);
      res.status(400).json({ 
        error: "Signature verification failed",
        details: err.message
      });
    }
  } catch (error) {
    console.error("Webhook signature test error:", error);
    res.status(500).json({ error: "Webhook signature test failed" });
  }
});

// Bulk payment status fix endpoint (admin only)
router.post("/fix-payment-status", async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({ message: "Stripe not configured" });
    }

    console.log('🔧 Starting bulk payment status fix...');
    
    // Get all orders with pending payment status
    const pendingOrders = await prisma.order.findMany({
      where: {
        paymentStatus: 'pending'
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    console.log(`📊 Found ${pendingOrders.length} orders with pending payment status`);

    if (pendingOrders.length === 0) {
      return res.json({
        message: "No pending orders found",
        fixedCount: 0,
        failedCount: 0,
        noSessionCount: 0,
        totalProcessed: 0
      });
    }

    let fixedCount = 0;
    let failedCount = 0;
    let noSessionCount = 0;

    // Process each pending order
    for (const order of pendingOrders) {
      console.log(`🔍 Checking order ${order.id}...`);
      
      try {
        // Search for checkout sessions with this order ID
        const sessions = await stripe.checkout.sessions.list({
          limit: 50, // Get more sessions to find older ones
        });

        const orderSession = sessions.data.find(
          (session) => session.metadata?.orderId === order.id
        );

        if (!orderSession) {
          console.log(`❌ No Stripe session found for order ${order.id}`);
          
          // If order is older than 24 hours and no session found, mark as failed
          const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
          if (order.createdAt < oneDayAgo) {
            await prisma.order.update({
              where: { id: order.id },
              data: {
                paymentStatus: 'failed',
                updatedAt: new Date(),
              },
            });
            console.log(`🔄 Marked order ${order.id} as failed (no session found, older than 24h)`);
            failedCount++;
          } else {
            console.log(`⏳ Order ${order.id} is recent, keeping as pending`);
            noSessionCount++;
          }
          continue;
        }

        console.log(`📋 Found session ${orderSession.id} for order ${order.id}`);
        console.log(`   Payment status: ${orderSession.payment_status}`);

        // Update order based on session payment status
        if (orderSession.payment_status === 'paid') {
          await prisma.order.update({
            where: { id: order.id },
            data: {
              paymentStatus: 'paid',
              status: 'confirmed',
              updatedAt: new Date(),
            },
          });
          console.log(`✅ Updated order ${order.id} to paid`);
          fixedCount++;
        } else if (orderSession.payment_status === 'unpaid') {
          await prisma.order.update({
            where: { id: order.id },
            data: {
              paymentStatus: 'failed',
              updatedAt: new Date(),
            },
          });
          console.log(`❌ Updated order ${order.id} to failed`);
          failedCount++;
        } else {
          console.log(`⏳ Order ${order.id} session status: ${orderSession.payment_status} - keeping pending`);
          noSessionCount++;
        }

      } catch (error: any) {
        console.error(`❌ Error processing order ${order.id}:`, error.message);
        noSessionCount++;
      }
    }

    const result = {
      message: "Payment status fix completed",
      fixedCount,
      failedCount,
      noSessionCount,
      totalProcessed: pendingOrders.length
    };

    console.log('📈 Fix completed:', result);
    res.json(result);

  } catch (error) {
    console.error('❌ Bulk payment status fix failed:', error);
    res.status(500).json({ 
      error: "Failed to fix payment status",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

export default router;
