// Usage: node seed.js tech1@email tech2@email customer@email
// (all three must already be signed up on the site; tech* as Technician, last one as Customer)
import "dotenv/config";
import { col } from "./db.js";

const [t1Email, t2Email, cEmail] = process.argv.slice(2);
if (!t1Email || !t2Email || !cEmail) { console.log("Usage: node seed.js <tech1> <tech2> <customer>"); process.exit(1); }

const users = await col("users");
const services = await col("services");
const bookings = await col("bookings");
const t1 = await users.findOne({ email: t1Email });
const t2 = await users.findOne({ email: t2Email });
const cu = await users.findOne({ email: cEmail });
if (!t1 || !t2 || !cu) { console.log("One of the users was not found. Sign them up first."); process.exit(1); }
await users.updateMany({ email: { $in: [t1Email, t2Email] } }, { $set: { role: "technician" } });
await users.updateOne({ email: cEmail }, { $set: { role: "customer" } });

// Replace these placeholder images with real ImgBB URLs later for a better look
const img = (n) => `https://picsum.photos/seed/fixmate${n}/800/600`;
const data = [
  ["iPhone Screen Replacement", "Smartphone", 89, "2-3 hours", "Home Visit", "Dhanmondi, Dhaka", 1],
  ["Android Battery Replacement", "Smartphone", 45, "1-2 hours", "Shop Drop-off", "Mirpur, Dhaka", 1],
  ["Laptop Deep Cleaning & Servicing", "Laptop & PC", 35, "3 hours", "Shop Drop-off", "Uttara, Dhaka", 2],
  ["Laptop SSD Upgrade & OS Install", "Laptop & PC", 60, "1 day", "Shop Drop-off", "Gulshan, Dhaka", 2],
  ["AC General Servicing", "AC", 30, "2 hours", "Home Visit", "Banani, Dhaka", 1],
  ["AC Gas Refill", "AC", 55, "2-3 hours", "Home Visit", "Mohakhali, Dhaka", 2],
  ["Refrigerator Compressor Repair", "Refrigerator", 70, "1 day", "Home Visit", "Mirpur, Dhaka", 1],
  ["Fridge Not Cooling Diagnosis", "Refrigerator", 25, "1-2 hours", "Home Visit", "Dhanmondi, Dhaka", 2],
  ["LED TV Panel & Backlight Repair", "TV", 80, "1-2 days", "Shop Drop-off", "Uttara, Dhaka", 1],
  ["Smart TV Software Fix", "TV", 20, "1 hour", "Home Visit", "Gulshan, Dhaka", 2],
  ["Washing Machine Drum Repair", "Washing Machine", 50, "3-4 hours", "Home Visit", "Banani, Dhaka", 2],
  ["Washing Machine Not Draining Fix", "Washing Machine", 28, "2 hours", "Home Visit", "Mirpur, Dhaka", 1],
  ["Home Electrical Wiring Check", "Electrical", 40, "2-3 hours", "Home Visit", "Dhanmondi, Dhaka", 2],
  ["Switchboard & Fan Installation", "Electrical", 18, "1-2 hours", "Home Visit", "Mohakhali, Dhaka", 1],
];
const now = Date.now();
const docs = data.map(([title, category, basePrice, estimatedDuration, serviceMode, serviceArea, who], i) => {
  const t = who === 1 ? t1 : t2;
  return {
    title, category, basePrice, estimatedDuration, serviceMode, serviceArea,
    description: `${title}: professional diagnosis and repair by a verified technician. Genuine parts when needed, clear pricing, and a warranty on the work done.`,
    image: img(i + 1),
    technicianName: t.name, technicianEmail: t.email,
    approvalStatus: "approved", isAvailable: true,
    createdAt: new Date(now - i * 3600 * 1000 * 5),
  };
});
await services.deleteMany({ technicianEmail: { $in: [t1Email, t2Email] } });
const inserted = await services.insertMany(docs);
const ids = Object.values(inserted.insertedIds);
const svcs = await services.find({ _id: { $in: ids } }).toArray();

// sample bookings in different statuses
await bookings.deleteMany({ customerEmail: cEmail });
const statuses = [
  ["requested", "unpaid"], ["accepted", "unpaid"], ["in-progress", "unpaid"],
  ["completed", "unpaid"], ["rejected", "unpaid"], ["cancelled", "unpaid"],
];
const bdocs = statuses.map(([status, paymentStatus], i) => {
  const s = svcs[i];
  return {
    serviceId: String(s._id), serviceTitle: s.title, serviceImage: s.image, category: s.category,
    basePrice: s.basePrice, technicianName: s.technicianName, technicianEmail: s.technicianEmail,
    customerName: cu.name, customerEmail: cu.email, customerPhone: "01700000000",
    address: "House 12, Road 5, Dhaka", preferredDate: new Date(now + (i + 1) * 86400000),
    problemDescription: "The device stopped working properly since last week and needs a full check.",
    status, finalAmount: status === "completed" ? s.basePrice + 10 : s.basePrice, paymentStatus,
    statusHistory: [{ status: "requested", changedAt: new Date() }],
    createdAt: new Date(now - i * 3600 * 1000),
  };
});
await bookings.insertMany(bdocs);
console.log(`Seeded ${docs.length} services and ${bdocs.length} bookings`);
process.exit(0);
