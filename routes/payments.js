import { Router } from "express";
import Stripe from "stripe";
import { col } from "../db.js";
import { verifyToken, verifyCustomer } from "../middleware/auth.js";
import { isOid, oid } from "../helpers.js";

const r = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const clientUrl = () => (process.env.CLIENT_URL || "http://localhost:3000").split(",")[0].trim();

// Saves the payment ONCE (safe if the webhook and the success page both call it)
async function savePayment(session) {
  const bookings = await col("bookings");
  const payments = await col("payments");
  await payments.createIndex({ stripeSessionId: 1 }, { unique: true });
  await payments.createIndex({ bookingId: 1 }, { unique: true });

  const bookingId = session.metadata?.bookingId;
  if (!isOid(bookingId)) return null;
  const b = await bookings.findOne({ _id: oid(bookingId) });
  if (!b) return null;

  const doc = {
    bookingId: String(b._id),
    serviceTitle: b.serviceTitle,
    customerName: b.customerName,
    customerEmail: b.customerEmail,
    technicianName: b.technicianName,
    technicianEmail: b.technicianEmail,
    amount: session.amount_total / 100,
    currency: "usd",
    transactionId: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id,
    stripeSessionId: session.id,
    paymentStatus: "paid",
    paidAt: new Date(),
  };
  try {
    await payments.updateOne({ stripeSessionId: session.id }, { $setOnInsert: doc }, { upsert: true });
  } catch (e) {
    if (e.code !== 11000) throw e; // duplicate = already saved, fine
  }
  await bookings.updateOne(
    { _id: b._id, paymentStatus: "unpaid" },
    { $set: { paymentStatus: "paid" }, $push: { statusHistory: { status: "paid", changedAt: new Date() } } }
  );
  return payments.findOne({ stripeSessionId: session.id });
}

// Customer: start Stripe Checkout (amount comes from the DB, never from the client)
r.post("/create-checkout-session", verifyToken, verifyCustomer, async (req, res) => {
  const { bookingId } = req.body;
  if (!isOid(bookingId)) return res.status(400).json({ message: "Invalid booking" });
  const b = await (await col("bookings")).findOne({ _id: oid(bookingId) });
  if (!b) return res.status(404).json({ message: "Booking not found" });
  if (b.customerEmail !== req.user.email) return res.status(403).json({ message: "Forbidden" });
  if (b.status !== "completed" || b.paymentStatus !== "unpaid")
    return res.status(400).json({ message: "Only a completed and unpaid job can be paid" });

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: req.user.email,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(Number(b.finalAmount) * 100),
          product_data: { name: b.serviceTitle },
        },
      },
    ],
    metadata: { bookingId: String(b._id), customerEmail: req.user.email },
    success_url: `${clientUrl()}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${clientUrl()}/payment/cancel`,
  });
  res.json({ url: session.url });
});

// Customer: success page verifies the session and saves the payment
r.get("/verify", verifyToken, verifyCustomer, async (req, res) => {
  const { session_id } = req.query;
  if (!session_id) return res.status(400).json({ message: "session_id is required" });
  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(String(session_id));
  } catch {
    return res.status(400).json({ message: "Invalid session" });
  }
  if (session.metadata?.customerEmail !== req.user.email) return res.status(403).json({ message: "Forbidden" });
  if (session.payment_status !== "paid") return res.status(400).json({ message: "Payment not completed" });
  const payment = await savePayment(session);
  res.json(payment);
});

// Customer: payment history
r.get("/my", verifyToken, verifyCustomer, async (req, res) => {
  const c = await col("payments");
  res.json(await c.find({ customerEmail: req.user.email }).sort({ paidAt: -1 }).toArray());
});

// Challenge 4: Stripe webhook (mounted with express.raw in index.js)
export async function webhookHandler(req, res) {
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers["stripe-signature"],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (e) {
    return res.status(400).send(`Webhook Error: ${e.message}`);
  }
  try {
    if (event.type === "checkout.session.completed" && event.data.object.payment_status === "paid") {
      await savePayment(event.data.object);
    }
    res.json({ received: true });
  } catch (e) {
    res.status(500).json({ message: "Webhook handler failed" });
  }
}

export default r;
