import { MongoClient } from "mongodb";

let client;
let db;

export async function getDB() {
  if (!db) {
    client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    db = client.db(process.env.DB_NAME || "fixmate");
  }
  return db;
}

export const col = async (name) => (await getDB()).collection(name);
