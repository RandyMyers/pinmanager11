const Post = require('../models/Post');
const Asset = require('../models/Asset');
const Board = require('../models/Board');
const PinterestAccount = require('../models/PinterestAccount');
const pinterestPins = require('../services/pinterestPins');
const guardrailService = require('../services/guardrailService');
const activityService = require('../services/activityService');
const { dedupeKey } = require('../utils/hash');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { ok } = require('../utils/response');
const { assertRequiredPinFields } = require('../utils/pinContent');

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function loadOwnedAccount(userId, accountId) {
  const account = await PinterestAccount.findOne({
    _id: accountId,
    owner: userId,
    status: { $ne: 'disconnected' },
  });
  if (!account) throw new AppError(404, 'NOT_FOUND', 'Account not found');
  return account;
}

async function resolveBoard(account, boardId, pinterestBoardId) {
  if (boardId) {
    const board = await Board.findOne({
      _id: boardId,
      account: account._id,
      deletedOnPinterest: false,
    });
    if (!board) throw new AppError(400, 'VALIDATION', 'Board not found for this account');
    return board;
  }
  if (pinterestBoardId) {
    return Board.findOne({ account: account._id, pinterestBoardId, deletedOnPinterest: false });
  }
  return null;
}

async function runGuardrails(user, account, payload, excludeId) {
  const results = { schedule: null, duplicates: null };
  if (payload.scheduledAt && payload.status !== 'draft') {
    results.schedule = await guardrailService.checkSchedule(account, [payload.scheduledAt], {
      excludeId,
    });
  }
  results.duplicates = (
    await guardrailService.findDuplicates(user._id, [
      {
        accountId: account._id,
        dedupeKey: payload.dedupeKey,
        contentHash: payload.contentHash,
        link: payload.link,
        title: payload.title,
        excludeId,
      },
    ])
  )[0];
  const blocked =
    results.duplicates?.level === 'block' ||
    Boolean(results.schedule?.violations.length);
  return { ...results, blocked };
}

const list = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Number(req.query.limit || 20));
  const filter = { owner: req.user._id };
  if (req.query.accountId) filter.account = req.query.accountId;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.from || req.query.to) {
    filter.scheduledAt = {};
    if (req.query.from) filter.scheduledAt.$gte = new Date(req.query.from);
    if (req.query.to) filter.scheduledAt.$lte = new Date(req.query.to);
  }
  if (req.query.q) {
    const query = escapeRegex(req.query.q);
    filter.$or = [
      { title: new RegExp(query, 'i') },
      { description: new RegExp(query, 'i') },
    ];
  }
  const [items, total] = await Promise.all([
    Post.find(filter)
      .populate('asset')
      .populate('account', 'username status env timezone')
      .sort({ scheduledAt: 1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Post.countDocuments(filter),
  ]);
  return ok(res, items, { page, limit, total });
});

