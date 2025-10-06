import express from "express";
import Stripe from "stripe";
import { PrismaClient } from "../generated/prisma";
import { protect } from "../middlewares/auth.middleware";

const router = express.Router();
const prisma = new PrismaClient();

// Lazy Stripe init to allow running without keys in dev/demo
function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: "2024-06-20" } as any);
}

// Stripe webhook handler (no authentication required)
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
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    console.log("✅ Webhook event verified successfully:", {
      type: event.type,
      id: event.id,
      created: new Date(event.created * 1000).toISOString(),
      livemode: event.livemode,
      apiVersion: event.api_version,
    });
  } catch (err) {
    console.error("❌ Webhook signature verification failed:", err);
    return res.status(400).send(`Webhook signature verification failed: ${err}`);
  }

  try {
    console.log("🎯 Processing webhook event:", event.type);
    
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      console.log("💳 Processing checkout.session.completed:", {
        sessionId: session.id,
        orderId: session.metadata?.orderId,
        isRetry: session.metadata?.isRetry === "true",
        paymentStatus: session.payment_status,
        amountTotal: session.amount_total,
        currency: session.currency,
        customerEmail: session.customer_details?.email,
        paymentIntentId: session.payment_intent,
      });

      if (session.metadata?.orderId) {
        // Update existing order
        const orderId = session.metadata.orderId;
        console.log(`🔄 Updating existing order: ${orderId}`);
        
        await prisma.order.update({
          where: { id: orderId },
          data: {
          paymentStatus: "paid",
          status: "confirmed",
          updatedAt: new Date(),
          },
        });

        console.log("✅ Order updated successfully:", {
          orderId,
          sessionId: session.id,
          status: "confirmed",
          processingTime: Date.now() - webhookStartTime + "ms",
        });

        // Create Shippo shipment for the updated order
        try {
          const updatedOrder = await prisma.order.findUnique({
            where: { id: orderId },
            include: { orderItems: true }
          });

          if (updatedOrder && updatedOrder.shippingAddress) {
            const shippingAddress = updatedOrder.shippingAddress as any;
            const { getShippingRates, createShipment } = await import("../services/shippoService");
            
            console.log("🔍 Getting shipping rates for updated order address:", {
              name: shippingAddress.name,
              street1: shippingAddress.street1,
              city: shippingAddress.city,
              state: shippingAddress.state,
              zip: shippingAddress.zip,
              country: shippingAddress.country,
            });
            
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
      } else if (session.metadata?.orderData) {
        // Create new order from metadata (ONLY after successful payment)
        console.log("🆕 Creating order from payment metadata - PAYMENT SUCCESSFUL");
        
        try {
          const compressedData = JSON.parse(session.metadata.orderData);
          const authenticatedUserId = session.metadata.authenticatedUserId;
          const authenticatedUserEmail = session.metadata.authenticatedUserEmail;
          
          if (!authenticatedUserId) {
            console.error("❌ No authenticated user ID in session metadata");
            return res.status(400).json({ error: "Authenticated user ID required" });
          }

          // Use the authenticated user ID directly (no need to find by email)
          const user = await prisma.user.findUnique({
            where: { id: authenticatedUserId }
          });

          if (!user) {
            console.error("❌ Authenticated user not found:", authenticatedUserId);
            return res.status(404).json({ error: "Authenticated user not found" });
          }

          console.log("👤 Using authenticated user for order creation:", {
            userId: user.id,
            email: user.email,
            authenticatedEmail: authenticatedUserEmail,
            stripeEmail: session.customer_details?.email,
            provider: user.provider,
            createdAt: user.createdAt
          });

          // Reconstruct full order data
          // Use Stripe email for shipping but authenticated user for order ownership
          const stripeEmail = session.customer_details?.email || compressedData.address?.email;
          const stripeName = session.customer_details?.name || compressedData.address?.name;
          
          // Debug: Log the full session to see what's available
          console.log("🔍 Stripe session debug:", {
            hasShipping: !!(session as any).shipping,
            hasCustomerDetails: !!session.customer_details,
            hasShippingDetails: !!(session as any).shipping_details,
            sessionKeys: Object.keys(session),
            customerDetails: session.customer_details,
            shipping: (session as any).shipping,
            shipping_details: (session as any).shipping_details,
            // Check all possible shipping address locations
            sessionShipping: (session as any).shipping,
            sessionShippingDetails: (session as any).shipping_details,
            sessionShippingAddress: (session as any).shipping_address,
            // Check if shipping address collection was enabled
            shippingAddressCollection: session.shipping_address_collection,
            // Check billing address as fallback
            billingAddress: session.customer_details?.address
          });

          // Get shipping address from Stripe checkout or fallback to metadata
          let shippingAddress;
          
          // Try multiple possible locations for shipping address
          let stripeShipping = null;
          if ((session as any).shipping_details) {
            stripeShipping = (session as any).shipping_details;
            console.log("📍 Found shipping address in shipping_details");
          } else if ((session as any).shipping) {
            stripeShipping = (session as any).shipping;
            console.log("📍 Found shipping address in shipping");
          } else if ((session as any).shipping_address) {
            stripeShipping = (session as any).shipping_address;
            console.log("📍 Found shipping address in shipping_address");
          }
          
          if (stripeShipping && stripeShipping.address) {
            // Use address collected by Stripe checkout
            shippingAddress = {
              name: stripeShipping.name || stripeName,
              email: stripeEmail,
              phone: stripeShipping.phone || '',
              street1: stripeShipping.address.line1 || '',
              street2: stripeShipping.address.line2 || '',
              city: stripeShipping.address.city || '',
              state: stripeShipping.address.state || '',
              zip: stripeShipping.address.postal_code || '',
              country: stripeShipping.address.country || '',
            };
            console.log("📦 Using Stripe-collected shipping address:", shippingAddress);
          } else if (session.customer_details?.address) {
            // Use billing address as shipping address fallback
            const billingAddress = session.customer_details.address;
            shippingAddress = {
              name: session.customer_details.name || stripeName,
              email: stripeEmail,
              phone: session.customer_details.phone || '',
              street1: billingAddress.line1 || '',
              street2: billingAddress.line2 || '',
              city: billingAddress.city || '',
              state: billingAddress.state || '',
              zip: billingAddress.postal_code || '',
              country: billingAddress.country || '',
            };
            console.log("📦 Using billing address as shipping address fallback:", shippingAddress);
          } else if (compressedData.address) {
            // Fallback to address from frontend metadata
            shippingAddress = {
              name: stripeName,
              email: stripeEmail,
              phone: compressedData.address.phone || '',
              street1: compressedData.address.street,
              street2: compressedData.address.street2 || '',
              city: compressedData.address.city,
              state: compressedData.address.state,
              zip: compressedData.address.zip,
              country: compressedData.address.country,
            };
            console.log("📦 Using frontend-provided shipping address:", shippingAddress);
          } else {
            console.error("❌ No shipping address available from Stripe or metadata");
            console.log("🔍 Available session data:", {
              sessionId: session.id,
              customerDetails: session.customer_details,
              metadata: session.metadata,
              compressedData: compressedData
            });
            return res.status(400).json({ error: "Shipping address required" });
          }

          // Validate that we have a complete address
          if (!shippingAddress.street1 || !shippingAddress.city || !shippingAddress.state || !shippingAddress.zip || !shippingAddress.country) {
            console.error("❌ Incomplete shipping address:", shippingAddress);
            console.error("❌ Stripe session shipping data:", {
              shipping: (session as any).shipping,
              shipping_details: (session as any).shipping_details,
              shipping_address: (session as any).shipping_address,
              customer_details: session.customer_details
            });
            return res.status(400).json({ error: "Complete shipping address required" });
          }
          
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
              street: shippingAddress.street1,
              city: shippingAddress.city,
              state: shippingAddress.state,
              zipCode: shippingAddress.zip,
              country: shippingAddress.country,
            }
          };

          // Create order using the orderController to ensure stock reduction
          const { createOrder } = await import("../controller/orderController");
          
          // Create a mock request object for the createOrder function
          const mockReq = {
            user: { id: user.id },
            body: {
              orderItems: orderData.orderItems,
              total: orderData.total,
              shippingAddress: orderData.shippingAddress,
              orderNotes: orderData.orderNotes,
            }
          } as any;
          
          const mockRes = {
            status: (code: number) => ({
              json: (data: any) => {
                if (code >= 400) {
                  throw new Error(`Order creation failed: ${JSON.stringify(data)}`);
                }
                return { statusCode: code, data };
              }
            }),
            json: (data: any) => ({ statusCode: 200, data })
          } as any;
          
          // Call createOrder function to ensure stock reduction
          await createOrder(mockReq, mockRes);
          
          // Get the created order
          const newOrder = await prisma.order.findFirst({
            where: { userId: user.id },
            orderBy: { createdAt: 'desc' },
            include: { orderItems: true }
          });
          
          if (!newOrder) {
            throw new Error('Order creation failed - no order found');
          }

          // Update order status to confirmed and payment status to paid
          const updatedOrder = await prisma.order.update({
            where: { id: newOrder.id },
            data: {
              status: "confirmed",
              paymentStatus: "paid",
            },
            include: { orderItems: true }
          });

          console.log("✅ Order created from payment:", {
            orderId: updatedOrder.id,
            status: updatedOrder.status,
            paymentStatus: updatedOrder.paymentStatus,
            total: updatedOrder.total,
          });

          // Create Shippo shipment for the new order
          try {
            const { getShippingRates, createShipment } = await import("../services/shippoService");
            
            // Convert address format for Shippo service
            const shippoAddress = {
              name: shippingAddress.name,
              street1: shippingAddress.street1,
              street2: shippingAddress.street2,
              city: shippingAddress.city,
              state: shippingAddress.state,
              zip: shippingAddress.zip,
              country: shippingAddress.country,
              email: shippingAddress.email,
              phone: shippingAddress.phone,
            };
            
            console.log("🔍 Getting shipping rates for address:", {
              name: shippoAddress.name,
              street1: shippoAddress.street1,
              city: shippoAddress.city,
              state: shippoAddress.state,
              zip: shippoAddress.zip,
              country: shippoAddress.country,
            });
            
            // First get shipping rates
            const rates = await getShippingRates(
              shippoAddress,
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
                toAddress: shippoAddress,
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
            console.error("⚠️ Failed to create Shippo shipment for new order:", shipmentError);
            // Don't fail the webhook for shipment errors
          }
        } catch (orderError) {
          console.error("❌ Failed to create order from payment metadata:", orderError);
          return res.status(500).json({ error: "Failed to create order" });
        }
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

      if (charge.payment_intent) {
        // Find the checkout session associated with this payment intent
        const sessions = await stripe.checkout.sessions.list({
          limit: 100,
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

// Protected routes (require authentication)
router.use(protect);

router.post("/create-checkout-session", async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({ message: "Stripe not configured" });
    }

    // Get authenticated user (middleware ensures this exists)
    const user = (req as any).user;

    // Get user details from database
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, email: true, name: true }
    });

    if (!dbUser) {
      return res.status(404).json({ message: "User not found" });
    }

    console.log("👤 Creating checkout session for user:", {
      userId: dbUser.id,
      email: dbUser.email,
      name: dbUser.name
    });

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
    const metadata: any = {
      // Always store the authenticated user ID
      authenticatedUserId: dbUser.id,
      authenticatedUserEmail: dbUser.email
    };
    
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
        // Address will be collected by Stripe checkout
        address: orderData.shippingAddress || {
          name: '',
          email: '',
          phone: '',
          street: '',
          city: '',
          state: '',
          zip: '',
          country: '',
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
      // Pre-fill customer email with authenticated user's email
      customer_email: dbUser.email || undefined,
      // Enable shipping address collection (required)
      shipping_address_collection: {
        allowed_countries: ["US", "CA"],
      },
      // Add billing address collection as well
      billing_address_collection: "required",
      // Add shipping options
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

export default router;