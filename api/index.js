const path = require("path");
const express = require("express");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const MongoStore = require("connect-mongo");
require("dotenv").config();

const { connectDB } = require("../src/db");

// NOTE: nama file routes kamu pakai DASH, jadi require-nya harus sama persis:
const authRoutes = require("../src/routes/auth-routes");
const contentRoutes = require("../src/routes/content-routes");
const watchRoutes = require("../src/routes/watch-routes");
const billingRoutes = require("../src/routes/billing-routes");
const adminRoutes = require("../src/routes/admin-routes");

const app = express();

// Vercel berada di belakang proxy
app.set("trust proxy", 1);

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Session (MongoDB store)
app.use(
  session({
    name: "sid",
    secret: process.env.SESSION_SECRET || "dev_secret_change_me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: !!process.env.VERCEL, // di Vercel https -> true
      maxAge: 1000 * 60 * 60 * 24 * 7
    },
    store: MongoStore.create({
      mongoUrl: process.env.MONGODB_URI
    })
  })
);

// Static
app.use("/public", express.static(path.join(__dirname, "..", "public")));

// Views routes
app.get("/", (req, res) => res.redirect("/app"));

app.get("/login", (req, res) =>
  res.sendFile(path.join(__dirname, "..", "src", "views", "login.html"))
);
app.get("/register", (req, res) =>
  res.sendFile(path.join(__dirname, "..", "src", "views", "register.html"))
);
app.get("/app", (req, res) =>
  res.sendFile(path.join(__dirname, "..", "src", "views", "app.html"))
);
app.get("/watch", (req, res) =>
  res.sendFile(path.join(__dirname, "..", "src", "views", "watch.html"))
);
app.get("/billing", (req, res) =>
  res.sendFile(path.join(__dirname, "..", "src", "views", "billing.html"))
);
app.get("/admin", (req, res) =>
  res.sendFile(path.join(__dirname, "..", "src", "views", "admin.html"))
);

// API
app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/content", contentRoutes);
app.use("/api/watch", watchRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/admin", adminRoutes);

// 404 handler (biar bukan 404 vercel)
app.use((req, res) => {
  res.status(404).json({ error: "NOT_FOUND", path: req.path });
});

// Connect DB sekali (cache untuk serverless)
let _dbReady = false;
async function ensureDB() {
  if (_dbReady) return;
  await connectDB();
  _dbReady = true;
}

// EXPORT HANDLER yang pasti kompatibel di Vercel
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