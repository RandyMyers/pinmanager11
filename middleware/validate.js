const AppError = require('../utils/AppError');

function validate(schema) {
  return (req, res, next) => {
    const parsed = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    if (!parsed.success) {
      return next(
        new AppError(400, 'VALIDATION', 'Invalid request', parsed.error.flatten())
      );
    }
    req.validated = parsed.data;
    if (parsed.data.body) req.body = parsed.data.body;
    if (parsed.data.query) req.query = parsed.data.query;
    next();
  };
}

module.exports = validate;
