const User = require("../models/User");

async function attachUser(req, _res, next) {
  try {
    if (!req.session.userId) {
      req.user = null;
      return next();
    }
    const user = await User.findById(req.session.userId);
    req.user = user || null;
    return next();
  } catch {
    req.user = null;
    return next();
  }
}

function requireLogin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "NOT_LOGGED_IN" });
  return next();
}

function requireAdmin(req, res, next) {
  if (!req.user || !req.user.isAdmin) return res.status(403).json({ error: "FORBIDDEN" });
  return next();
}

module.exports = { attachUser, requireLogin, requireAdmin };