const create = asyncHandler(async (req, res) => {
  const account = await loadOwnedAccount(req.user._id, req.body.accountId);
  const asset = await Asset.findOne({ _id: req.body.assetId, owner: req.user._id });
  if (!asset) throw new AppError(400, 'VALIDATION', 'Asset not found');
  if (!['image', 'video'].includes(asset.resourceType)) {
    throw new AppError(400, 'VALIDATION', 'Only image and video posts are supported');
  }
  const coverAsset = req.body.coverAssetId
    ? await Asset.findOne({ _id: req.body.coverAssetId, owner: req.user._id, resourceType: 'image' })
    : null;
  if (asset.resourceType === 'video' && !coverAsset) {
    throw new AppError(400, 'VALIDATION', 'Video posts require an owned image cover asset');
  }
  if (asset.resourceType === 'image' && req.body.coverAssetId) {
    throw new AppError(400, 'VALIDATION', 'Cover assets can only be used with video posts');
  }
  const board = await resolveBoard(account, req.body.boardId, req.body.pinterestBoardId);
  if (!board) throw new AppError(400, 'VALIDATION', 'Board not found for this account');
  if (
    req.body.pinterestSectionId &&
    !board.sections.some((section) => section.pinterestSectionId === req.body.pinterestSectionId)
  ) {
    throw new AppError(400, 'VALIDATION', 'Section not found on this board');
  }
  if (req.body.scheduledAt && new Date(req.body.scheduledAt) <= new Date()) {
    throw new AppError(400, 'VALIDATION', 'scheduledAt must be in the future');
  }

  const content = {
    title: req.body.title ?? asset.title,
    description: req.body.description ?? asset.description,
    altText: req.body.altText ?? asset.altText,
    link: req.body.link ?? asset.link,
  };
  const key = dedupeKey(account._id, asset.contentHash, content.link);
  const status = req.body.status || (req.body.scheduledAt ? 'scheduled' : 'draft');
  if (status === 'scheduled') assertRequiredPinFields(content);
  const guardrails = await runGuardrails(req.user, account, {
    scheduledAt: req.body.scheduledAt,
    status,
    dedupeKey: key,
    contentHash: asset.contentHash,
    link: content.link,
    title: content.title,
  });
  if (guardrails.blocked) {
    throw new AppError(409, 'GUARDRAIL', 'Post blocked by guardrails', guardrails);
  }

  const post = await Post.create({
    owner: req.user._id,
    account: account._id,
    board: board?._id,
    pinterestBoardId: board.pinterestBoardId,
    pinterestSectionId: req.body.pinterestSectionId,
    title: content.title,
    description: content.description,
    altText: content.altText,
    link: content.link,
    asset: asset._id,
    mediaType: asset.resourceType,
    coverAsset: coverAsset?._id,
    aiGenerated: !!req.body.aiGenerated,
    status,
    scheduledAt: req.body.scheduledAt,
    dedupeKey: key,
  });
  return ok(res, { post, guardrails }, undefined, 201);
});

const detail = asyncHandler(async (req, res) => {
  const post = await Post.findOne({ _id: req.params.id, owner: req.user._id })
    .populate('asset')
    .populate('coverAsset')
    .populate('account', 'username status env timezone limits');
  if (!post) throw new AppError(404, 'NOT_FOUND', 'Post not found');
  return ok(res, post);
});

const update = asyncHandler(async (req, res) => {
  const post = await Post.findOne({ _id: req.params.id, owner: req.user._id });
  if (!post) throw new AppError(404, 'NOT_FOUND', 'Post not found');
  if (['publishing', 'published'].includes(post.status)) {
    throw new AppError(409, 'LOCKED', 'Cannot edit a post that is publishing or already published');
  }
  const account = await loadOwnedAccount(req.user._id, post.account);
  const asset = req.body.assetId
    ? await Asset.findOne({ _id: req.body.assetId, owner: req.user._id })
    : await Asset.findById(post.asset);
  if (!asset) throw new AppError(400, 'VALIDATION', 'Asset not found');
  if (!['image', 'video'].includes(asset.resourceType)) {
    throw new AppError(400, 'VALIDATION', 'Only image and video posts are supported');
  }
  const coverAssetId = req.body.coverAssetId || post.coverAsset;
  const coverAsset = coverAssetId
    ? await Asset.findOne({ _id: coverAssetId, owner: req.user._id, resourceType: 'image' })
    : null;
  if (asset.resourceType === 'video' && !coverAsset) {
    throw new AppError(400, 'VALIDATION', 'Video posts require an owned image cover asset');
  }
  if (asset.resourceType === 'image' && req.body.coverAssetId) {
    throw new AppError(400, 'VALIDATION', 'Cover assets can only be used with video posts');
  }
  let boardChanged = false;
  if (req.body.boardId || req.body.pinterestBoardId) {
    const board = await resolveBoard(account, req.body.boardId, req.body.pinterestBoardId);
    if (!board) throw new AppError(400, 'VALIDATION', 'Board not found for this account');
    post.board = board._id;
    post.pinterestBoardId = board.pinterestBoardId;
    boardChanged = true;
    if (
      req.body.pinterestSectionId &&
      !board.sections.some((section) => section.pinterestSectionId === req.body.pinterestSectionId)
    ) {
      throw new AppError(400, 'VALIDATION', 'Section not found on this board');
    }
    if (boardChanged && req.body.pinterestSectionId === undefined) post.pinterestSectionId = undefined;
  } else if (req.body.pinterestSectionId !== undefined) {
    const board = await Board.findOne({ _id: post.board, account: account._id });
    if (
      req.body.pinterestSectionId &&
      !board?.sections.some((section) => section.pinterestSectionId === req.body.pinterestSectionId)
    ) {
      throw new AppError(400, 'VALIDATION', 'Section not found on this board');
    }
  }
  ['title', 'description', 'altText', 'link', 'pinterestSectionId', 'aiGenerated', 'scheduledAt', 'status'].forEach(
    (field) => {
      if (req.body[field] !== undefined) post[field] = req.body[field];
    }
  );
  post.asset = asset._id;
  post.mediaType = asset.resourceType;
  post.coverAsset = asset.resourceType === 'video' ? coverAsset._id : undefined;
  post.dedupeKey = dedupeKey(account._id, asset.contentHash, post.link);
  if (post.status === 'scheduled' && !post.scheduledAt) {
    throw new AppError(400, 'VALIDATION', 'A scheduled post requires scheduledAt');
  }
  if (post.status === 'scheduled') assertRequiredPinFields(post);
  if (post.status === 'scheduled' && new Date(post.scheduledAt) <= new Date()) {
    throw new AppError(400, 'VALIDATION', 'scheduledAt must be in the future');
  }
  const guardrails = await runGuardrails(
    req.user,
    account,
    {
      scheduledAt: post.scheduledAt,
      status: post.status,
      dedupeKey: post.dedupeKey,
      contentHash: asset?.contentHash,
      link: post.link,
      title: post.title,
    },
    post._id
  );
  if (guardrails.blocked) throw new AppError(409, 'GUARDRAIL', 'Update blocked by guardrails', guardrails);
  await post.save();
  return ok(res, { post, guardrails });
});

