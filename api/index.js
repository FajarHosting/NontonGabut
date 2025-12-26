const express = require("express");

const app = express();

app.get("/", (_req, res) => {
  res.status(200).send("OK: Express on Vercel is running");
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

module.exports = app;