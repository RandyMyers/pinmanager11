const axios = require('axios');
const pinterest = require('../config/pinterest');
const tokenService = require('./tokenService');
const { mapPinterestError } = require('../utils/pinterestErrors');

const rateLimitState = new Map();

function rememberRateLimit(accountId, headers = {}) {
  rateLimitState.set(String(accountId), {
    remaining: Number(headers['x-ratelimit-remaining'] ?? headers['X-Ratelimit-Remaining']),
    reset: headers['x-ratelimit-reset'] || headers['X-Ratelimit-Reset'],
    limit: headers['x-ratelimit-limit'] || headers['X-Ratelimit-Limit'],
    at: Date.now(),
  });
}

function getRateLimit(accountId) {
  return rateLimitState.get(String(accountId));
}

async function forAccount(account) {
  const accessToken = await tokenService.getValidAccessToken(account);
  const client = axios.create({
    baseURL: pinterest.apiBase(account.env),
    timeout: 30000,
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  client.interceptors.response.use(
    (response) => {
      rememberRateLimit(account._id, response.headers);
      return response;
    },
    (error) => {
      if (error.response) rememberRateLimit(account._id, error.response.headers);
      return Promise.reject(mapPinterestError(error));
    }
  );
  return client;
}

module.exports = { forAccount, getRateLimit };
