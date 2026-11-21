import { createRemoteJWKSet, jwtVerify } from "jose";
import { col } from "../db.js";

const clientUrl = (process.env.CLIENT_URL || "http://localhost:3000").split(",")[0].trim();
const JWKS = createRemoteJWKSet(new URL(`${clientUrl}/api/auth/jwks`));

// 401 if token missing/invalid. Role is always read from the DB (never trusted from the token).
export const verifyToken = async (req, res, next) => {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return res.status(401).json({ message: "Unauthorized" });
  try {
    const { payload } = await jwtVerify(header.slice(7), JWKS);
    const users = await col("users");
    const user = await users.findOne({ email: payload.email });
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    req.user = { id: String(user._id), email: user.email, name: user.name, role: user.role || "customer" };
    next();
  } catch (e) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

// 403 if logged in but wrong role
const requireRole = (role) => (req, res, next) =>
  req.user?.role === role ? next() : res.status(403).json({ message: "Forbidden" });

export const verifyCustomer = requireRole("customer");
export const verifyTechnician = requireRole("technician");
export const verifyAdmin = requireRole("admin");
