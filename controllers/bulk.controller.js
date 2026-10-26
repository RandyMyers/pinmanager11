const { nanoid } = require('nanoid');
const mongoose = require('mongoose');
const BulkBatch = require('../models/BulkBatch');
const Board = require('../models/Board');
const Asset = require('../models/Asset');
const Post = require('../models/Post');
const PinterestAccount = require('../models/PinterestAccount');
const csvService = require('../services/csvService');
const scheduleService = require('../services/scheduleService');
const guardrailService = require('../services/guardrailService');
const cloudinaryService = require('../services/cloudinaryService');
const bulkSchema = require('../validators/bulk.schema');
const { dedupeKey } = require('../utils/hash');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { ok } = require('../utils/response');

async function loadAccount(userId, accountId) {
  const account = await PinterestAccount.findOne({
    _id: accountId,
    owner: userId,
    status: { $ne: 'disconnected' },
  });
  if (!account) throw new AppError(404, 'NOT_FOUND', 'Account not found');
  return account;
}

function applyTemplate(template = {}, asset, index) {
  const replace = (value) =>
    String(value || '')
      .replaceAll('{n}', String(index + 1))
      .replaceAll('{filename}', asset.originalFilename || '');
  return {
    title: replace(template.title).slice(0, 100),
    description: replace(template.description).slice(0, 800),
    link: replace(template.link).slice(0, 2048),
    altText: replace(template.altText).slice(0, 500),
  };
}

