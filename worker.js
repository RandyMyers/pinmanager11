const env = require('./config/env');
const db = require('./config/db');
const logger = require('./utils/logger');
const publishScheduler = require('./jobs/publishScheduler');
const tokenRefresher = require('./jobs/tokenRefresher');
const analyticsSync = require('./jobs/analyticsSync');
const boardSync = require('./jobs/boardSync');
const boardJobRunner = require('./jobs/boardJobRunner');

async function start() {
  await db.connect();
  publishScheduler.start();
  tokenRefresher.start();
  analyticsSync.start();
  boardSync.start();
  boardJobRunner.start();
  logger.info({ tick: env.WORKER_TICK_SECONDS }, 'Worker started');
}

start().catch((err) => {
  logger.error({ err }, 'Failed to start worker');
  process.exit(1);
});
