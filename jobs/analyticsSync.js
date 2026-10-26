const cron = require('node-cron');
const { subDays, format, differenceInDays } = require('date-fns');
const PinterestAccount = require('../models/PinterestAccount');
const Post = require('../models/Post');
const PinMetricSnapshot = require('../models/PinMetricSnapshot');
const AccountMetricSnapshot = require('../models/AccountMetricSnapshot');
const pinterestAnalytics = require('../services/pinterestAnalytics');
const logger = require('../utils/logger');

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function shouldSyncPin(post, now = new Date()) {
  const age = differenceInDays(now, post.publishedAt || now);
  if (age <= 30) return true;
  return (
    !post.lastPinAnalyticsSyncAt ||
    now.getTime() - new Date(post.lastPinAnalyticsSyncAt).getTime() >= WEEK_MS
  );
}

function flattenDaily(payload) {
  const rows = [];
  const all = payload?.all || payload?.daily_metrics || payload;
  if (Array.isArray(all)) {
    for (const item of all) {
      rows.push({ date: item.date, metrics: item.metrics || item });
    }
  } else if (payload && typeof payload === 'object') {
    for (const [date, metrics] of Object.entries(payload)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) rows.push({ date, metrics });
    }
  }
  return rows;
}

async function syncAccount(account, { backfill } = {}) {
  const end = new Date();
  const start = backfill || !account.lastAnalyticsSyncAt ? subDays(end, 89) : subDays(end, 2);
  const analytics = await pinterestAnalytics.getAccountAnalytics(account, start, end);
  for (const row of flattenDaily(analytics)) {
    await AccountMetricSnapshot.updateOne(
      { account: account._id, date: row.date },
      { $set: { metrics: row.metrics, followerCount: account.followerCount } },
      { upsert: true }
    );
  }

  const posts = await Post.find({
    account: account._id,
    status: 'published',
    pinterestPinId: { $exists: true, $ne: null },
  }).select('pinterestPinId publishedAt lastPinAnalyticsSyncAt');

  for (const post of posts) {
    if (!shouldSyncPin(post, end)) continue;
    try {
      const pinData = await pinterestAnalytics.getPinAnalytics(
        account,
        post.pinterestPinId,
        subDays(end, 7),
        end
      );
      for (const row of flattenDaily(pinData)) {
        await PinMetricSnapshot.updateOne(
          { pinterestPinId: post.pinterestPinId, date: row.date },
          {
            $set: {
              account: account._id,
              post: post._id,
              metrics: row.metrics,
            },
          },
          { upsert: true }
        );
      }
      await Post.updateOne({ _id: post._id }, { $set: { lastPinAnalyticsSyncAt: end } });
    } catch (err) {
      logger.warn({ err, pinId: post.pinterestPinId }, 'Pin analytics sync failed');
    }
    await new Promise((r) => setTimeout(r, 1100));
  }

  account.lastAnalyticsSyncAt = new Date();
  await account.save();
}

async function run() {
  const accounts = await PinterestAccount.find({ status: 'active' });
  for (const account of accounts) {
    try {
      await syncAccount(account);
    } catch (err) {
      logger.warn({ err, accountId: String(account._id) }, 'analyticsSync failed');
    }
  }
}

function start() {
  cron.schedule('10 3 * * *', () => {
    run().catch((err) => logger.error({ err }, 'analyticsSync cron failed'));
  });
}

module.exports = { start, run, syncAccount, shouldSyncPin };