async function resolveBoard(account, boardValue) {
  if (!boardValue) return null;
  if (String(boardValue).match(/^[a-f0-9]{24}$/i)) {
    return Board.findOne({ _id: boardValue, account: account._id, deletedOnPinterest: false });
  }
  return Board.findOne({
    account: account._id,
    deletedOnPinterest: false,
    $or: [
      { pinterestBoardId: String(boardValue) },
      { name: new RegExp(`^${String(boardValue).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    ],
  });
}

function parseScheduleRule(value) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    throw new AppError(400, 'VALIDATION', 'scheduleRule must be valid JSON');
  }
}

function findAccount(accounts, identity) {
  const value = String(identity || '').trim().toLowerCase();
  if (!value) return [];
  return accounts.filter(
    (account) =>
      String(account._id).toLowerCase() === value ||
      String(account.username || '').toLowerCase() === value
  );
}

async function applyCrossPostGuardrail(ownerId, rows, confirmCrossPost) {
  const existingAccounts = await guardrailService.existingCrossPostAccounts(ownerId, rows);
  for (const { row, reason } of guardrailService.crossPostIssues(rows, confirmCrossPost, existingAccounts)) {
    row.errors.push(reason);
  }
}

async function enrichRows(user, accountsById, rows, scheduleRule) {
  const groupedRows = new Map();
  for (const row of rows) {
    row.rowId = row.rowId || nanoid();
    const account = accountsById.get(String(row.data.accountId));
    if (!account) {
      row.errors.push('Pinterest account could not be resolved');
      continue;
    }
    if (!groupedRows.has(String(account._id))) groupedRows.set(String(account._id), []);
    groupedRows.get(String(account._id)).push(row);
  }

  const candidates = [];
  const candidateRows = [];
  const scheduleByAccount = {};
  for (const [accountId, accountRows] of groupedRows) {
    const account = accountsById.get(accountId);
    const timezone = scheduleRule?.timezone || account.timezone;
    const needTimes = accountRows.filter((row) => !row.data.scheduledAt).length;
    const times = needTimes
      ? scheduleRule
        ? scheduleService.spread({
            count: needTimes,
            startAt: scheduleRule.startAt || new Date(),
            intervalMinutes:
              scheduleRule.intervalMinutes ?? Math.max(1, account.limits.minGapMinutes),
            windowStart: scheduleRule.windowStart,
            windowEnd: scheduleRule.windowEnd,
            perDay: scheduleRule.perDay ?? account.limits.dailyCap,
            jitterMinutes: scheduleRule.jitterMinutes ?? account.limits.jitterMinutes,
            timezone,
          })
        : []
      : [];
    let timeIndex = 0;
    const scheduledRows = [];

    for (const row of accountRows) {
      const data = row.data;
      if (data.title && (typeof data.title !== 'string' || data.title.length > 100)) {
        row.errors.push('title must be text up to 100 characters');
      }
      if (data.description && (typeof data.description !== 'string' || data.description.length > 800)) {
        row.errors.push('description must be text up to 800 characters');
      }
      if (data.altText && (typeof data.altText !== 'string' || data.altText.length > 500)) {
        row.errors.push('alt_text must be text up to 500 characters');
      }
      if (data.link) {
        try {
          if (data.link.length > 2048 || !['http:', 'https:'].includes(new URL(data.link).protocol)) {
            row.errors.push('link must be a valid http(s) URL up to 2048 characters');
          }
        } catch {
          row.errors.push('link must be a valid http(s) URL');
        }
      }
      const board = await resolveBoard(account, row.data.board || row.data.boardId);
      if (!board || board.deletedOnPinterest) row.errors.push('Could not resolve an active board from cache');
      else {
        row.data.boardId = String(board._id);
        row.data.pinterestBoardId = board.pinterestBoardId;
        if (row.data.section) {
          const section = board.sections.find(
            (item) => item.name.toLowerCase() === String(row.data.section).toLowerCase()
          );
          if (section) row.data.pinterestSectionId = section.pinterestSectionId;
          else row.warnings.push('Section not found on cached board');
        }
      }

      if (row.data.scheduledAt) {
        try {
          row.data.scheduledAt = csvService.parseScheduledAt(row.data.scheduledAt, timezone);
          if (row.data.scheduledAt <= new Date()) {
            row.errors.push('scheduled_at must be in the future');
          }
        } catch (err) {
          row.errors.push(err.message);
        }
      } else if (times[timeIndex]) {
        row.data.scheduledAt = times[timeIndex];
        timeIndex += 1;
      } else {
        row.errors.push('Provide scheduled_at or a scheduleRule to generate a schedule');
      }
      if (row.data.scheduledAt) scheduledRows.push(row);

      candidates.push({
        accountId: account._id,
        link: row.data.link,
        title: row.data.title,
        contentHash: row.data.contentHash,
        dedupeKey: row.data.dedupeKey,
      });
      candidateRows.push(row);
    }

    const schedule = await guardrailService.checkSchedule(
      account,
      scheduledRows.map((row) => row.data.scheduledAt)
    );
    scheduleByAccount[accountId] = schedule;
    for (const row of scheduledRows) {
      row.guardrails = {
        schedule: schedule.violations.filter(
          (violation) => new Date(violation.at).getTime() === new Date(row.data.scheduledAt).getTime()
        ),
      };
    }
  }

  const duplicates = await guardrailService.findDuplicates(user._id, candidates);
  candidateRows.forEach((row, index) => {
    row.guardrails = { ...(row.guardrails || {}), duplicates: duplicates[index] };
    if (duplicates[index]?.level === 'block') {
      row.errors.push(duplicates[index].issues[0]?.reason || 'Duplicate blocked');
    }
    if (duplicates[index]?.level === 'warn') {
      row.warnings.push(...duplicates[index].issues.map((issue) => issue.reason));
    }
  });
  return { rows, schedule: scheduleByAccount };
}

async function revalidateBatch(batch, userId) {
  const accountIds = [
    ...new Set(
      batch.rows
        .map((row) => String(row.data.accountId || batch.account || ''))
        .filter(Boolean)
    ),
  ];
  const accountDocs = await PinterestAccount.find({
    _id: { $in: accountIds },
    owner: userId,
    status: { $ne: 'disconnected' },
  });
  const accounts = new Map(accountDocs.map((account) => [String(account._id), account]));
  if (new Set(accountDocs.map((account) => account.env)).size > 1) {
    throw new AppError(400, 'VALIDATION', 'A bulk batch cannot mix sandbox and production accounts');
  }

  const candidateRows = [];
  const candidates = [];
  const scheduleGroups = new Map();
  for (const row of batch.rows) {
    row.errors = [];
    row.warnings = [];
    row.guardrails = {};
    const data = row.data || (row.data = {});
    const accountId = String(data.accountId || batch.account || '');
    const account = accounts.get(accountId);
    if (!account) {
      row.errors.push('Pinterest account not found');
      continue;
    }
    data.accountId = accountId;

    const asset = mongoose.isValidObjectId(data.assetId)
      ? await Asset.findOne({ _id: data.assetId, owner: userId, resourceType: 'image' })
      : null;
    if (!asset) row.errors.push('Image asset not found or is not owned by the current user');
    else {
      data.assetId = String(asset._id);
      data.contentHash = asset.contentHash;
      row.warnings.push(...cloudinaryService.dimensionWarnings(asset.width, asset.height));
    }

    if (typeof data.title !== 'string' && data.title != null) row.errors.push('title must be text');
    if (data.title && data.title.length > 100) row.errors.push('title exceeds 100 characters');
    if (data.description && (typeof data.description !== 'string' || data.description.length > 800)) {
      row.errors.push('description must be text up to 800 characters');
    }
    if (data.altText && (typeof data.altText !== 'string' || data.altText.length > 500)) {
      row.errors.push('alt_text must be text up to 500 characters');
    }
    if (data.link) {
      try {
        if (data.link.length > 2048 || !['http:', 'https:'].includes(new URL(data.link).protocol)) {
          row.errors.push('link must be a valid http(s) URL up to 2048 characters');
        }
      } catch {
        row.errors.push('link must be a valid http(s) URL');
      }
    }

    const board = await resolveBoard(account, data.boardId || data.pinterestBoardId || data.board);
    if (!board || board.deletedOnPinterest) row.errors.push('Board not found for this account');
    else {
      data.boardId = String(board._id);
      data.pinterestBoardId = board.pinterestBoardId;
      if (
        data.pinterestSectionId &&
        !board.sections.some((section) => section.pinterestSectionId === String(data.pinterestSectionId))
      ) {
        row.errors.push('Section not found on this board');
      }
    }

    if (data.scheduledAt) {
      try {
        data.scheduledAt =
          data.scheduledAt instanceof Date
            ? data.scheduledAt
            : csvService.parseScheduledAt(data.scheduledAt, batch.scheduleRule?.timezone || account.timezone);
        if (Number.isNaN(data.scheduledAt.getTime()) || data.scheduledAt <= new Date()) {
          row.errors.push('scheduled_at must be a valid future time');
        }
      } catch (err) {
        row.errors.push(err.message);
      }
    } else {
      row.errors.push('scheduled_at is required');
    }

    const existing = await Post.findOne({ batch: batch._id, batchRowId: row.rowId }).select('_id');
    if (existing) data.postId = String(existing._id);
      else delete data.postId;
    if (!data.postId && asset && data.scheduledAt && !row.errors.length) {
      data.dedupeKey = dedupeKey(account._id, asset.contentHash, data.link);
      candidates.push({
        accountId: account._id,
        link: data.link,
        title: data.title,
        contentHash: asset.contentHash,
        dedupeKey: data.dedupeKey,
      });
      candidateRows.push(row);
      if (!scheduleGroups.has(accountId)) scheduleGroups.set(accountId, []);
      scheduleGroups.get(accountId).push(row);
    }
  }

  for (const [accountId, rows] of scheduleGroups) {
    const schedule = await guardrailService.checkSchedule(
      accounts.get(accountId),
      rows.map((row) => row.data.scheduledAt)
    );
    rows.forEach((row, index) => {
      row.guardrails.schedule = schedule.violations.filter(
        (violation) =>
          new Date(violation.at).getTime() === new Date(row.data.scheduledAt).getTime()
      );
      if (row.guardrails.schedule.length) {
        row.errors.push(...row.guardrails.schedule.map((violation) => violation.message));
      }
    });
  }

  const duplicates = await guardrailService.findDuplicates(userId, candidates);
  candidateRows.forEach((row, index) => {
    row.guardrails.duplicates = duplicates[index];
    if (duplicates[index]?.level === 'block') {
      row.errors.push(duplicates[index].issues[0]?.reason || 'Duplicate blocked');
    }
    if (duplicates[index]?.level === 'warn') {
      row.warnings.push(...duplicates[index].issues.map((issue) => issue.reason));
    }
  });
  await applyCrossPostGuardrail(userId, batch.rows, batch.confirmCrossPost);
  batch.errorCount = batch.rows.filter((row) => row.errors.length).length;
  batch.validCount = batch.rows.filter((row) => !row.errors.length).length;
  batch.markModified('rows');
  return batch;
}

const previewCsv = asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError(400, 'VALIDATION', 'CSV file is required');
  const availableAccounts = await PinterestAccount.find({
    owner: req.user._id,
    status: { $ne: 'disconnected' },
  });
  const defaultAccount = req.body.accountId
    ? await loadAccount(req.user._id, req.body.accountId)
    : null;
  const parsed = csvService.parseCsv(req.file.buffer);
  if (!parsed.rows.length) throw new AppError(400, 'VALIDATION', 'CSV contains no data rows');
  const scheduleRule = parseScheduleRule(req.body.scheduleRule);
  const parsedRule = bulkSchema.scheduleRule.safeParse(scheduleRule);
  if (!parsedRule.success) {
    throw new AppError(400, 'VALIDATION', 'Invalid scheduleRule', parsedRule.error.flatten());
  }
  const accountsById = new Map();

  for (const row of parsed.rows) {
    const matches = row.data.account
      ? findAccount(availableAccounts, row.data.account)
      : defaultAccount
        ? [defaultAccount]
        : [];
    if (matches.length !== 1) {
      row.errors.push(matches.length > 1 ? 'Account name is ambiguous; use the account id' : 'Account not found');
      continue;
    }
    const account = matches[0];
    row.data.accountId = String(account._id);
    accountsById.set(String(account._id), account);
  }

  if (new Set([...accountsById.values()].map((account) => account.env)).size > 1) {
    throw new AppError(400, 'VALIDATION', 'A bulk batch cannot mix sandbox and production accounts');
  }

  for (const row of parsed.rows) {
    const account = accountsById.get(String(row.data.accountId));
    if (!account) continue;
    if (row.data.imageUrl && !row.errors.length) {
      try {
        const resource = await cloudinaryService.importFromUrl(row.data.imageUrl, req.user._id);
        const asset = await Asset.create({
          owner: req.user._id,
          cloudinaryPublicId: resource.public_id,
          secureUrl: resource.secure_url,
          resourceType: 'image',
          width: resource.width,
          height: resource.height,
          bytes: resource.bytes,
          format: resource.format,
          contentHash: cloudinaryService.hashFromResource(resource),
          originalFilename: resource.original_filename,
        });
        row.data.assetId = String(asset._id);
        row.data.contentHash = asset.contentHash;
        row.data.dedupeKey = dedupeKey(account._id, asset.contentHash, row.data.link);
        row.warnings.push(...cloudinaryService.dimensionWarnings(asset.width, asset.height));
      } catch (err) {
        row.errors.push(err.message || 'Failed to import image_url');
      }
    } else if (row.data.imageFile && !row.errors.length) {
      const asset = await Asset.findOne({
        owner: req.user._id,
        originalFilename: row.data.imageFile,
      }).sort({ createdAt: -1 });
      if (!asset) row.errors.push(`No uploaded asset matching ${row.data.imageFile}`);
      else {
        row.data.assetId = String(asset._id);
        row.data.contentHash = asset.contentHash;
        row.data.dedupeKey = dedupeKey(account._id, asset.contentHash, row.data.link);
      }
    }
  }

  const enriched = await enrichRows(req.user, accountsById, parsed.rows, scheduleRule);
  const confirmCrossPost = req.body.confirmCrossPost === true || req.body.confirmCrossPost === 'true';
  await applyCrossPostGuardrail(req.user._id, enriched.rows, confirmCrossPost);
  const accountIds = [...accountsById.keys()];
  const batch = await BulkBatch.create({
    owner: req.user._id,
    account: accountIds.length === 1 ? accountIds[0] : undefined,
    source: 'csv',
    status: 'previewed',
    rowCount: enriched.rows.length,
    validCount: enriched.rows.filter((r) => r.errors.length === 0).length,
    errorCount: enriched.rows.filter((r) => r.errors.length > 0).length,
    confirmCrossPost,
    rows: enriched.rows,
    scheduleRule,
  });
  return ok(res, batch, { scheduleByAccount: enriched.schedule });
});

const previewImages = asyncHandler(async (req, res) => {
  const account = await loadAccount(req.user._id, req.body.accountId);
  const board = await Board.findOne({
    _id: req.body.boardId,
    account: account._id,
    deletedOnPinterest: false,
  });
  if (!board) throw new AppError(400, 'VALIDATION', 'Board not found');
  const foundAssets = await Asset.find({
    _id: { $in: req.body.assetIds },
    owner: req.user._id,
    resourceType: 'image',
  });
  const assetsById = new Map(foundAssets.map((asset) => [String(asset._id), asset]));
  const assets = req.body.assetIds.map((assetId) => assetsById.get(assetId));
  if (assets.some((asset) => !asset)) {
    throw new AppError(400, 'VALIDATION', 'One or more image assets are missing or not owned by the current user');
  }
  const rows = assets.map((asset, index) => {
    const templated = applyTemplate(req.body.template, asset, index);
    return {
      row: index + 1,
      data: {
        ...templated,
        board: board.name,
        boardId: String(board._id),
        pinterestBoardId: board.pinterestBoardId,
        accountId: String(account._id),
        assetId: String(asset._id),
        contentHash: asset.contentHash,
        dedupeKey: dedupeKey(account._id, asset.contentHash, templated.link),
      },
      errors: [],
      warnings: cloudinaryService.dimensionWarnings(asset.width, asset.height),
    };
  });
  const enriched = await enrichRows(
    req.user,
    new Map([[String(account._id), account]]),
    rows,
    req.body.scheduleRule
  );
  const batch = await BulkBatch.create({
    owner: req.user._id,
    account: account._id,
    source: 'images',
    status: 'previewed',
    rowCount: enriched.rows.length,
    validCount: enriched.rows.filter((r) => r.errors.length === 0).length,
    errorCount: enriched.rows.filter((r) => r.errors.length > 0).length,
    rows: enriched.rows,
    scheduleRule: req.body.scheduleRule,
  });
  return ok(res, batch, { schedule: enriched.schedule });
});

const updateRow = asyncHandler(async (req, res) => {
  const batch = await BulkBatch.findOne({ _id: req.params.batchId, owner: req.user._id });
  if (!batch) throw new AppError(404, 'NOT_FOUND', 'Batch not found');
  if (!['previewed', 'partial'].includes(batch.status)) {
    throw new AppError(409, 'LOCKED', 'Only a previewed batch can be edited');
  }
  const row = batch.rows.find((r) => r.rowId === req.params.rowId);
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Row not found');
  if (row.data.postId) throw new AppError(409, 'LOCKED', 'A committed row cannot be edited');
  row.data = { ...row.data, ...req.body };
  row.errors = [];
  batch.markModified('rows');
  await batch.save();
  return ok(res, batch);
});

const commit = asyncHandler(async (req, res) => {
  let batch = await BulkBatch.findOne({ _id: req.params.batchId, owner: req.user._id });
  if (!batch) throw new AppError(404, 'NOT_FOUND', 'Batch not found');
  if (['committed', 'done'].includes(batch.status)) {
    return ok(res, { batch, created: 0 });
  }
  if (batch.status === 'cancelled') {
    throw new AppError(409, 'LOCKED', 'A cancelled batch cannot be committed');
  }
  const staleCommit = new Date(Date.now() - 10 * 60 * 1000);
  batch = await BulkBatch.findOneAndUpdate(
    {
      _id: batch._id,
      owner: req.user._id,
      $or: [
        { status: { $in: ['previewed', 'partial'] } },
        { status: 'committing', commitStartedAt: { $lte: staleCommit } },
      ],
    },
    { $set: { status: 'committing', commitStartedAt: new Date() } },
    { new: true }
  );
  if (!batch) throw new AppError(409, 'LOCKED', 'Batch is already being committed');

  const skipInvalid = !!req.body.skipInvalid;
  await revalidateBatch(batch, req.user._id);
  const invalid = batch.rows.filter((row) => row.errors.length);
  if (invalid.length && !skipInvalid) {
    batch.status = 'previewed';
    batch.commitStartedAt = undefined;
    await batch.save();
    throw new AppError(409, 'VALIDATION', 'Fix blocking row errors or pass skipInvalid: true', {
      errorCount: invalid.length,
      rows: invalid.map((row) => ({ rowId: row.rowId, row: row.row, errors: row.errors })),
    });
  }
  let created = 0;
  try {
    for (const row of batch.rows) {
      if (row.errors.length || row.data.postId) continue;
      const post = await Post.findOneAndUpdate(
        { batch: batch._id, batchRowId: row.rowId },
        {
          $setOnInsert: {
            owner: req.user._id,
            account: row.data.accountId || batch.account,
            board: row.data.boardId,
            pinterestBoardId: row.data.pinterestBoardId,
            pinterestSectionId: row.data.pinterestSectionId,
            title: row.data.title,
            description: row.data.description,
            altText: row.data.altText,
            link: row.data.link,
            asset: row.data.assetId,
            mediaType: 'image',
            status: 'scheduled',
            scheduledAt: row.data.scheduledAt,
            dedupeKey: row.data.dedupeKey,
            batch: batch._id,
            batchRowId: row.rowId,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      row.data.postId = String(post._id);
      created += 1;
    }
    batch.status = invalid.length ? 'partial' : 'committed';
    batch.commitStartedAt = undefined;
    batch.validCount = batch.rows.filter((row) => row.data.postId).length;
    batch.errorCount = invalid.length;
    batch.markModified('rows');
    await batch.save();
  } catch (err) {
    batch.status = 'partial';
    batch.commitStartedAt = undefined;
    batch.markModified('rows');
    await batch.save();
    throw err;
  }
  return ok(res, { batch, created });
});

const detail = asyncHandler(async (req, res) => {
  const batch = await BulkBatch.findOne({ _id: req.params.batchId, owner: req.user._id });
  if (!batch) throw new AppError(404, 'NOT_FOUND', 'Batch not found');
  return ok(res, batch);
});

const cancel = asyncHandler(async (req, res) => {
  const batch = await BulkBatch.findOne({
    _id: req.params.batchId,
    owner: req.user._id,
    status: { $ne: 'committing' },
  });
  if (!batch) throw new AppError(404, 'NOT_FOUND', 'Batch not found');
  const result = await Post.updateMany(
    { batch: batch._id, status: 'scheduled', owner: req.user._id },
    { status: 'cancelled' }
  );
  batch.status = 'cancelled';
  await batch.save();
  return ok(res, { cancelled: result.modifiedCount });
});

module.exports = { previewCsv, previewImages, updateRow, commit, detail, cancel };
