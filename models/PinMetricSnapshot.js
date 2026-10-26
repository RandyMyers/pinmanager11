const mongoose = require('mongoose');

const pinMetricSchema = new mongoose.Schema(
  {
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'PinterestAccount', required: true, index: true },
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
    pinterestPinId: { type: String, required: true },
    date: { type: String, required: true },
    metrics: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

pinMetricSchema.index({ pinterestPinId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('PinMetricSnapshot', pinMetricSchema);
