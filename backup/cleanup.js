import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB;
if (!uri || !dbName) {
  console.error("Missing env");
  process.exit(1);
}

const KEEP_DAYS = 90;
const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);

// hapus payment yang sudah diproses (approved/rejected) dan usianya > 90 hari
const r = await db.collection("payments").deleteMany({
  status: { $in: ["approved", "rejected"] },
  createdAt: { $lt: cutoff }
});

console.log("Cleanup payments deleted:", r.deletedCount);
await client.close();