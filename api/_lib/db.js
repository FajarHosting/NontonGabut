import { MongoClient } from "mongodb";

let cached = globalThis.__mongo;
if (!cached) cached = globalThis.__mongo = { client: null, db: null };

export async function getDb() {
  if (cached.db) return cached.db;

  const uri = process.env.MONGODB_URI;
  const name = process.env.MONGODB_DB;
  if (!uri || !name) throw new Error("Missing MONGODB_URI or MONGODB_DB");

  const client = new MongoClient(uri);
  await client.connect();
  cached.client = client;
  cached.db = client.db(name);
  return cached.db;
}