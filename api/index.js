const path = require("path");
const express = require("express");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const MongoStore = require("connect-mongo");
require("dotenv").config();

const { connectDB } = require("../src/db");

const authRoutes = require("../src/routes/auth-routes");
const contentRoutes = require("../src/routes/content-routes");
const watchRoutes = require("../src/routes/watch-routes");
const billingRoutes = require("../src/routes/billing-routes");
const adminRoutes = require("../src/routes/admin-routes");
const profileRoutes = require("../src/routes/profile-routes");
const { router: tmdbRoutes } = require("../src/routes/tmdb-routes");

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cookieParser());

// IMPORTANT: bukti transfer = dataURL => butuh limit lebih besar dari 2mb
app.use(express.json({ limit: "6mb" }));
app.use(express.urlencoded({ extended: true, limit: "6mb" }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev_secret_change_me",
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax" },
    store: MongoStore.create({
      mongoUrl: process.env.MONGODB_URI
    })
  })
);

// static
app.use("/public", express.static(path.join(process.cwd(), "public")));

// views (route ke HTML)
function sendView(res, name) {
  return res.sendFile(path.join(process.cwd(), "src", "views", name));
}

app.get("/", (_req, res) => sendView(res, "login.html"));
app.get("/login", (_req, res) => sendView(res, "login.html"));
app.get("/register", (_req, res) => sendView(res, "register.html"));
app.get("/app", (_req, res) => sendView(res, "app.html"));
app.get("/watch", (_req, res) => sendView(res, "watch.html"));
app.get("/profile", (_req, res) => sendView(res, "profile.html"));
app.get("/billing", (_req, res) => sendView(res, "billing.html"));
app.get("/admin", (_req, res) => sendView(res, "admin.html"));

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/content", contentRoutes);
app.use("/api/watch", watchRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/profile", profileRoutes);

// External metadata/provider API (TMDb)
app.use("/api/ext", tmdbRoutes);

let _dbReady = false;
async function ensureDB() {
  if (_dbReady) return;
  await connectDB();
  _dbReady = true;
}

module.exports = async (req, res) => {
  try {
    await ensureDB();
    return app(req, res);
  } catch (e) {
    return res.status(500).json({
      error: "SERVER_ERROR",
      message: String(e && e.message ? e.message : e)
    });
  }
};