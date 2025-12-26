const path = require("path");
const express = require("express");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const MongoStore = require("connect-mongo");
require("dotenv").config();

const { connectDB } = require("../src/db");

const authRoutes = require("../src/routes/auth.routes");
const contentRoutes = require("../src/routes/content.routes");
const watchRoutes = require("../src/routes/watch.routes");
const billingRoutes = require("../src/routes/billing.routes");
const adminRoutes = require("../src/routes/admin.routes");

const app = express();

app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(
  session({
    name: "sid",
    secret: process.env.SESSION_SECRET || "dev_secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 1000 * 60 * 60 * 24 * 7
    },
    store: MongoStore.create({
      mongoUrl: process.env.MONGODB_URI
    })
  })
);

// Static
app.use("/public", express.static(path.join(__dirname, "..", "public")));

// Views (HTML)
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

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/content", contentRoutes);
app.use("/api/watch", watchRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/admin", adminRoutes);

// health
app.get("/api/health", (req, res) => res.json({ ok: true }));

// Boot
(async () => {
  await connectDB();
  // Note: Vercel serverless akan ignore listen; ini untuk local run.
  const port = process.env.PORT || 3000;
  if (!process.env.VERCEL) {
    app.listen(port, () => console.log(`Server running http://localhost:${port}`));
  }
})();

module.exports = app;