const env = require('../config/env');
const pinterest = require('../config/pinterest');
const PinterestAccount = require('../models/PinterestAccount');
const Post = require('../models/Post');
const pinterestOAuth = require('../services/pinterestOAuth');
const tokenService = require('../services/tokenService');
const pinterestBoards = require('../services/pinterestBoards');
const { syncAccountBoards } = require('../services/boardSyncService');
const activityService = require('../services/activityService');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { ok } = require('../utils/response');
const axios = require('axios');
const { mapPinterestError } = require('../utils/pinterestErrors');
const logger = require('../utils/logger');

function serializeAccount(account, extras = {}) {
  const obj = account.toObject();
  delete obj.tokens;
  return { ...obj, ...extras };
}

const list = asyncHandler(async (req, res) => {
  const accounts = await PinterestAccount.find({
    owner: req.user._id,
    status: { $ne: 'disconnected' },
  }).sort({ createdAt: -1 });
  return ok(
    res,
    accounts.map((a) => serializeAccount(a))
  );
});

const connect = asyncHandler(async (req, res) => {
  const { scopes, env: accountEnv, includeSecret, reconnectAccountId } = req.body || {};
  let scopeList = scopes;
  if (!scopeList) {
    scopeList = [...pinterest.SCOPES.default];
    if (includeSecret) scopeList.push(...pinterest.SCOPES.secret);
  }
  const chosenEnv = accountEnv || env.PINTEREST_ENV;
  if (chosenEnv === 'production' && !env.PINTEREST_STANDARD_APPROVED) {
    throw new AppError(
      403,
      'TRIAL_PRODUCTION',
      'Production Pinterest accounts require Standard access approval'
    );
  }
  const authUrl = pinterestOAuth.buildAuthUrl(req.user._id, {
    scopes: scopeList,
    accountEnv: chosenEnv,
    reconnectAccountId,
  });
  return ok(res, { authUrl });
});

const callback = asyncHandler(async (req, res) => {
  const fail = (msg) => res.redirect(`${env.CLIENT_URL}/accounts?error=${encodeURIComponent(msg)}`);
  try {
    const { code, state } = req.query;
    if (!code || !state) return fail('missing_code');
    const payload = pinterestOAuth.verifyState(state);
    const tokenResponse = await pinterestOAuth.exchangeCode(code, payload.env);
    const accessToken = tokenResponse.access_token;
    const base = pinterest.apiBase(payload.env);
    let profile;
    try {
      const { data } = await axios.get(`${base}/user_account`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 30000,
      });
      profile = data;
    } catch (err) {
      throw mapPinterestError(err);
    }

    const filter = payload.reconnectAccountId
      ? { _id: payload.reconnectAccountId, owner: payload.ownerId }
      : { owner: payload.ownerId, pinterestUserId: String(profile.id), env: payload.env };

    let account = await PinterestAccount.findOne(filter);
    if (!account) {
      account = new PinterestAccount({
        owner: payload.ownerId,
        env: payload.env,
        pinterestUserId: String(profile.id),
      });
    }
    account.username = profile.username;
    account.accountType = profile.account_type === 'BUSINESS' ? 'BUSINESS' : 'PERSONAL';
    account.profileImageUrl = profile.profile_image;
    account.followerCount = profile.follower_count;
    account.monthlyViews = profile.monthly_views;
    account.status = 'active';
    account.statusReason = undefined;
    await account.save();
    await tokenService.saveTokens(account, tokenResponse);

    try {
      await syncAccountBoards(account);
    } catch (syncError) {
      logger.warn({ err: syncError, accountId: String(account._id) }, 'Initial board sync failed');
    }

    await activityService.log({
      owner: payload.ownerId,
      account: account._id,
      kind: 'account.connected',
      message: `Connected @${account.username}`,
    });
    return res.redirect(`${env.CLIENT_URL}/accounts?connected=1`);
  } catch (err) {
    logger.warn(
      { code: err.code || 'OAUTH_ERROR', statusCode: err.statusCode },
      'Pinterest account connection failed'
    );
    return fail('oauth_failed');
  }
});

const detail = asyncHandler(async (req, res) => {
  const counters = await Post.aggregate([
    { $match: { account: req.account._id } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const queue = Object.fromEntries(counters.map((c) => [c._id, c.count]));
  return ok(res, serializeAccount(req.account, { queue }));
});

const update = asyncHandler(async (req, res) => {
  const { timezone, limits, status } = req.body || {};
  if (timezone) req.account.timezone = timezone;
  if (limits) {
    req.account.limits = { ...req.account.limits.toObject(), ...limits };
  }
  if (status && ['active', 'paused'].includes(status)) {
    if (status === 'active' && req.account.status === 'needs_reconnect') {
      throw new AppError(409, 'RECONNECT_REQUIRED', 'Reconnect this Pinterest account before resuming it');
    }
    req.account.status = status;
  }
  await req.account.save();
  return ok(res, serializeAccount(req.account));
});

const refreshProfile = asyncHandler(async (req, res) => {
  const profile = await pinterestBoards.getUserAccount(req.account);
  req.account.username = profile.username;
  req.account.accountType = profile.account_type === 'BUSINESS' ? 'BUSINESS' : 'PERSONAL';
  req.account.profileImageUrl = profile.profile_image;
  req.account.followerCount = profile.follower_count;
  req.account.monthlyViews = profile.monthly_views;
  await req.account.save();
  return ok(res, serializeAccount(req.account));
});

const reconnect = asyncHandler(async (req, res) => {
  req.body = { ...(req.body || {}), reconnectAccountId: String(req.account._id), env: req.account.env };
  return connect(req, res);
});

const disconnect = asyncHandler(async (req, res) => {
  await Post.updateMany(
    { account: req.account._id, status: { $in: ['scheduled', 'queued'] } },
    { status: 'cancelled' }
  );
  req.account.status = 'disconnected';
  req.account.tokens = undefined;
  req.account.statusReason = 'disconnected_by_user';
  await req.account.save();
  await activityService.log({
    owner: req.user._id,
    account: req.account._id,
    kind: 'account.disconnected',
    message: `Disconnected @${req.account.username}`,
  });
  return ok(res, { success: true });
});

module.exports = { list, connect, callback, detail, update, refreshProfile, reconnect, disconnect };
