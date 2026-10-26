const mongoose = require('mongoose');

const accountMetricSchema = new mongoose.Schema(
  {
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'PinterestAccount', required: true },
    date: { type: String, required: true },
    metrics: { type: mongoose.Schema.Types.Mixed, default: {} },
    followerCount: Number,
  },
  { timestamps: true }
);

accountMetricSchema.index({ account: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('AccountMetricSnapshot', accountMetricSchema);
