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

const app = express();
app.set("trust proxy", 1);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(
  session({
    name: "sid",
    secret: process.env.SESSION_SECRET || "dev_secret_change_me",
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: { httpOnly: true, secure: true, sameSite: "lax" },
    store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI })
  })
);

app.use("/public", express.static(path.join(__dirname, "..", "public")));

// Views routes (HTML)
app.get("/", (_req, res) => res.redirect("/app"));
app.get("/login", (_req, res) => res.sendFile(path.join(__dirname, "..", "src/views/login.html")));
app.get("/register", (_req, res) => res.sendFile(path.join(__dirname, "..", "src/views/register.html")));
app.get("/app", (_req, res) => res.sendFile(path.join(__dirname, "..", "src/views/app.html")));
app.get("/watch", (_req, res) => res.sendFile(path.join(__dirname, "..", "src/views/watch.html")));
app.get("/profile", (_req, res) => res.sendFile(path.join(__dirname, "..", "src/views/profile.html")));
app.get("/billing", (_req, res) => res.sendFile(path.join(__dirname, "..", "src/views/billing.html")));
app.get("/admin", (_req, res) => res.sendFile(path.join(__dirname, "..", "src/views/admin.html")));

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/content", contentRoutes);
app.use("/api/watch", watchRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/profile", profileRoutes);

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