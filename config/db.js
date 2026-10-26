const mongoose = require('mongoose');
const env = require('./env');
const logger = require('../utils/logger');

async function connect() {
  mongoose.set('strictQuery', true);
  mongoose.set('autoIndex', env.NODE_ENV !== 'production');
  await mongoose.connect(env.MONGO_URL);
  logger.info({ db: mongoose.connection.name }, 'MongoDB connected');
}

async function disconnect() {
  await mongoose.disconnect();
}

module.exports = { connect, disconnect };
