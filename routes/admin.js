import { Router } from "express";
import { col } from "../db.js";
import { verifyToken, verifyAdmin } from "../middleware/auth.js";
import { isOid, oid, idFilter } from "../helpers.js";

const r = Router();
r.use(verifyToken, verifyAdmin);

r.get("/stats", async (req, res) => {
  const users = await col("users");
  const services = await col("services");
  const bookings = await col("bookings");
  const payments = await col("payments");
  const [totalUsers, totalTechnicians, pendingServices, byStatus, revenue] = await Promise.all([
    users.countDocuments({}),
    users.countDocuments({ role: "technician" }),
    services.countDocuments({ approvalStatus: "pending" }),
    bookings.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]).toArray(),
    payments.aggregate([{ $group: { _id: null, total: { $sum: "$amount" } } }]).toArray(),
  ]);
  res.json({
    totalUsers,
    totalTechnicians,
    pendingServices,
    totalRevenue: revenue[0]?.total || 0,
    bookingsByStatus: byStatus.map((s) => ({ status: s._id, count: s.count })),
  });
});

r.get("/users", async (req, res) => {
  const users = await col("users");
  res.json(await users.find({}).sort({ createdAt: -1 }).toArray());
});

r.patch("/users/:id/role", async (req, res) => {
  const { role } = req.body;
  if (!["customer", "technician", "admin"].includes(role)) return res.status(400).json({ message: "Invalid role" });
  if (req.params.id === req.user.id) return res.status(400).json({ message: "You cannot change your own role" });
  const result = await (await col("users")).updateOne(idFilter(req.params.id), { $set: { role } });
  if (!result.matchedCount) return res.status(404).json({ message: "User not found" });
  res.json({ message: "Role updated" });
});

r.get("/services", async (req, res) => {
  const filter = {};
  if (req.query.status) filter.approvalStatus = String(req.query.status);
  const items = await (await col("services")).find(filter).sort({ createdAt: -1 }).toArray();
  // pending first
  const rank = { pending: 0, approved: 1, rejected: 2 };
  items.sort((a, b) => rank[a.approvalStatus] - rank[b.approvalStatus]);
  res.json(items);
});

r.patch("/services/:id/approval", async (req, res) => {
  const { approvalStatus } = req.body;
  if (!["approved", "rejected"].includes(approvalStatus)) return res.status(400).json({ message: "Invalid status" });
  if (!isOid(req.params.id)) return res.status(400).json({ message: "Invalid id" });
  const result = await (await col("services")).updateOne({ _id: oid(req.params.id) }, { $set: { approvalStatus } });
  if (!result.matchedCount) return res.status(404).json({ message: "Service not found" });
  res.json({ message: `Service ${approvalStatus}` });
});

r.get("/bookings", async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = String(req.query.status);
  res.json(await (await col("bookings")).find(filter).sort({ createdAt: -1 }).toArray());
});

r.get("/payments", async (req, res) => {
  const items = await (await col("payments")).find({}).sort({ paidAt: -1 }).toArray();
  const totalRevenue = items.reduce((sum, p) => sum + (p.amount || 0), 0);
  res.json({ totalRevenue, items });
});

export default r;
