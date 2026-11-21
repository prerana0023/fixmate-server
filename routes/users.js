import { Router } from "express";
import { col } from "../db.js";
import { verifyToken } from "../middleware/auth.js";

const r = Router();

r.get("/me", verifyToken, async (req, res) => {
  const user = await (await col("users")).findOne({ email: req.user.email });
  res.json(user);
});

r.patch("/profile", verifyToken, async (req, res) => {
  const { name, phone, area, bio, image } = req.body;
  if (!String(name || "").trim()) return res.status(400).json({ message: "Name is required" });
  const set = {
    name: String(name).trim(),
    phone: String(phone || "").trim(),
    area: String(area || "").trim(),
    bio: String(bio || "").trim(),
    updatedAt: new Date(),
  };
  if (image) set.image = String(image).trim();
  await (await col("users")).updateOne({ email: req.user.email }, { $set: set });
  res.json({ message: "Profile updated" });
});

export default r;
