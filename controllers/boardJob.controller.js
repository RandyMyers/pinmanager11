const BoardJob = require('../models/BoardJob');
const PinterestAccount = require('../models/PinterestAccount');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { ok } = require('../utils/response');
const { nanoid } = require('nanoid');

const create = asyncHandler(async (req, res) => {
  const account = await PinterestAccount.findOne({
    _id: req.body.accountId,
    owner: req.user._id,
    status: { $ne: 'disconnected' },
  });
  if (!account) throw new AppError(404, 'NOT_FOUND', 'Account not found');
  const batch = nanoid();
  const created = [];
  for (const [index, item] of req.body.items.entries()) {
    const job = await BoardJob.create({
      owner: req.user._id,
      account: account._id,
      kind: item.kind,
      payload: {
        name: item.name,
        description: item.description,
        privacy: item.privacy,
        boardId: item.boardId,
        dependsOnJob: item.dependsOnIndex != null ? created[item.dependsOnIndex]?._id : undefined,
      },
      batch,
    });
    created.push(job);
    void index;
  }
  return ok(res, created, { batch }, 201);
});

const list = asyncHandler(async (req, res) => {
  const filter = { owner: req.user._id };
  if (req.query.accountId) filter.account = req.query.accountId;
  const jobs = await BoardJob.find(filter).sort({ createdAt: -1 }).limit(200);
  return ok(res, jobs);
});

module.exports = { create, list };