const publishNow = asyncHandler(async (req, res) => {
  const post = await Post.findOne({ _id: req.params.id, owner: req.user._id });
  if (!post) throw new AppError(404, 'NOT_FOUND', 'Post not found');
  if (['publishing', 'published', 'cancelled'].includes(post.status)) {
    throw new AppError(409, 'LOCKED', 'Post cannot be published now');
  }
  assertRequiredPinFields(post);
  const account = await loadOwnedAccount(req.user._id, post.account);
  const guardrails = await runGuardrails(req.user, account, {
    scheduledAt: new Date(),
    dedupeKey: post.dedupeKey,
    link: post.link,
    title: post.title,
  }, post._id);
  if (guardrails.blocked) throw new AppError(409, 'GUARDRAIL', 'Publish blocked by guardrails', guardrails);
  post.scheduledAt = new Date();
  post.status = 'scheduled';
  post.nextAttemptAt = undefined;
  await post.save();
  return ok(res, { post, guardrails });
});

const retry = asyncHandler(async (req, res) => {
  const post = await Post.findOne({ _id: req.params.id, owner: req.user._id, status: 'failed' });
  if (!post) throw new AppError(404, 'NOT_FOUND', 'Failed post not found');
  assertRequiredPinFields(post);
  if (
    post.lastError?.kind === 'PUBLISH_OUTCOME_UNKNOWN' &&
    req.body?.confirmOutcomeUnknown !== true
  ) {
    throw new AppError(
      409,
      'CONFIRM_REQUIRED',
      'Verify the Pin does not already exist on Pinterest, then retry with confirmOutcomeUnknown=true'
    );
  }
  const account = await loadOwnedAccount(req.user._id, post.account);
  const guardrails = await runGuardrails(req.user, account, {
    scheduledAt: new Date(),
    dedupeKey: post.dedupeKey,
    contentHash: (await Asset.findById(post.asset))?.contentHash,
    link: post.link,
    title: post.title,
  }, post._id);
  if (guardrails.blocked) throw new AppError(409, 'GUARDRAIL', 'Retry blocked by guardrails', guardrails);
  const updated = await Post.findOneAndUpdate(
    { _id: post._id, owner: req.user._id, status: 'failed' },
    {
      $set: { status: 'scheduled', scheduledAt: new Date(), missed: false },
      $unset: { nextAttemptAt: 1, claimedBy: 1, claimedAt: 1 },
      $inc: { __v: 1 },
    },
    { new: true }
  );
  if (!updated) throw new AppError(409, 'LOCKED', 'Post changed before it could be retried');
  return ok(res, { post: updated, guardrails });
});

