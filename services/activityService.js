const ActivityLog = require('../models/ActivityLog');

async function log({ owner, account, kind, message, meta }) {
  return ActivityLog.create({ owner, account, kind, message, meta });
}

module.exports = { log };
