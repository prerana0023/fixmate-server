import "dotenv/config";
import express from "express";
import cors from "cors";
import servicesRoutes from "./routes/services.js";
import bookingsRoutes from "./routes/bookings.js";
import paymentsRoutes, { webhookHandler } from "./routes/payments.js";
import adminRoutes from "./routes/admin.js";
import usersRoutes from "./routes/users.js";

const app = express();

const allowed = [...(process.env.CLIENT_URL || "").split(",").map((s) => s.trim()), "http://localhost:3000"].filter(Boolean);
app.use(cors({ origin: allowed, credentials: true }));

// Stripe webhook needs the RAW body, so it must come BEFORE express.json()
app.post("/api/payments/webhook", express.raw({ type: "application/json" }), webhookHandler);

app.use(express.json());

app.get("/", (req, res) => res.send("FixMate API running"));

app.use("/api/services", servicesRoutes);
app.use("/api/bookings", bookingsRoutes);
app.use("/api/payments", paymentsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/users", usersRoutes);

app.use((req, res) => res.status(404).json({ message: "Route not found" }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
});

if (!process.env.VERCEL) {
  const port = process.env.PORT || 5000;
  app.listen(port, () => console.log(`Server running on port ${port}`));
}

export default app;
