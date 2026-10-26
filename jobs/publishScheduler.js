const os = require('os');
const { randomUUID } = require('crypto');
const { addMinutes, subMinutes, differenceInHours } = require('date-fns');
const Post = require('../models/Post');
const Asset = require('../models/Asset');
const PinterestAccount = require('../models/PinterestAccount');
const env = require('../config/env');
const logger = require('../utils/logger');
const { startOfAccountDayUtc } = require('../utils/dates');
const pinterestPins = require('../services/pinterestPins');
const activityService = require('../services/activityService');

const workerId = `${os.hostname()}-${process.pid}`;

async function recoverStaleLeases() {
  const cutoff = subMinutes(new Date(), 10);
  const stale = await Post.find({
    status: 'publishing',
    claimedAt: { $lt: cutoff },
  });
  for (const post of stale) {
    const hasPin = Boolean(post.pinterestPinId);
    const updated = await Post.findOneAndUpdate(
      { _id: post._id, status: 'publishing', claimedAt: { $lt: cutoff } },
      hasPin
        ? { $set: { status: 'published' }, $unset: { claimedBy: 1, claimedAt: 1 } }
        : {
            $set: {
              status: 'failed',
              lastError: {
                kind: 'UNKNOWN',
                message: 'Publish worker stopped unexpectedly; verify on Pinterest before retrying',
                at: new Date(),
              },
            },
            $unset: { claimedBy: 1, claimedAt: 1 },
          },
      { new: true }
    );
    if (updated && !hasPin) {
      await activityService.log({
        owner: updated.owner,
        account: updated.account,
        kind: 'post.failed',
        message: 'Publish worker stopped; verify on Pinterest before retrying',
        meta: { postId: String(updated._id), kind: 'UNKNOWN' },
      });
    }
  }
}

async function failMissed(post) {
  post.status = 'failed';
  post.missed = true;
  post.claimedBy = undefined;
  post.claimedAt = undefined;
  post.lastError = { kind: 'MISSED', message: 'Post was more than 6 hours overdue', at: new Date() };
  await post.save();
  await activityService.log({
    owner: post.owner,
    account: post.account,
    kind: 'post.failed',
    message: 'Missed scheduled time (server was down too long)',
    meta: { postId: String(post._id) },
  });
}

async function applyFailure(post, account, err) {
  const kind = err.code || 'UNKNOWN';
  post.lastError = { kind, code: String(err.statusCode || ''), message: err.message, at: new Date() };

  if (kind === 'AUTH') {
    post.status = 'scheduled';
    post.nextAttemptAt = undefined;
    post.claimedBy = undefined;
    post.claimedAt = undefined;
    await post.save();
    account.status = 'needs_reconnect';
    account.statusReason = err.message;
    await account.save();
    await activityService.log({
      owner: post.owner,
      account: post.account,
      kind: 'account.reconnect_needed',
      message: err.message,
      meta: { postId: String(post._id) },
    });
    return;
  }

  if (
    kind === 'FORBIDDEN_PINNER_DATA' ||
    kind === 'TRIAL_PRODUCTION' ||
    kind === 'VALIDATION' ||
    kind === 'PUBLISH_OUTCOME_UNKNOWN'
  ) {
    post.status = 'failed';
    post.claimedBy = undefined;
    post.claimedAt = undefined;
    await post.save();
    await activityService.log({
      owner: post.owner,
      account: post.account,
      kind: 'post.failed',
      message: err.message,
      meta: { postId: String(post._id), kind },
    });
    return;
  }

  if (kind === 'RATE_LIMIT') {
    const reset = err.details?.reset ? new Date(Number(err.details.reset) * 1000) : addMinutes(new Date(), 15);
    post.status = 'scheduled';
    post.nextAttemptAt = reset;
    post.claimedBy = undefined;
    post.claimedAt = undefined;
    await post.save();
    await Post.updateMany(
      { account: post.account, status: 'scheduled', scheduledAt: { $lt: reset } },
      { $max: { nextAttemptAt: reset } }
    );
    return;
  }

  if (post.attempts >= 3) {
    post.status = 'failed';
    post.claimedBy = undefined;
    post.claimedAt = undefined;
    await post.save();
    await activityService.log({
      owner: post.owner,
      account: post.account,
      kind: 'post.failed',
      message: err.message,
      meta: { postId: String(post._id), kind },
    });
    return;
  }

  post.status = 'scheduled';
  post.nextAttemptAt = addMinutes(new Date(), 2 ** post.attempts);
  post.claimedBy = undefined;
  post.claimedAt = undefined;
  await post.save();
}

