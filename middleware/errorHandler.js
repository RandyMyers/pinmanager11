const logger = require('../utils/logger');
const AppError = require('../utils/AppError');

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err && err.config && err.config.headers) {
    delete err.config.headers.Authorization;
    delete err.config.headers.authorization;
  }

  let status = err.statusCode || 500;
  let code = err.code || 'INTERNAL';
  let message = err.message || 'Internal server error';
  let details = err.details;

  if (err.type === 'entity.parse.failed') {
    status = 400;
    code = 'VALIDATION';
    message = 'Malformed JSON request body';
  } else if (err.type === 'entity.too.large' || err.code === 'LIMIT_FILE_SIZE') {
    status = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Request payload is too large';
  } else if (err.name === 'MulterError') {
    status = 400;
    code = 'UPLOAD_ERROR';
    message = 'Invalid file upload';
  }

  if (err.name === 'ValidationError') {
    status = 400;
    code = 'VALIDATION';
    details = err.errors;
  }
  if (err.name === 'CastError') {
    status = 400;
    code = 'VALIDATION';
    message = 'Invalid id';
  }
  if (err.name === 'VersionError') {
    status = 409;
    code = 'CONFLICT';
    message = 'The resource changed before this update completed';
  }
  if (err.code === 11000) {
    status = 409;
    code = 'CONFLICT';
    message = 'Already exists';
  }
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    status = 401;
    code = 'UNAUTHENTICATED';
  }
  if (err instanceof AppError) {
    status = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
  }

  if (status >= 500) {
    logger.error({ err, path: req.path }, message);
    if (!(err instanceof AppError)) {
      message = 'Internal server error';
      details = undefined;
    }
  }

  res.status(status).json({
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  });
}

module.exports = errorHandler;
