// Usage: node make-admin.js admin@example.com
// 1) Sign up that email normally on the site  2) run this to promote it to admin
import "dotenv/config";
import { col, getDB } from "./db.js";

const email = process.argv[2];
if (!email) { console.log("Usage: node make-admin.js <email>"); process.exit(1); }
const users = await col("users");
const r = await users.updateOne({ email }, { $set: { role: "admin" } });
console.log(r.matchedCount ? `${email} is now admin` : "User not found. Sign up first.");
process.exit(0);
