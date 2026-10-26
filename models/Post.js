const mongoose = require('mongoose');

const postSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'PinterestAccount', required: true, index: true },
    board: { type: mongoose.Schema.Types.ObjectId, ref: 'Board' },
    pinterestBoardId: String,
    pinterestSectionId: String,
    title: { type: String, maxlength: 100 },
    description: { type: String, maxlength: 800 },
    altText: { type: String, maxlength: 500 },
    link: { type: String, maxlength: 2048 },
    asset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset' },
    mediaType: { type: String, enum: ['image', 'video'], default: 'image' },
    coverAsset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset' },
    aiGenerated: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['draft', 'scheduled', 'queued', 'publishing', 'published', 'failed', 'cancelled'],
      default: 'draft',
    },
    scheduledAt: { type: Date, index: true },
    publishedAt: Date,
    lastPinAnalyticsSyncAt: Date,
    claimedBy: String,
    claimedAt: Date,
    attempts: { type: Number, default: 0 },
    lastError: {
      kind: String,
      code: String,
      message: String,
      at: Date,
    },
    nextAttemptAt: Date,
    pinterestPinId: String,
    pinUrl: String,
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'BulkBatch' },
    batchRowId: String,
    dedupeKey: { type: String, index: true },
    missed: { type: Boolean, default: false },
  },
  { timestamps: true, optimisticConcurrency: true }
);

postSchema.index({ status: 1, scheduledAt: 1 });
postSchema.index({ account: 1, status: 1, scheduledAt: 1 });
postSchema.index(
  { batch: 1, batchRowId: 1 },
  { unique: true, partialFilterExpression: { batchRowId: { $type: 'string' } } }
);

module.exports = mongoose.model('Post', postSchema);
