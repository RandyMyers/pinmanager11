const { subHours } = require('date-fns');
const Post = require('../models/Post');
const PinterestAccount = require('../models/PinterestAccount');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');

const summary = asyncHandler(async (req, res) => {
  const accounts = await PinterestAccount.find({
    owner: req.user._id,
    status: { $ne: 'disconnected' },
  }).select('-tokens');

  const perAccount = [];
  for (const account of accounts) {
    const counts = await Post.aggregate([
      { $match: { account: account._id } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    perAccount.push({
      account: {
        id: account._id,
        username: account.username,
        status: account.status,
        env: account.env,
      },
      counts: Object.fromEntries(counts.map((c) => [c._id, c.count])),
    });
  }

  const nextScheduled = await Post.find({
    owner: req.user._id,
    status: 'scheduled',
  })
    .sort({ scheduledAt: 1 })
    .limit(10)
    .populate('account', 'username')
    .populate('asset', 'secureUrl');

  const failures = await Post.find({
    owner: req.user._id,
    status: 'failed',
    updatedAt: { $gte: subHours(new Date(), 24) },
  }).populate('account', 'username');

  const needsReconnect = accounts.filter((a) => a.status === 'needs_reconnect');

  return ok(res, {
    perAccount,
    nextScheduled,
    failures,
    needsReconnect,
  });
});

module.exports = { summary };
