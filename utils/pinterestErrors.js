const AppError = require('./AppError');

function mapPinterestError(error) {
  const status = error.response?.status;
  const body = error.response?.data || {};
  const code = body.code;
  const message = body.message || error.message || 'Pinterest request failed';
  const pinterestCode = body.code_name || body.name;

  if (status === 401 || code === 2) {
    return new AppError(401, 'AUTH', 'Pinterest token is invalid. Reconnect this account.', {
      pinterestCode: code,
    });
  }
  if (status === 403 && (pinterestCode === 'PINNER_DATA_ACCESS_DENIED' || String(message).includes('PINNER_DATA'))) {
    return new AppError(403, 'FORBIDDEN_PINNER_DATA', message, { pinterestCode });
  }
  if (code === 29 || String(message).includes('Trial access')) {
    return new AppError(403, 'TRIAL_PRODUCTION', message, { pinterestCode: code });
  }
  if (status === 429) {
    const reset = error.response?.headers?.['x-ratelimit-reset'];
    return new AppError(429, 'RATE_LIMIT', 'Pinterest rate limit reached.', { reset });
  }
  if (status === 400 || status === 422) {
    return new AppError(status, 'VALIDATION', message, body);
  }
  if (!error.response || status >= 500) {
    return new AppError(status || 503, 'TRANSIENT', message, {
      networkCode: error.code,
      pinterestStatus: status,
    });
  }
  return new AppError(status || 500, 'UNKNOWN', message, body);
}

function kindFromError(error) {
  if (error instanceof AppError) return error.code;
  return mapPinterestError(error).code;
}

module.exports = { mapPinterestError, kindFromError };
