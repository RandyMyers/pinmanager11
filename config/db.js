const mongoose = require('mongoose');
const env = require('./env');
const logger = require('../utils/logger');

const isServerless = Boolean(
  process.env.VERCEL ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.FUNCTION_NAME ||
    process.env.LAMBDA_TASK_ROOT
);
let connectionPromise = null;

mongoose.set('strictQuery', true);
mongoose.set('autoIndex', env.NODE_ENV !== 'production');
mongoose.set('bufferCommands', false);

async function connect() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (!connectionPromise) {
    connectionPromise = mongoose
      .connect(env.MONGO_URL, {
        serverSelectionTimeoutMS: isServerless ? 8000 : 10000,
        connectTimeoutMS: isServerless ? 8000 : 15000,
        socketTimeoutMS: 45000,
        maxPoolSize: isServerless ? 1 : 10,
        minPoolSize: 0,
        maxIdleTimeMS: isServerless ? 10000 : 30000,
      })
      .then((connection) => {
        logger.info({ db: connection.connection.name }, 'MongoDB connected');
        return connection.connection;
      })
      .catch((error) => {
        connectionPromise = null;
        throw error;
      })
      .finally(() => {
        connectionPromise = null;
      });
  }

  return connectionPromise;
}

async function disconnect() {
  connectionPromise = null;
  await mongoose.disconnect();
}

module.exports = { connect, disconnect };
