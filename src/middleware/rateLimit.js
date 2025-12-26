const bucket = new Map();

function rateLimit({ keyPrefix, limit, windowMs }) {
  return (req, res, next) => {
    const key = `${keyPrefix}:${req.ip}`;
    const now = Date.now();
    const entry = bucket.get(key) || { count: 0, resetAt: now + windowMs };

    if (now > entry.resetAt) {
      entry.count = 0;
      entry.resetAt = now + windowMs;
    }

    entry.count += 1;
    bucket.set(key, entry);

    if (entry.count > limit) {
      return res.status(429).json({ error: "RATE_LIMITED" });
    }
    return next();
  };
}

module.exports = { rateLimit };