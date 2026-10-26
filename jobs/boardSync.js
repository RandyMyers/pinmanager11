const cron = require('node-cron');
const PinterestAccount = require('../models/PinterestAccount');
const { syncAccountBoards } = require('../services/boardSyncService');
const logger = require('../utils/logger');

async function run() {
  const accounts = await PinterestAccount.find({ status: 'active' });
  for (const account of accounts) {
    try {
      await syncAccountBoards(account);
    } catch (err) {
      logger.warn({ err, accountId: String(account._id) }, 'boardSync failed');
    }
  }
}

function start() {
  cron.schedule('20 */6 * * *', () => {
    run().catch((err) => logger.error({ err }, 'boardSync cron failed'));
  });
}

module.exports = { start, run };