const cancel = asyncHandler(async (req, res) => {
  const post = await Post.findOne({ _id: req.params.id, owner: req.user._id });
  if (!post) throw new AppError(404, 'NOT_FOUND', 'Post not found');
  if (!['draft', 'scheduled', 'queued', 'failed'].includes(post.status)) {
    throw new AppError(409, 'LOCKED', 'Only draft/scheduled/failed posts can be cancelled');
  }
  const cancelled = await Post.findOneAndUpdate(
    { _id: post._id, owner: req.user._id, status: post.status },
    { $set: { status: 'cancelled' }, $unset: { claimedBy: 1, claimedAt: 1 }, $inc: { __v: 1 } },
    { new: true }
  );
  if (!cancelled) throw new AppError(409, 'LOCKED', 'Post changed before it could be cancelled');
  return ok(res, cancelled);
});

const remove = asyncHandler(async (req, res) => {
  const post = await Post.findOne({ _id: req.params.id, owner: req.user._id });
  if (!post) throw new AppError(404, 'NOT_FOUND', 'Post not found');
  if (post.status === 'published' && req.query.alsoOnPinterest === 'true' && post.pinterestPinId) {
    const account = await loadOwnedAccount(req.user._id, post.account);
    await pinterestPins.deletePin(account, post.pinterestPinId);
  }
  if (!['draft', 'failed', 'cancelled', 'published'].includes(post.status)) {
    throw new AppError(409, 'LOCKED', 'Cancel the post before deleting it');
  }
  const deleted = await Post.findOneAndDelete({
    _id: post._id,
    owner: req.user._id,
    status: post.status,
    __v: post.__v,
  });
  if (!deleted) throw new AppError(409, 'LOCKED', 'Post changed before it could be deleted');
  return ok(res, { success: true });
});

const bulkAction = asyncHandler(async (req, res) => {
  const { ids, action, scheduledAt } = req.body;
  if (action === 'reschedule' && new Date(scheduledAt) <= new Date()) {
    throw new AppError(400, 'VALIDATION', 'scheduledAt must be in the future');
  }
  const posts = await Post.find({ _id: { $in: ids }, owner: req.user._id });
  let updated = 0;
  const failures = [];
  for (const post of posts) {
    if (action === 'cancel' && ['draft', 'scheduled', 'queued', 'failed'].includes(post.status)) {
      const result = await Post.findOneAndUpdate(
        { _id: post._id, owner: req.user._id, status: post.status },
        { $set: { status: 'cancelled' }, $unset: { claimedBy: 1, claimedAt: 1 }, $inc: { __v: 1 } }
      );
      if (result) updated += 1;
    } else if (action === 'delete' && ['draft', 'failed', 'cancelled'].includes(post.status)) {
      const result = await Post.findOneAndDelete({
        _id: post._id,
        owner: req.user._id,
        status: post.status,
        __v: post.__v,
      });
      if (result) updated += 1;
    } else if (action === 'reschedule' && ['draft', 'scheduled', 'failed'].includes(post.status)) {
      const account = await loadOwnedAccount(req.user._id, post.account);
      const guardrails = await runGuardrails(
        req.user,
        account,
        {
          scheduledAt,
          status: 'scheduled',
          dedupeKey: post.dedupeKey,
          contentHash: (await Asset.findById(post.asset))?.contentHash,
          link: post.link,
          title: post.title,
        },
        post._id
      );
      if (guardrails.blocked) {
        failures.push({ id: String(post._id), code: 'GUARDRAIL', guardrails });
        continue;
      }
      const result = await Post.findOneAndUpdate(
        { _id: post._id, owner: req.user._id, status: post.status },
        {
          $set: { scheduledAt, status: 'scheduled' },
          $unset: { nextAttemptAt: 1 },
          $inc: { __v: 1 },
        }
      );
      if (result) updated += 1;
      else failures.push({ id: String(post._id), code: 'LOCKED' });
    }
  }
  return ok(res, { updated, failures });
});

module.exports = { list, create, detail, update, publishNow, retry, cancel, remove, bulkAction };
