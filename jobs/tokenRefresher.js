const cron = require('node-cron');
const { addDays } = require('date-fns');
const PinterestAccount = require('../models/PinterestAccount');
const tokenService = require('../services/tokenService');
const activityService = require('../services/activityService');
const logger = require('../utils/logger');

async function run() {
  const accounts = await PinterestAccount.find({ status: 'active' });
  for (const account of accounts) {
    try {
      if (tokenService.accessExpiresSoon(account, 7)) {
        await tokenService.getValidAccessToken(account, { refreshBeforeHours: 24 * 7 });
      }
      if (account.tokens?.refreshExpiresAt && account.tokens.refreshExpiresAt < addDays(new Date(), 10)) {
        await activityService.log({
          owner: account.owner,
          account: account._id,
          kind: 'account.reconnect_needed',
          message: 'Refresh token expires within 10 days',
        });
      }
    } catch (err) {
      logger.warn({ err, accountId: String(account._id) }, 'Token refresh job failed');
    }
  }
}

function start() {
  cron.schedule('15 * * * *', () => {
    run().catch((err) => logger.error({ err }, 'tokenRefresher failed'));
  });
}

module.exports = { start, run };
