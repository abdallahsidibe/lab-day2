// rate-limiter.js
const store = {}; // { "ip_address": { count: N, resetAt: timestamp } }
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 100;

function rateLimiter(req, res, next) {
  const ip = req.ip || '0.0.0.0';
  const now = Date.now();

  if (!store[ip]) {
    store[ip] = {
      count: 0,
      resetAt: now + WINDOW_MS
    };
  }

  const entry = store[ip];

  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + WINDOW_MS;
  }

  entry.count++;

  const remaining = Math.max(0, MAX_REQUESTS - entry.count);
  res.setHeader('X-RateLimit-Limit', MAX_REQUESTS);
  res.setHeader('X-RateLimit-Remaining', remaining);
  res.setHeader('X-RateLimit-Reset', entry.resetAt);

  if (entry.count > MAX_REQUESTS) {
    return res.status(429).json({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please try again later.'
    });
  }

  next();
}

// Cleanup store periodically to avoid memory leaks
setInterval(() => {
  const now = Date.now();
  for (const ip in store) {
    if (now > store[ip].resetAt) {
      delete store[ip];
    }
  }
}, 5 * 60 * 1000); // every 5 minutes

module.exports = { rateLimiter };
