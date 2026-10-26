const { addDays, addSeconds, addHours, isBefore } = require('date-fns');
const PinterestAccount = require('../models/PinterestAccount');
const { encrypt, decrypt } = require('../utils/crypto');
const { mapPinterestError } = require('../utils/pinterestErrors');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const activityService = require('./activityService');
const pinterestOAuth = require('./pinterestOAuth');

function saveTokensPayload(tokenResponse) {
  if (!tokenResponse?.access_token || !tokenResponse?.refresh_token) {
    throw new AppError(502, 'TOKEN_RESPONSE', 'Pinterest returned an incomplete token response');
  }
  const now = new Date();
  return {
    'tokens.accessTokenEnc': encrypt(tokenResponse.access_token),
    'tokens.refreshTokenEnc': encrypt(tokenResponse.refresh_token),
    'tokens.accessExpiresAt': addSeconds(now, Number(tokenResponse.expires_in || 2592000)),
    'tokens.refreshExpiresAt': addSeconds(
      now,
      Number(tokenResponse.refresh_token_expires_in || 5184000)
    ),
    scopes: String(tokenResponse.scope || '')
      .split(/[,\s]+/)
      .filter(Boolean),
  };
}

async function saveTokens(account, tokenResponse) {
  const payload = saveTokensPayload(tokenResponse);
  try {
    const updated = await PinterestAccount.findByIdAndUpdate(
      account._id,
      {
        $set: payload,
        $unset: { 'tokens.refreshingUntil': 1 },
        $inc: { 'tokens.version': 1 },
      },
      { new: true }
    );
    if (updated) return updated;
    logger.error({ accountId: String(account._id) }, 'Token write failed after Pinterest success');
    throw new AppError(500, 'TOKEN_PERSIST', 'Failed to store Pinterest tokens. Reconnect this account.');
  } catch (err) {
    logger.error({ err, accountId: String(account._id) }, 'Token write failed after Pinterest success');
    if (err instanceof AppError) throw err;
    throw new AppError(500, 'TOKEN_PERSIST', 'Failed to store Pinterest tokens. Reconnect this account.');
  }
}

async function markNeedsReconnect(account, reason) {
  await PinterestAccount.findByIdAndUpdate(account._id, {
    status: 'needs_reconnect',
    statusReason: reason,
  });
  await activityService.log({
    owner: account.owner,
    account: account._id,
    kind: 'account.reconnect_needed',
    message: reason,
  });
}

async function getValidAccessToken(account, { refreshBeforeHours = 24 } = {}) {
  const lockDurationMs = 60 * 1000;
  const waitUntil = Date.now() + lockDurationMs;
  while (true) {
    const fresh = await PinterestAccount.findById(account._id);
    if (!fresh || fresh.status === 'disconnected') {
      throw new AppError(400, 'ACCOUNT_INACTIVE', 'Account is not connected');
    }
    const expiresAt = fresh.tokens?.accessExpiresAt;
    const refreshAt = expiresAt ? addHours(expiresAt, -refreshBeforeHours) : new Date(0);
    if (expiresAt && isBefore(new Date(), refreshAt)) {
      return decrypt(fresh.tokens.accessTokenEnc);
    }

    const now = new Date();
    const locked = await PinterestAccount.findOneAndUpdate(
      {
        _id: fresh._id,
        status: { $ne: 'disconnected' },
        'tokens.version': fresh.tokens?.version || 0,
        $or: [
          { 'tokens.refreshingUntil': { $exists: false } },
          { 'tokens.refreshingUntil': null },
          { 'tokens.refreshingUntil': { $lte: now } },
        ],
      },
      {
        $set: { 'tokens.refreshingUntil': new Date(now.getTime() + lockDurationMs) },
        $inc: { 'tokens.version': 1 },
      },
      { new: true }
    );
    if (!locked) {
      if (Date.now() >= waitUntil) {
        throw new AppError(503, 'TOKEN_REFRESH_BUSY', 'Pinterest token refresh is still in progress');
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
      continue;
    }

  try {
    const refreshToken = decrypt(locked.tokens.refreshTokenEnc);
    const tokenResponse = await pinterestOAuth.refresh(refreshToken, locked.env);
    const saved = await PinterestAccount.findOneAndUpdate(
      { _id: locked._id, 'tokens.version': locked.tokens.version },
      {
        $set: { ...saveTokensPayload(tokenResponse), status: 'active' },
        $unset: { statusReason: 1, 'tokens.refreshingUntil': 1 },
      },
      { new: true }
    );
    if (!saved) {
      logger.error(
        { accountId: String(locked._id) },
        'Pinterest refresh succeeded but rotated tokens could not be persisted'
      );
      throw new AppError(
        500,
        'TOKEN_PERSIST',
        'Failed to store refreshed Pinterest tokens. Reconnect this account.'
      );
    }
    return decrypt(saved.tokens.accessTokenEnc);
  } catch (err) {
    if (err instanceof AppError && err.code === 'TOKEN_PERSIST') {
      try {
        await PinterestAccount.updateOne(
          { _id: locked._id, 'tokens.version': locked.tokens.version },
          { $unset: { 'tokens.refreshingUntil': 1 } }
        );
      } catch (releaseError) {
        logger.error(
          { err: releaseError, accountId: String(locked._id) },
          'Failed to release Pinterest token refresh lock'
        );
      }
      throw err;
    }
    const mapped = mapPinterestError(err);
    if (mapped.code === 'AUTH' || mapped.statusCode === 400) {
      await markNeedsReconnect(locked, 'Pinterest refresh token was rejected');
    }
    await PinterestAccount.updateOne(
      { _id: locked._id, 'tokens.version': locked.tokens.version },
      { $unset: { 'tokens.refreshingUntil': 1 } }
    );
    throw mapped;
  }
  }
}

function accessExpiresSoon(account, days = 7) {
  if (!account.tokens?.accessExpiresAt) return true;
  return isBefore(account.tokens.accessExpiresAt, addDays(new Date(), days));
}

module.exports = {
  encrypt,
  decrypt,
  saveTokens,
  getValidAccessToken,
  markNeedsReconnect,
  accessExpiresSoon,
};
