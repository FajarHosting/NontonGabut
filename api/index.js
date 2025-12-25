import { MongoClient, ObjectId } from "mongodb";
import bcrypt from "bcryptjs";
import crypto from "crypto";

/** ---------------------------
 *  Helpers: response + body
 *  --------------------------*/
function json(res, code, data) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8") || "{}";
  try { return JSON.parse(raw); } catch { return {}; }
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  header.split(";").forEach(part => {
    const [k, ...v] = part.trim().split("=");
    if (!k) return;
    out[k] = decodeURIComponent(v.join("=") || "");
  });
  return out;
}

function setCookie(res, name, value, { maxAgeSec = 0 } = {}) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax"
  ];
  // Secure recommended on HTTPS (Vercel)
  parts.push("Secure");
  if (maxAgeSec > 0) parts.push(`Max-Age=${maxAgeSec}`);
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearCookie(res, name) {
  res.setHeader("Set-Cookie", `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure`);
}

/** ---------------------------
 *  Mongo connection (cached)
 *  --------------------------*/
let _client, _db;
async function getDb() {
  if (_db) return _db;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Missing MONGODB_URI");
  _client = _client || new MongoClient(uri);
  if (!_client.topology?.isConnected?.()) await _client.connect();
  _db = _client.db(); // default DB from URI OR cluster default
  return _db;
}

/** ---------------------------
 *  Ensure indexes + seed admin
 *  --------------------------*/
