import { Router } from "express";
import { col } from "../db.js";
import { verifyToken, verifyTechnician } from "../middleware/auth.js";
import { isOid, oid } from "../helpers.js";

const r = Router();

export const CATEGORIES = ["Smartphone", "Laptop & PC", "AC", "Refrigerator", "TV", "Washing Machine", "Electrical"];
const MODES = ["Home Visit", "Shop Drop-off"];
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function clean(b) {
  return {
    title: String(b.title || "").trim(),
    category: b.category,
    description: String(b.description || "").trim(),
    image: String(b.image || "").trim(),
    basePrice: Number(b.basePrice),
    estimatedDuration: String(b.estimatedDuration || "").trim(),
    serviceMode: b.serviceMode,
    serviceArea: String(b.serviceArea || "").trim(),
  };
}
function check(s) {
  if (!s.title || !s.description || !s.image || !s.estimatedDuration || !s.serviceArea)
    return "All fields are required";
  if (!CATEGORIES.includes(s.category)) return "Invalid category";
  if (!MODES.includes(s.serviceMode)) return "Invalid service mode";
  if (!(s.basePrice > 0)) return "Base price must be a positive number";
  return null;
}

// ---------- PUBLIC ----------
// Challenge 1: server-side search / filter / sort (+ pagination)
r.get("/", async (req, res) => {
  const { q, category, mode, sort, page = 1, limit = 12 } = req.query;
  const filter = { approvalStatus: "approved", isAvailable: true };
  if (category) filter.category = String(category);
  if (mode) filter.serviceMode = String(mode);
  if (q && String(q).trim()) {
    const rx = new RegExp(escapeRegex(String(q).trim()), "i");
    filter.$or = [{ title: rx }, { category: rx }];
  }
  const sortMap = { "price-asc": { basePrice: 1 }, "price-desc": { basePrice: -1 }, newest: { createdAt: -1 } };
  const p = Math.max(1, parseInt(page) || 1);
  const l = Math.min(48, Math.max(1, parseInt(limit) || 12));
  const c = await col("services");
  const [items, total] = await Promise.all([
    c.find(filter).sort(sortMap[sort] || sortMap.newest).skip((p - 1) * l).limit(l).toArray(),
    c.countDocuments(filter),
  ]);
  res.json({ items, total, page: p, pages: Math.ceil(total / l) });
});

r.get("/latest", async (req, res) => {
  const c = await col("services");
  const items = await c
    .find({ approvalStatus: "approved", isAvailable: true })
    .sort({ createdAt: -1 })
    .limit(6)
    .toArray();
  res.json(items);
});

// ---------- TECHNICIAN (must be before /:id) ----------
r.get("/mine", verifyToken, verifyTechnician, async (req, res) => {
  const c = await col("services");
  res.json(await c.find({ technicianEmail: req.user.email }).sort({ createdAt: -1 }).toArray());
});

r.get("/mine/stats", verifyToken, verifyTechnician, async (req, res) => {
  const services = await col("services");
  const bookings = await col("bookings");
  const email = req.user.email;
  const [totalServices, approvedServices, pendingRequests] = await Promise.all([
    services.countDocuments({ technicianEmail: email }),
    services.countDocuments({ technicianEmail: email, approvalStatus: "approved" }),
    bookings.countDocuments({ technicianEmail: email, status: "requested" }),
  ]);
  res.json({ totalServices, approvedServices, pendingRequests });
});

r.post("/", verifyToken, verifyTechnician, async (req, res) => {
  const s = clean(req.body);
  const err = check(s);
  if (err) return res.status(400).json({ message: err });
  const doc = {
    ...s,
    technicianName: req.user.name,
    technicianEmail: req.user.email,
    approvalStatus: "pending",
    isAvailable: true,
    createdAt: new Date(),
  };
  const result = await (await col("services")).insertOne(doc);
  res.status(201).json({ ...doc, _id: result.insertedId });
});

r.patch("/:id/availability", verifyToken, verifyTechnician, async (req, res) => {
  if (!isOid(req.params.id)) return res.status(400).json({ message: "Invalid id" });
  const result = await (await col("services")).updateOne(
    { _id: oid(req.params.id), technicianEmail: req.user.email },
    { $set: { isAvailable: Boolean(req.body.isAvailable) } }
  );
  if (!result.matchedCount) return res.status(404).json({ message: "Service not found" });
  res.json({ message: "Availability updated" });
});

// Editing sends the service back to admin approval
r.patch("/:id", verifyToken, verifyTechnician, async (req, res) => {
  if (!isOid(req.params.id)) return res.status(400).json({ message: "Invalid id" });
  const s = clean(req.body);
  const err = check(s);
  if (err) return res.status(400).json({ message: err });
  const result = await (await col("services")).updateOne(
    { _id: oid(req.params.id), technicianEmail: req.user.email },
    { $set: { ...s, approvalStatus: "pending" } }
  );
  if (!result.matchedCount) return res.status(404).json({ message: "Service not found" });
  res.json({ message: "Service updated and sent for approval" });
});

r.delete("/:id", verifyToken, verifyTechnician, async (req, res) => {
  if (!isOid(req.params.id)) return res.status(400).json({ message: "Invalid id" });
  const result = await (await col("services")).deleteOne({
    _id: oid(req.params.id),
    technicianEmail: req.user.email,
  });
  if (!result.deletedCount) return res.status(404).json({ message: "Service not found" });
  res.json({ message: "Service deleted" });
});

// ---------- PUBLIC details (last) ----------
r.get("/:id", async (req, res) => {
  if (!isOid(req.params.id)) return res.status(404).json({ message: "Not found" });
  const service = await (await col("services")).findOne({ _id: oid(req.params.id) });
  if (!service || service.approvalStatus !== "approved" || !service.isAvailable)
    return res.status(404).json({ message: "Not found" });
  const tech = await (await col("users")).findOne(
    { email: service.technicianEmail },
    { projection: { name: 1, image: 1, area: 1, bio: 1 } }
  );
  res.json({
    ...service,
    technician: {
      name: tech?.name || service.technicianName,
      image: tech?.image || "",
      area: tech?.area || "",
      bio: tech?.bio || "",
    },
  });
});

export default r;
