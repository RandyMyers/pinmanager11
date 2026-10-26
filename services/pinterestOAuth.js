const axios = require('axios');
const jwt = require('jsonwebtoken');
const { nanoid } = require('nanoid');
const env = require('../config/env');
const pinterest = require('../config/pinterest');
const AppError = require('../utils/AppError');

function tokenUrl(accountEnv) {
  return accountEnv === 'sandbox' ? pinterest.TOKEN_URL_SANDBOX : pinterest.TOKEN_URL;
}

function basicAuth() {
  if (!env.PINTEREST_APP_ID || !env.PINTEREST_APP_SECRET) {
    throw new AppError(
      500,
      'CONFIG',
      'Pinterest app credentials are not configured. Set PINTEREST_APP_ID and PINTEREST_APP_SECRET.'
    );
  }
  return Buffer.from(`${env.PINTEREST_APP_ID}:${env.PINTEREST_APP_SECRET}`).toString('base64');
}

function buildAuthUrl(ownerId, { scopes, accountEnv, reconnectAccountId } = {}) {
  const chosenEnv = accountEnv || env.PINTEREST_ENV;
  if (!['sandbox', 'production'].includes(chosenEnv)) {
    throw new AppError(400, 'VALIDATION', 'Pinterest environment must be sandbox or production');
  }
  if (!env.PINTEREST_APP_ID) {
    throw new AppError(503, 'CONFIG', 'PINTEREST_APP_ID is not configured');
  }
  const scopeList = scopes?.length ? scopes : pinterest.SCOPES.default;
  const state = jwt.sign(
    {
      ownerId: String(ownerId),
      nonce: nanoid(),
      env: chosenEnv,
      scopes: scopeList,
      reconnectAccountId: reconnectAccountId || null,
    },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '10m' }
  );
  const params = new URLSearchParams({
    client_id: env.PINTEREST_APP_ID,
    redirect_uri: env.PINTEREST_REDIRECT_URI,
    response_type: 'code',
    scope: scopeList.join(','),
    state,
  });
  return `${pinterest.OAUTH_AUTHORIZE}?${params.toString()}`;
}

function verifyState(state) {
  try {
    return jwt.verify(state, env.JWT_ACCESS_SECRET);
  } catch {
    throw new AppError(400, 'OAUTH_STATE', 'Invalid or expired OAuth state');
  }
}

async function exchangeCode(code, accountEnv = env.PINTEREST_ENV) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: env.PINTEREST_REDIRECT_URI,
  });
  const { data } = await axios.post(tokenUrl(accountEnv), body.toString(), {
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    timeout: 30000,
  });
  return data;
}

async function refresh(refreshToken, accountEnv = env.PINTEREST_ENV) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  const { data } = await axios.post(tokenUrl(accountEnv), body.toString(), {
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    timeout: 30000,
  });
  return data;
}

module.exports = { buildAuthUrl, verifyState, exchangeCode, refresh };