let _booted = false;
async function boot() {
  if (_booted) return;
  const db = await getDb();

  // TTL supaya DB tidak cepat penuh:
  // sessions expire otomatis
  await db.collection("sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

  // payments older than 90 days auto delete (ubah jika mau)
  await db.collection("payments").createIndex({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

  // uniqueness user email
  await db.collection("users").createIndex({ email: 1 }, { unique: true });

  // series lookup
  await db.collection("series").createIndex({ type: 1, genres: 1, title: 1 });

  // episodes lookup
  await db.collection("episodes").createIndex({ seriesId: 1, number: 1 });

  // Seed / upsert admin user from env
  const adminEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || "";
  if (!adminEmail || !adminPassword) throw new Error("Missing ADMIN_EMAIL / ADMIN_PASSWORD");

  const passwordHash = bcrypt.hashSync(adminPassword, 10);
  await db.collection("users").updateOne(
    { email: adminEmail },
    {
      $set: {
        email: adminEmail,
        passwordHash,
        role: "admin",
        displayName: "Administrator",
        avatarUrl: "",
        isSubscribed: true,
        subUntil: null,
        updatedAt: new Date()
      },
      $setOnInsert: { createdAt: new Date() }
    },
    { upsert: true }
  );

  _booted = true;
}

/** ---------------------------
 *  Auth: session-based
 *  --------------------------*/
async function getSession(req) {
  const db = await getDb();
  const cookies = parseCookies(req);
  const sid = cookies.sid;
  if (!sid) return null;

  const sess = await db.collection("sessions").findOne({ sid });
  if (!sess) return null;
  if (sess.expiresAt && new Date(sess.expiresAt).getTime() < Date.now()) return null;

  const user = await db.collection("users").findOne({ _id: new ObjectId(sess.userId) });
  if (!user) return null;

  // auto disable subscription if expired
  if (user.subUntil && new Date(user.subUntil).getTime() < Date.now()) {
    await db.collection("users").updateOne(
      { _id: user._id },
      { $set: { isSubscribed: false, subUntil: null }, $currentDate: { updatedAt: true } }
    );
    user.isSubscribed = false;
    user.subUntil = null;
  }

  return { sid, user };
}

function requireMethod(req, res, m) {
  if (req.method !== m) {
    json(res, 405, { ok: false, error: "Method Not Allowed" });
    return false;
  }
  return true;
}

function isAdmin(user) {
  return String(user?.role || "") === "admin";
}

/** ---------------------------
 *  Business rules
 *  --------------------------*/
function calcSubUntil(plan) {
  const now = new Date();
  if (plan === "1w") return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  if (plan === "1m") return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  if (plan === "1y") return new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  return null;
}

const FREE_EP_LIMIT_DEFAULT = 10;

/** ---------------------------
 *  Router
 *  --------------------------*/
export default async function handler(req, res) {
  try {
    await boot();
    const db = await getDb();

    const url = new URL(req.url, `https://${req.headers.host}`);
    const path = url.pathname;

    // Only handle /api/*
    if (!path.startsWith("/api/")) {
      json(res, 404, { ok: false, error: "Not Found" });
      return;
    }

    /** ---------- AUTH ---------- */
    if (path === "/api/auth/register") {
      if (!requireMethod(req, res, "POST")) return;
      const body = await readJson(req);
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const displayName = String(body.displayName || "").trim() || email.split("@")[0];

      if (!email || password.length < 6) {
        json(res, 400, { ok: false, error: "Email wajib & password min 6 karakter" });
        return;
      }

      // prevent registering admin email
      if (email === (process.env.ADMIN_EMAIL || "").trim().toLowerCase()) {
        json(res, 403, { ok: false, error: "Email ini khusus admin" });
        return;
      }

      const passwordHash = bcrypt.hashSync(password, 10);
      await db.collection("users").insertOne({
        email,
        passwordHash,
        role: "user",
        displayName,
        avatarUrl: "",
        isSubscribed: false,
        subUntil: null,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      json(res, 200, { ok: true });
      return;
    }

    if (path === "/api/auth/login") {
      if (!requireMethod(req, res, "POST")) return;
      const body = await readJson(req);
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");

      const user = await db.collection("users").findOne({ email });
      if (!user) {
        json(res, 401, { ok: false, error: "Email / password salah" });
        return;
      }

      const ok = bcrypt.compareSync(password, user.passwordHash || "");
      if (!ok) {
        json(res, 401, { ok: false, error: "Email / password salah" });
        return;
      }

      // Create session: 30 days
      const sid = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await db.collection("sessions").insertOne({
        sid,
        userId: user._id.toString(),
        createdAt: new Date(),
        expiresAt
      });

      setCookie(res, "sid", sid, { maxAgeSec: 30 * 24 * 60 * 60 });

      json(res, 200, {
        ok: true,
        user: {
          email: user.email,
          role: user.role,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          isSubscribed: !!user.isSubscribed,
          subUntil: user.subUntil
        }
      });
      return;
    }

    if (path === "/api/auth/logout") {
      if (!requireMethod(req, res, "POST")) return;
      const cookies = parseCookies(req);
      if (cookies.sid) await db.collection("sessions").deleteOne({ sid: cookies.sid });
      clearCookie(res, "sid");
      json(res, 200, { ok: true });
      return;
    }

    if (path === "/api/me") {
      const sess = await getSession(req);
      if (!sess) {
        json(res, 401, { ok: false, error: "Unauthorized" });
        return;
      }
      const u = sess.user;
      json(res, 200, {
        ok: true,
        user: {
          email: u.email,
          role: u.role,
          displayName: u.displayName,
          avatarUrl: u.avatarUrl,
          isSubscribed: !!u.isSubscribed,
          subUntil: u.subUntil
        }
      });
      return;
    }

    /** ---------- SERIES & EPISODES ---------- */
    if (path === "/api/series") {
      // filter: type, genre, q
      const type = String(url.searchParams.get("type") || "").trim();
      const genre = String(url.searchParams.get("genre") || "").trim();
      const q = String(url.searchParams.get("q") || "").trim();

      const filter = {};
      if (type) filter.type = type;
      if (genre) filter.genres = genre;
      if (q) filter.title = { $regex: q, $options: "i" };

      const items = await db.collection("series")
        .find(filter)
        .sort({ updatedAt: -1 })
        .toArray();

      json(res, 200, { ok: true, items });
      return;
    }

    if (path.startsWith("/api/series/") && path.endsWith("/episodes")) {
      const sess = await getSession(req);
      if (!sess) {
        json(res, 401, { ok: false, error: "Login dulu" });
        return;
      }

      const seriesId = path.split("/")[3];
      if (!ObjectId.isValid(seriesId)) {
        json(res, 400, { ok: false, error: "Invalid series id" });
        return;
      }

      const series = await db.collection("series").findOne({ _id: new ObjectId(seriesId) });
      if (!series) {
        json(res, 404, { ok: false, error: "Series tidak ditemukan" });
        return;
      }

      const eps = await db.collection("episodes")
        .find({ seriesId })
        .sort({ number: 1 })
        .toArray();

      const freeLimit = Number(series.freeLimit || FREE_EP_LIMIT_DEFAULT);
      const subscribed = !!sess.user.isSubscribed || isAdmin(sess.user);

      const mapped = eps.map(ep => {
        const locked = !subscribed && ep.number > freeLimit;
        return {
          _id: ep._id,
          number: ep.number,
          title: ep.title,
          thumbUrl: ep.thumbUrl,
          locked,
          // jangan bocorin videoUrl kalau locked
          videoUrl: locked ? "" : ep.videoUrl
        };
      });

      json(res, 200, { ok: true, series: {
        _id: series._id,
        title: series.title,
        type: series.type,
        genres: series.genres,
        posterUrl: series.posterUrl,
        freeLimit: freeLimit
      }, episodes: mapped });
      return;
    }

    /** ---------- PROFILE (avatar, subscribe request) ---------- */
    if (path === "/api/profile") {
      const sess = await getSession(req);
      if (!sess) { json(res, 401, { ok:false, error:"Login dulu" }); return; }
      if (!requireMethod(req, res, "PATCH")) return;

      const body = await readJson(req);
      const displayName = String(body.displayName || "").trim();
      const avatarUrl = String(body.avatarUrl || "").trim();

      await db.collection("users").updateOne(
        { _id: sess.user._id },
        {
          $set: {
            ...(displayName ? { displayName } : {}),
            ...(avatarUrl ? { avatarUrl } : {}),
            updatedAt: new Date()
          }
        }
      );

      json(res, 200, { ok: true });
      return;
    }

    if (path === "/api/subscribe/request") {
      const sess = await getSession(req);
      if (!sess) { json(res, 401, { ok:false, error:"Login dulu" }); return; }
      if (!requireMethod(req, res, "POST")) return;

      const body = await readJson(req);
      const plan = String(body.plan || "");
      const method = String(body.method || "qris");
      const proofUrl = String(body.proofUrl || "").trim();

      if (!["1w","1m","1y"].includes(plan)) {
        json(res, 400, { ok:false, error:"Plan tidak valid" }); return;
      }
      if (!["dana","qris","seabank"].includes(method)) {
        json(res, 400, { ok:false, error:"Metode tidak valid" }); return;
      }
      if (!proofUrl) {
        json(res, 400, { ok:false, error:"Link bukti pembayaran wajib" }); return;
      }

      await db.collection("payments").insertOne({
        userId: sess.user._id.toString(),
        email: sess.user.email,
        plan,
        method,
        proofUrl,
        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date()
      });

      json(res, 200, { ok: true });
      return;
    }

    /** ---------- ADMIN ---------- */
    if (path === "/api/admin/series") {
      const sess = await getSession(req);
      if (!sess || !isAdmin(sess.user)) { json(res, 403, { ok:false, error:"Admin only" }); return; }
      if (!requireMethod(req, res, "POST")) return;

      const body = await readJson(req);
      const title = String(body.title || "").trim();
      const type = String(body.type || "").trim(); // anime/donghua/drakor/dracin
      const genres = Array.isArray(body.genres) ? body.genres.map(String) : [];
      const posterUrl = String(body.posterUrl || "").trim(); // link
      const freeLimit = Number(body.freeLimit || FREE_EP_LIMIT_DEFAULT);

      if (!title || !type) { json(res, 400, { ok:false, error:"title & type wajib" }); return; }

      await db.collection("series").insertOne({
        title, type, genres, posterUrl,
        freeLimit,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      json(res, 200, { ok: true });
      return;
    }

    if (path === "/api/admin/episode") {
      const sess = await getSession(req);
      if (!sess || !isAdmin(sess.user)) { json(res, 403, { ok:false, error:"Admin only" }); return; }
      if (!requireMethod(req, res, "POST")) return;

      const body = await readJson(req);
      const seriesId = String(body.seriesId || "");
      const number = Number(body.number || 0);
      const title = String(body.title || "").trim();
      const videoUrl = String(body.videoUrl || "").trim(); // direct video link
      const thumbUrl = String(body.thumbUrl || "").trim(); // image link

      if (!ObjectId.isValid(seriesId)) { json(res, 400, { ok:false, error:"seriesId invalid" }); return; }
      if (!number || !title || !videoUrl) { json(res, 400, { ok:false, error:"number, title, videoUrl wajib" }); return; }

      await db.collection("episodes").insertOne({
        seriesId,
        number,
        title,
        videoUrl,
        thumbUrl,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      await db.collection("series").updateOne(
        { _id: new ObjectId(seriesId) },
        { $set: { updatedAt: new Date() } }
      );

      json(res, 200, { ok: true });
      return;
    }

    if (path === "/api/admin/payments") {
      const sess = await getSession(req);
      if (!sess || !isAdmin(sess.user)) { json(res, 403, { ok:false, error:"Admin only" }); return; }

      const items = await db.collection("payments").find({ status: "pending" }).sort({ createdAt: -1 }).toArray();
      json(res, 200, { ok: true, items });
      return;
    }

    if (path === "/api/admin/payments/approve") {
      const sess = await getSession(req);
      if (!sess || !isAdmin(sess.user)) { json(res, 403, { ok:false, error:"Admin only" }); return; }
      if (!requireMethod(req, res, "POST")) return;

      const body = await readJson(req);
      const paymentId = String(body.paymentId || "");
      if (!ObjectId.isValid(paymentId)) { json(res, 400, { ok:false, error:"paymentId invalid" }); return; }

      const pay = await db.collection("payments").findOne({ _id: new ObjectId(paymentId) });
      if (!pay) { json(res, 404, { ok:false, error:"payment not found" }); return; }

      const until = calcSubUntil(pay.plan);
      await db.collection("users").updateOne(
        { _id: new ObjectId(pay.userId) },
        { $set: { isSubscribed: true, subUntil: until, updatedAt: new Date() } }
      );

      await db.collection("payments").updateOne(
        { _id: new ObjectId(paymentId) },
        { $set: { status: "approved", updatedAt: new Date(), approvedAt: new Date() } }
      );

      json(res, 200, { ok: true });
      return;
    }

    if (path === "/api/admin/payments/reject") {
      const sess = await getSession(req);
      if (!sess || !isAdmin(sess.user)) { json(res, 403, { ok:false, error:"Admin only" }); return; }
      if (!requireMethod(req, res, "POST")) return;

      const body = await readJson(req);
      const paymentId = String(body.paymentId || "");
      if (!ObjectId.isValid(paymentId)) { json(res, 400, { ok:false, error:"paymentId invalid" }); return; }

      await db.collection("payments").updateOne(
        { _id: new ObjectId(paymentId) },
        { $set: { status: "rejected", updatedAt: new Date() } }
      );

      json(res, 200, { ok: true });
      return;
    }

    if (path === "/api/admin/sub/give") {
      const sess = await getSession(req);
      if (!sess || !isAdmin(sess.user)) { json(res, 403, { ok:false, error:"Admin only" }); return; }
      if (!requireMethod(req, res, "POST")) return;

      const body = await readJson(req);
      const email = String(body.email || "").trim().toLowerCase();
      const plan = String(body.plan || "");
      const until = calcSubUntil(plan);
      if (!email || !until) { json(res, 400, { ok:false, error:"email & plan wajib" }); return; }

      await db.collection("users").updateOne(
        { email },
        { $set: { isSubscribed: true, subUntil: until, updatedAt: new Date() } }
      );

      json(res, 200, { ok: true });
      return;
    }

    // fallback
    json(res, 404, { ok: false, error: "API Not Found" });
  } catch (err) {
    json(res, 500, { ok: false, error: String(err?.message || err) });
  }
    }