async function publishOne(post) {
  const account = await PinterestAccount.findById(post.account);
  if (!account || account.status !== 'active') {
    post.status = 'scheduled';
    post.claimedBy = undefined;
    post.claimedAt = undefined;
    await post.save();
    return;
  }
  if (post.pinterestPinId) {
    post.status = 'published';
    post.publishedAt = post.publishedAt || new Date();
    post.claimedBy = undefined;
    post.claimedAt = undefined;
    await post.save();
    return;
  }
  if (differenceInHours(new Date(), post.scheduledAt) > 6) {
    await failMissed(post);
    return;
  }

  let pin;
  try {
    const asset = await Asset.findById(post.asset);
    const cover = post.coverAsset ? await Asset.findById(post.coverAsset) : null;
    pin =
      post.mediaType === 'video'
        ? await pinterestPins.createVideoPin(account, post, asset, cover)
        : await pinterestPins.createImagePin(account, post, asset);
  } catch (err) {
    logger.warn({ err, postId: String(post._id), accountId: String(account._id) }, 'Publish failed');
    await applyFailure(post, account, err);
    return;
  }

  post.status = 'published';
  post.publishedAt = new Date();
  post.pinterestPinId = pin.id;
  post.pinUrl = pin.pin_url || pin.link || `https://www.pinterest.com/pin/${pin.id}/`;
  post.lastError = undefined;
  post.claimedBy = undefined;
  post.claimedAt = undefined;
  try {
    await post.save();
  } catch (err) {
    logger.error(
      { err, postId: String(post._id), accountId: String(account._id), pinterestPinId: pin.id },
      'Pin was created but publishing state could not be persisted; do not retry automatically'
    );
    return;
  }
  try {
    await activityService.log({
      owner: post.owner,
      account: post.account,
      kind: 'post.published',
      message: `Published Pin ${pin.id}`,
      meta: { postId: String(post._id), pinterestPinId: pin.id },
    });
  } catch (err) {
    logger.error({ err, postId: String(post._id) }, 'Published Pin activity log failed');
  }
}

async function tick() {
  await recoverStaleLeases();
  const now = new Date();
  const due = await Post.find({
    status: 'scheduled',
    scheduledAt: { $lte: now },
    $or: [{ nextAttemptAt: { $exists: false } }, { nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }],
  })
    .sort({ scheduledAt: 1 })
    .limit(50);

  const byAccount = new Map();
  for (const post of due) {
    const key = String(post.account);
    if (!byAccount.has(key)) byAccount.set(key, true);
  }

  for (const accountId of byAccount.keys()) {
    const lockId = randomUUID();
    const account = await PinterestAccount.findOneAndUpdate(
      {
        _id: accountId,
        status: 'active',
        $or: [
          { publishLockUntil: { $exists: false } },
          { publishLockUntil: null },
          { publishLockUntil: { $lte: now } },
        ],
      },
      { $set: { publishLockId: lockId, publishLockUntil: addMinutes(now, 10) } },
      { new: true }
    );
    if (!account) continue;

    try {
      const post = await Post.findOne({
        account: account._id,
        status: 'scheduled',
        scheduledAt: { $lte: now },
        $or: [
          { nextAttemptAt: { $exists: false } },
          { nextAttemptAt: null },
          { nextAttemptAt: { $lte: now } },
        ],
      }).sort({ scheduledAt: 1 });
      if (!post) continue;

      const minGap = account.limits?.minGapMinutes || env.DEFAULT_MIN_GAP_MINUTES;
      const last = await Post.findOne({
        account: account._id,
        status: 'published',
        publishedAt: { $ne: null },
      }).sort({ publishedAt: -1 });
      if (last?.publishedAt && now - last.publishedAt < minGap * 60 * 1000) continue;

      const start = startOfAccountDayUtc(now, account.timezone || 'UTC');
      const publishedToday = await Post.countDocuments({
        account: account._id,
        status: 'published',
        publishedAt: { $gte: start },
      });
      if (publishedToday >= (account.limits?.dailyCap || env.DEFAULT_DAILY_CAP)) continue;
      if (differenceInHours(now, post.scheduledAt) > 6) {
        await failMissed(post);
        continue;
      }

      const claimed = await Post.findOneAndUpdate(
        {
          _id: post._id,
          status: 'scheduled',
          scheduledAt: { $lte: now },
          $or: [
            { nextAttemptAt: { $exists: false } },
            { nextAttemptAt: null },
            { nextAttemptAt: { $lte: now } },
          ],
        },
        {
          status: 'publishing',
          claimedBy: `${workerId}:${lockId}`,
          claimedAt: now,
          $inc: { attempts: 1, __v: 1 },
        },
        { new: true }
      );
      if (claimed) await publishOne(claimed);
    } catch (err) {
      logger.warn({ err, accountId }, 'Account publish tick failed');
    } finally {
      await PinterestAccount.updateOne(
        { _id: account._id, publishLockId: lockId },
        { $unset: { publishLockId: 1, publishLockUntil: 1 } }
      ).catch((err) => {
        logger.error({ err, accountId: String(account._id) }, 'Failed to release account publish lock');
      });
    }
  }
}

function start() {
  const ms = Math.max(5, env.WORKER_TICK_SECONDS) * 1000;
  logger.info({ workerId, ms }, 'publishScheduler started');
  tick().catch((err) => logger.error({ err }, 'publishScheduler tick failed'));
  return setInterval(() => {
    tick().catch((err) => logger.error({ err }, 'publishScheduler tick failed'));
  }, ms);
}

module.exports = { start, tick };
