import { Router } from "express";
import { col } from "../db.js";
import { verifyToken, verifyCustomer, verifyTechnician } from "../middleware/auth.js";
import { isOid, oid } from "../helpers.js";

const r = Router();
const ACTIVE = ["requested", "accepted", "in-progress"];
// Challenge 3: the only allowed transitions for the technician
const NEXT = { requested: ["accepted", "rejected"], accepted: ["in-progress"], "in-progress": ["completed"] };

// Customer: create a repair request
r.post("/", verifyToken, verifyCustomer, async (req, res) => {
  const { serviceId, customerPhone, address, preferredDate, problemDescription } = req.body;
  if (!isOid(serviceId)) return res.status(400).json({ message: "Invalid service" });
  if (!String(customerPhone || "").trim() || !String(address || "").trim())
    return res.status(400).json({ message: "Phone and address are required" });
  if (String(problemDescription || "").trim().length < 20)
    return res.status(400).json({ message: "Problem description must be at least 20 characters" });

  const date = new Date(preferredDate);
  const min = new Date(Date.now() - 24 * 3600 * 1000); // tolerance for timezones
  min.setUTCHours(0, 0, 0, 0);
  if (isNaN(date) || date < min)
    return res.status(400).json({ message: "Preferred date must be today or a future date" });

  const service = await (await col("services")).findOne({ _id: oid(serviceId) });
  if (!service || service.approvalStatus !== "approved" || !service.isAvailable)
    return res.status(404).json({ message: "Service not available" });
  if (service.technicianEmail === req.user.email)
    return res.status(400).json({ message: "You cannot request your own service" });

  const c = await col("bookings");
  const dup = await c.findOne({
    serviceId: String(service._id),
    customerEmail: req.user.email,
    status: { $in: ACTIVE },
  });
  if (dup) return res.status(409).json({ message: "You already have an active request for this service" });

  const now = new Date();
  const doc = {
    serviceId: String(service._id),
    serviceTitle: service.title,
    serviceImage: service.image,
    category: service.category,
    basePrice: service.basePrice,
    technicianName: service.technicianName,
    technicianEmail: service.technicianEmail,
    customerName: req.user.name,
    customerEmail: req.user.email,
    customerPhone: String(customerPhone).trim(),
    address: String(address).trim(),
    preferredDate: date,
    problemDescription: String(problemDescription).trim(),
    status: "requested",
    finalAmount: service.basePrice,
    paymentStatus: "unpaid",
    statusHistory: [{ status: "requested", changedAt: now }],
    createdAt: now,
  };
  const result = await c.insertOne(doc);
  res.status(201).json({ ...doc, _id: result.insertedId });
});

// Customer: own bookings only
r.get("/my", verifyToken, verifyCustomer, async (req, res) => {
  const c = await col("bookings");
  res.json(await c.find({ customerEmail: req.user.email }).sort({ createdAt: -1 }).toArray());
});

// Customer: cancel only while 'requested'
r.patch("/:id/cancel", verifyToken, verifyCustomer, async (req, res) => {
  if (!isOid(req.params.id)) return res.status(400).json({ message: "Invalid id" });
  const c = await col("bookings");
  const b = await c.findOne({ _id: oid(req.params.id) });
  if (!b) return res.status(404).json({ message: "Booking not found" });
  if (b.customerEmail !== req.user.email) return res.status(403).json({ message: "Forbidden" });
  if (b.status !== "requested")
    return res.status(400).json({ message: "Only a requested job can be cancelled" });
  await c.updateOne(
    { _id: b._id },
    { $set: { status: "cancelled" }, $push: { statusHistory: { status: "cancelled", changedAt: new Date() } } }
  );
  res.json({ message: "Booking cancelled" });
});

// Technician: only own jobs
r.get("/technician", verifyToken, verifyTechnician, async (req, res) => {
  const filter = { technicianEmail: req.user.email };
  if (req.query.status) filter.status = String(req.query.status);
  const c = await col("bookings");
  res.json(await c.find(filter).sort({ createdAt: -1 }).toArray());
});

// Technician: status pipeline
r.patch("/:id/status", verifyToken, verifyTechnician, async (req, res) => {
  if (!isOid(req.params.id)) return res.status(400).json({ message: "Invalid id" });
  const { status, finalAmount } = req.body;
  const c = await col("bookings");
  const b = await c.findOne({ _id: oid(req.params.id) });
  if (!b) return res.status(404).json({ message: "Booking not found" });
  if (b.technicianEmail !== req.user.email) return res.status(403).json({ message: "Forbidden" });

  const allowed = NEXT[b.status] || [];
  if (!allowed.includes(status))
    return res.status(400).json({ message: `Cannot change status from '${b.status}' to '${status}'` });

  const set = { status };
  if (status === "completed") {
    const amount = Number(finalAmount);
    if (!(amount > 0)) return res.status(400).json({ message: "finalAmount must be a number greater than 0" });
    set.finalAmount = amount;
  }
  await c.updateOne(
    { _id: b._id },
    { $set: set, $push: { statusHistory: { status, changedAt: new Date() } } }
  );
  res.json({ message: `Job marked as ${status}` });
});

export default r;
