"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const stripe_1 = __importDefault(require("stripe"));
const prisma_1 = require("../generated/prisma");
const router = express_1.default.Router();
const prisma = new prisma_1.PrismaClient();
// Lazy Stripe init to allow running without keys in dev/demo
function getStripe() {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key)
        return null;
    return new stripe_1.default(key, { apiVersion: "2024-06-20" });
}
router.post("/create-checkout-session", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const stripe = getStripe();
        if (!stripe) {
            return res.status(503).json({ message: "Stripe not configured" });
        }
        const { orderId, items, successUrl, cancelUrl } = req.body || {};
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ message: "No items provided" });
        }
        const line_items = items.map((it) => ({
            price_data: {
                currency: "usd",
                product_data: { name: String(it.name || "Item") },
                unit_amount: Math.max(0, Math.round(Number(it.price || 0) * 100)),
            },
            quantity: Math.max(1, Number(it.quantity || 1)),
        }));
        const session = yield stripe.checkout.sessions.create({
            mode: "payment",
            line_items,
            success_url: successUrl ||
                `${process.env.CLIENT_URL}/orders/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: cancelUrl || `${process.env.CLIENT_URL}/cart`,
            metadata: orderId ? { orderId: String(orderId) } : undefined,
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
    }
    catch (err) {
        console.error("Stripe session error:", err);
        return res
            .status(500)
            .json({ message: "Failed to create checkout session" });
    }
}));
// Raw body needed for webhook signature verification; define here but mount in server with raw parser
router.post("/webhook", express_1.default.raw({ type: "application/json" }), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const stripe = getStripe();
    if (!stripe) {
        return res.status(503).send("Stripe not configured");
    }
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!sig || !webhookSecret) {
        return res.status(400).send("Missing webhook signature or secret");
    }
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    }
    catch (err) {
        console.error("Webhook signature verification failed:", err);
        return res.status(400).send("Webhook Error");
    }
    try {
        if (event.type === "checkout.session.completed") {
            const session = event.data.object;
            const orderId = (_a = session.metadata) === null || _a === void 0 ? void 0 : _a.orderId;
            if (orderId) {
                const shippingDetails = session.shipping_details || null;
                const customerDetails = session.customer_details || null;
                yield prisma.order.update({
                    where: { id: orderId },
                    data: {
                        paymentStatus: "paid",
                        status: "confirmed",
                        total: session.amount_total ? session.amount_total / 100 : undefined,
                        shippingAddress: shippingDetails || customerDetails || undefined,
                    },
                });
            }
            console.log("Checkout complete for order:", orderId, session.id);
        }
        else if (event.type === "payment_intent.payment_failed") {
            const pi = event.data.object;
            const orderId = (_b = pi.metadata) === null || _b === void 0 ? void 0 : _b.orderId;
            if (orderId) {
                yield prisma.order.update({
                    where: { id: orderId },
                    data: { paymentStatus: "failed" },
                });
            }
            console.warn("Payment failed for order:", orderId, pi.id);
        }
        return res.json({ received: true });
    }
    catch (err) {
        console.error("Webhook handling error:", err);
        return res.status(500).send("Webhook handler error");
    }
}));
exports.default = router;
