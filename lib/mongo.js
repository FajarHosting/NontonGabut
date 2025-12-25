// lib/mongo.js
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "streaming_app";

if (!uri) throw new Error("MONGODB_URI belum diset");

let cached = global._mongoCached;
if (!cached) cached = global._mongoCached = { client: null, promise: null };

export async function getDb() {
  if (cached.client) return cached.client.db(dbName);

  if (!cached.promise) {
    const client = new MongoClient(uri, {
      maxPoolSize: 10
    });
    cached.promise = client.connect().then((c) => {
      cached.client = c;
      return c;
    });
  }

  const client = await cached.promise;
  return client.db(dbName);
}