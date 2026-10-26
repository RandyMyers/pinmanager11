const rateLimit = require('express-rate-limit');

function rateLimitHandler(req, res) {
  return res.status(429).json({
    error: { code: 'RATE_LIMIT', message: 'Too many requests. Please try again later.' },
  });
}

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

module.exports = { apiLimiter, authLimiter };
