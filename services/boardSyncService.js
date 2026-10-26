const Board = require('../models/Board');
const PinterestAccount = require('../models/PinterestAccount');
const pinterestBoards = require('./pinterestBoards');
const logger = require('../utils/logger');

async function syncAccountBoards(account) {
  const remote = await pinterestBoards.listBoards(account);
  const seen = new Set();
  for (const item of remote) {
    seen.add(String(item.id));
    let sections = [];
    try {
      const remoteSections = await pinterestBoards.listSections(account, item.id);
      sections = remoteSections.map((s) => ({ pinterestSectionId: s.id, name: s.name }));
    } catch (err) {
      logger.warn({ accountId: String(account._id), boardId: item.id, err }, 'Failed to list sections');
    }
    await Board.findOneAndUpdate(
      { account: account._id, pinterestBoardId: String(item.id) },
      {
        name: item.name,
        description: item.description,
        privacy: item.privacy,
        pinCount: item.pin_count,
        followerCount: item.follower_count,
        coverImageUrl: item.media?.image_cover_url,
        sections,
        lastSyncedAt: new Date(),
        deletedOnPinterest: false,
      },
      { upsert: true, new: true }
    );
  }
  await Board.updateMany(
    { account: account._id, pinterestBoardId: { $nin: [...seen] } },
    { deletedOnPinterest: true }
  );
  await PinterestAccount.findByIdAndUpdate(account._id, { lastBoardSyncAt: new Date() });
  return Board.find({ account: account._id, deletedOnPinterest: false }).sort({ name: 1 });
}

module.exports = { syncAccountBoards };
