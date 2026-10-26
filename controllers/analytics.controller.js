const PinterestAccount = require('../models/PinterestAccount');
const Post = require('../models/Post');
const PinMetricSnapshot = require('../models/PinMetricSnapshot');
const AccountMetricSnapshot = require('../models/AccountMetricSnapshot');
const pinterestAnalytics = require('../services/pinterestAnalytics');
const { syncAccount } = require('../jobs/analyticsSync');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { ok } = require('../utils/response');

const lastSync = new Map();

async function ownedAccounts(userId, accountIds) {
  const filter = { owner: userId, status: { $ne: 'disconnected' } };
  if (accountIds?.length) filter._id = { $in: accountIds.split(',') };
  return PinterestAccount.find(filter);
}

const overview = asyncHandler(async (req, res) => {
  const accounts = await ownedAccounts(req.user._id, req.query.accountIds);
  const ids = accounts.map((a) => a._id);
  const query = { account: { $in: ids } };
  if (req.query.from) query.date = { ...(query.date || {}), $gte: String(req.query.from).slice(0, 10) };
  if (req.query.to) query.date = { ...(query.date || {}), $lte: String(req.query.to).slice(0, 10) };
  const rows = await AccountMetricSnapshot.find(query).sort({ date: 1 });
  const totals = {};
  for (const row of rows) {
    for (const [k, v] of Object.entries(row.metrics || {})) {
      const n = Number(v);
      if (!Number.isNaN(n)) totals[k] = (totals[k] || 0) + n;
    }
  }
  return ok(res, { totals, series: rows });
});

const accountSeries = asyncHandler(async (req, res) => {
  const account = await PinterestAccount.findOne({
    _id: req.params.accountId,
    owner: req.user._id,
  });
  if (!account) throw new AppError(404, 'NOT_FOUND', 'Account not found');
  const query = { account: account._id };
  if (req.query.from) query.date = { $gte: String(req.query.from).slice(0, 10) };
  if (req.query.to) query.date = { ...(query.date || {}), $lte: String(req.query.to).slice(0, 10) };
  const series = await AccountMetricSnapshot.find(query).sort({ date: 1 });
  return ok(res, series);
});

const topPins = asyncHandler(async (req, res) => {
  const account = await PinterestAccount.findOne({
    _id: req.params.accountId,
    owner: req.user._id,
  });
  if (!account) throw new AppError(404, 'NOT_FOUND', 'Account not found');
  const data = await pinterestAnalytics.getTopPins(account, req.query.from, req.query.to, req.query.sortBy);
  return ok(res, data);
});

const pinSeries = asyncHandler(async (req, res) => {
  const accounts = await ownedAccounts(req.user._id);
  const query = {
    pinterestPinId: req.params.pinterestPinId,
    account: { $in: accounts.map((account) => account._id) },
  };
  if (req.query.from) query.date = { $gte: String(req.query.from).slice(0, 10) };
  if (req.query.to) query.date = { ...(query.date || {}), $lte: String(req.query.to).slice(0, 10) };
  const series = await PinMetricSnapshot.find(query).sort({ date: 1 });
  return ok(res, series);
});

const posts = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(50, Number(req.query.limit || 20));
  const filter = { owner: req.user._id, status: 'published' };
  if (req.query.accountId) filter.account = req.query.accountId;
  const items = await Post.find(filter)
    .sort({ publishedAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate('asset', 'secureUrl');
  const pinIds = items.map((p) => p.pinterestPinId).filter(Boolean);
  const latest = await PinMetricSnapshot.aggregate([
    { $match: { pinterestPinId: { $in: pinIds } } },
    { $sort: { date: -1 } },
    { $group: { _id: '$pinterestPinId', metrics: { $first: '$metrics' }, date: { $first: '$date' } } },
  ]);
  const map = Object.fromEntries(latest.map((l) => [l._id, l]));
  return ok(
    res,
    items.map((p) => ({ ...p.toObject(), latestMetrics: map[p.pinterestPinId] || null })),
    { page, limit }
  );
});

const sync = asyncHandler(async (req, res) => {
  const account = await PinterestAccount.findOne({
    _id: req.params.accountId,
    owner: req.user._id,
  });
  if (!account) throw new AppError(404, 'NOT_FOUND', 'Account not found');
  const key = String(account._id);
  const prev = lastSync.get(key);
  if (prev && Date.now() - prev < 10 * 60 * 1000) {
    throw new AppError(429, 'RATE_LIMIT', 'Manual analytics sync is limited to once per 10 minutes');
  }
  lastSync.set(key, Date.now());
  await syncAccount(account, { backfill: !account.lastAnalyticsSyncAt });
  return ok(res, { success: true, lastAnalyticsSyncAt: account.lastAnalyticsSyncAt });
});

const exportCsv = asyncHandler(async (req, res) => {
  const accounts = await ownedAccounts(req.user._id, req.query.accountIds);
  const filter = { account: { $in: accounts.map((a) => a._id) } };
  if (req.query.from || req.query.to) {
    filter.date = {};
    if (req.query.from) filter.date.$gte = String(req.query.from).slice(0, 10);
    if (req.query.to) filter.date.$lte = String(req.query.to).slice(0, 10);
  }
  const rows = await AccountMetricSnapshot.find(filter).sort({ date: 1 });
  const records = rows.map((r) => ({
    account: String(r.account),
    date: r.date,
    ...(r.metrics || {}),
  }));
  const headers = [...new Set(records.flatMap((r) => Object.keys(r)))];
  const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csv = [
    headers.join(','),
    ...records.map((r) => headers.map((h) => escape(r[h])).join(',')),
  ].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="analytics.csv"');
  res.send(csv);
});

module.exports = { overview, accountSeries, topPins, pinSeries, posts, sync, exportCsv };
