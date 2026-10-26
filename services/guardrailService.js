const { addMinutes } = require('date-fns');
const Post = require('../models/Post');
const Asset = require('../models/Asset');
const { accountDayKey } = require('../utils/dates');
const { normalizeTitle, normalizeLink } = require('../utils/hash');
const AppError = require('../utils/AppError');

const ACTIVE = ['scheduled', 'queued', 'publishing', 'published'];

async function checkSchedule(account, proposedTimes, { excludeId } = {}) {
  const violations = [];
  const suggested = [];
  const cap = account.limits?.dailyCap ?? 15;
  const minGap = account.limits?.minGapMinutes ?? 20;
  const timezone = account.timezone || 'UTC';

  const existing = await Post.find({
    account: account._id,
    status: { $in: ['scheduled', 'queued', 'publishing', 'published'] },
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  }).select('scheduledAt publishedAt status');

  const counts = {};
  const times = [];
  for (const post of existing) {
    const at = post.publishedAt || post.scheduledAt;
    if (!at) continue;
    const key = accountDayKey(at, timezone);
    counts[key] = (counts[key] || 0) + 1;
    times.push(new Date(at).getTime());
  }

  for (const raw of proposedTimes) {
    let at = new Date(raw);
    if (Number.isNaN(at.getTime())) {
      throw new AppError(400, 'VALIDATION', 'Invalid scheduled time');
    }
    const key = accountDayKey(at, timezone);
    const dayCount = counts[key] || 0;
    if (dayCount >= cap) {
      violations.push({
        type: 'daily_cap',
        message: `Daily cap of ${cap} would be exceeded on ${key}`,
        at,
      });
    }
    const conflict = times
      .filter((time) => Math.abs(time - at.getTime()) < minGap * 60 * 1000)
      .sort((a, b) => a - b)
      .pop();
    if (conflict !== undefined) {
      violations.push({
        type: 'min_gap',
        message: `Minimum gap of ${minGap} minutes would be violated`,
        at,
      });
      at = addMinutes(new Date(conflict), minGap);
    }
    const adjustedKey = accountDayKey(at, timezone);
    counts[adjustedKey] = (counts[adjustedKey] || 0) + 1;
    times.push(at.getTime());
    suggested.push(at);
  }

  return { ok: violations.length === 0, violations, suggested };
}

