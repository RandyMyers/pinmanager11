const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'PinterestAccount' },
    kind: { type: String, required: true },
    message: String,
    meta: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);

activitySchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });
activitySchema.index({ owner: 1, createdAt: -1 });

module.exports = mongoose.model('ActivityLog', activitySchema);
