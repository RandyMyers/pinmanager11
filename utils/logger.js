const pino = require('pino');

module.exports = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'headers.authorization',
      'headers.Authorization',
      'config.headers.Authorization',
      'config.headers.authorization',
      'err.config.headers.Authorization',
      'err.config.headers.authorization',
      'err.response.config.headers.Authorization',
      'err.response.config.headers.authorization',
      'tokens',
      'access_token',
      'refresh_token',
    ],
    remove: true,
  },
});
