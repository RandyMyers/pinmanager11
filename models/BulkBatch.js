const mongoose = require('mongoose');

const bulkBatchSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'PinterestAccount' },
    source: { type: String, enum: ['csv', 'images', 'manual'], default: 'csv' },
    status: {
      type: String,
      enum: ['previewed', 'committing', 'committed', 'partial', 'done', 'cancelled'],
      default: 'previewed',
    },
    rowCount: { type: Number, default: 0 },
    validCount: { type: Number, default: 0 },
    errorCount: { type: Number, default: 0 },
    confirmCrossPost: { type: Boolean, default: false },
    warnings: { type: [mongoose.Schema.Types.Mixed], default: [] },
    rows: { type: [mongoose.Schema.Types.Mixed], default: [] },
    scheduleRule: {
      startAt: Date,
      intervalMinutes: Number,
      windowStart: String,
      windowEnd: String,
      perDay: Number,
      jitterMinutes: Number,
      timezone: String,
    },
    commitStartedAt: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model('BulkBatch', bulkBatchSchema);
