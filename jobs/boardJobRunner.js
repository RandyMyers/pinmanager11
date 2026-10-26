const BoardJob = require('../models/BoardJob');
const Board = require('../models/Board');
const PinterestAccount = require('../models/PinterestAccount');
const pinterestBoards = require('../services/pinterestBoards');
const logger = require('../utils/logger');

async function processJob(job) {
  const account = await PinterestAccount.findById(job.account);
  if (!account || account.status !== 'active') return;

  const claimed = await BoardJob.findOneAndUpdate(
    { _id: job._id, status: 'pending' },
    { status: 'running', $inc: { attempts: 1 } },
    { new: true }
  );
  if (!claimed) return;

  try {
    if (claimed.kind === 'board') {
      const created = await pinterestBoards.createBoard(account, {
        name: claimed.payload.name,
        description: claimed.payload.description,
        privacy: claimed.payload.privacy || 'PUBLIC',
      });
      claimed.resultPinterestId = created.id;
      claimed.status = 'done';
      await claimed.save();
      await Board.findOneAndUpdate(
        { account: account._id, pinterestBoardId: String(created.id) },
        {
          name: created.name,
          description: created.description,
          privacy: created.privacy,
          lastSyncedAt: new Date(),
          deletedOnPinterest: false,
        },
        { upsert: true }
      );
    } else {
      let boardId = claimed.payload.boardId;
      if (!boardId && claimed.payload.dependsOnJob) {
        const parent = await BoardJob.findById(claimed.payload.dependsOnJob);
        if (!parent || parent.status !== 'done') {
          claimed.status = 'pending';
          await claimed.save();
          return;
        }
        boardId = parent.resultPinterestId;
      }
      const created = await pinterestBoards.createSection(account, boardId, {
        name: claimed.payload.name,
      });
      claimed.resultPinterestId = created.id;
      claimed.status = 'done';
      await claimed.save();
    }
  } catch (err) {
    logger.warn({ err, jobId: String(claimed._id) }, 'Board job failed');
    claimed.lastError = err.message;
    claimed.status = claimed.attempts >= 3 ? 'failed' : 'pending';
    await claimed.save();
  }
}

async function tick() {
  const pending = await BoardJob.find({ status: 'pending' }).sort({ createdAt: 1 }).limit(20);
  const seen = new Set();
  for (const job of pending) {
    const key = String(job.account);
    if (seen.has(key)) continue;
    seen.add(key);
    await processJob(job);
  }
}

function start() {
  return setInterval(() => {
    tick().catch((err) => logger.error({ err }, 'boardJobRunner tick failed'));
  }, 10000);
}

module.exports = { start, tick };
