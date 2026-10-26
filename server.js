const env = require('./config/env');
const db = require('./config/db');
const app = require('./app');
const logger = require('./utils/logger');

async function start() {
  await db.connect();
  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.PINTEREST_ENV }, 'API listening');
  });
}

start().catch((err) => {
  logger.error({ err }, 'Failed to start API');
  process.exit(1);
});