async function findDuplicates(ownerId, candidates) {
  const results = [];
  const earlierCandidates = [];
  for (const candidate of candidates) {
    const issues = [];
    if (candidate.dedupeKey) {
      const same = await Post.findOne({
        owner: ownerId,
        account: candidate.accountId,
        dedupeKey: candidate.dedupeKey,
        status: { $in: ACTIVE },
        ...(candidate.excludeId ? { _id: { $ne: candidate.excludeId } } : {}),
      });
      if (same) {
        issues.push({
          level: 'block',
          reason: 'Identical image and link already scheduled or published on this account',
        });
      }
      if (
        earlierCandidates.some(
          (previous) =>
            String(previous.accountId) === String(candidate.accountId) &&
            previous.dedupeKey === candidate.dedupeKey
        )
      ) {
        issues.push({
          level: 'block',
          reason: 'Identical image and link appears more than once in this batch',
        });
      }
    }
    if (candidate.contentHash) {
      const matchingAssets = await Asset.find({
        owner: ownerId,
        contentHash: candidate.contentHash,
      }).select('_id');
      const duplicateOnOtherAccount = await Post.exists({
        owner: ownerId,
        account: { $ne: candidate.accountId },
        asset: { $in: matchingAssets.map((asset) => asset._id) },
        status: { $in: ACTIVE },
      });
      if (duplicateOnOtherAccount) {
        issues.push({
          level: 'warn',
          reason: 'Same image is used on another connected account',
        });
      }
      if (
        earlierCandidates.some(
          (previous) =>
            previous.contentHash === candidate.contentHash &&
            String(previous.accountId) !== String(candidate.accountId)
        )
      ) {
        issues.push({ level: 'warn', reason: 'Same image is used on another account in this batch' });
      }
    }
    if (candidate.link) {
      const link = normalizeLink(candidate.link);
      const others = await Post.find({
        owner: ownerId,
        link: { $exists: true, $ne: '' },
        status: { $in: ACTIVE },
      }).select('link account');
      if (others.some((p) => normalizeLink(p.link) === link && String(p.account) !== String(candidate.accountId))) {
        issues.push({ level: 'warn', reason: 'Same link is used on another account' });
      }
      if (
        earlierCandidates.some(
          (previous) =>
            normalizeLink(previous.link) === link &&
            String(previous.accountId) !== String(candidate.accountId)
        )
      ) {
        issues.push({ level: 'warn', reason: 'Same link is used on another account in this batch' });
      }
    }
    if (candidate.title) {
      const title = normalizeTitle(candidate.title);
      const count = await Post.countDocuments({
        owner: ownerId,
        status: { $in: ACTIVE },
        title: new RegExp(`^${String(candidate.title).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      });
      if (count >= 5 && title) {
        issues.push({ level: 'warn', reason: 'This title is repeated across many Pins' });
      }
    }
    const block = issues.find((i) => i.level === 'block');
    results.push({
      level: block ? 'block' : issues.length ? 'warn' : 'ok',
      issues,
    });
    earlierCandidates.push(candidate);
  }
  return results;
}

function crossPostCheck(accountIds, confirmCrossPost) {
  const unique = [...new Set(accountIds.map(String))];
  if (unique.length > 2 && !confirmCrossPost) {
    return {
      level: 'block',
      reason: 'Posting the same content to more than 2 accounts requires confirmCrossPost: true',
    };
  }
  return { level: 'ok' };
}

async function existingCrossPostAccounts(ownerId, rows) {
  const contentHashes = [...new Set(rows.map((row) => row.data?.contentHash).filter(Boolean))];
  if (!contentHashes.length) return new Map();

  const assets = await Asset.find({ owner: ownerId, contentHash: { $in: contentHashes } }).select(
    '_id contentHash'
  );
  const contentHashByAssetId = new Map(assets.map((asset) => [String(asset._id), asset.contentHash]));
  const posts = await Post.find({
    owner: ownerId,
    asset: { $in: assets.map((asset) => asset._id) },
    status: { $in: ACTIVE },
  }).select('account asset');
  const accountsByContentHash = new Map();
  for (const post of posts) {
    const contentHash = contentHashByAssetId.get(String(post.asset));
    if (!contentHash) continue;
    if (!accountsByContentHash.has(contentHash)) accountsByContentHash.set(contentHash, new Set());
    accountsByContentHash.get(contentHash).add(String(post.account));
  }
  return accountsByContentHash;
}

function crossPostIssues(rows, confirmCrossPost, existingAccountsByContentHash = new Map()) {
  const rowsByContent = new Map();
  for (const row of rows) {
    const contentHash = row.data?.contentHash;
    if (!contentHash || !row.data?.accountId) continue;
    if (!rowsByContent.has(contentHash)) rowsByContent.set(contentHash, []);
    rowsByContent.get(contentHash).push(row);
  }

  const issues = [];
  for (const matchingRows of rowsByContent.values()) {
    const result = crossPostCheck(
      [
        ...(existingAccountsByContentHash.get(matchingRows[0].data.contentHash) || []),
        ...matchingRows.map((row) => row.data.accountId),
      ],
      confirmCrossPost
    );
    if (result.level === 'block') {
      matchingRows.forEach((row) => issues.push({ row, reason: result.reason }));
    }
  }
  return issues;
}

module.exports = {
  checkSchedule,
  findDuplicates,
  crossPostCheck,
  crossPostIssues,
  existingCrossPostAccounts,
};
