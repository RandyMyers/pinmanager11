const mongoose = require('mongoose');

const boardJobSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'PinterestAccount', required: true, index: true },
    kind: { type: String, enum: ['board', 'section'], required: true },
    payload: {
      name: String,
      description: String,
      privacy: String,
      boardId: String,
      dependsOnJob: { type: mongoose.Schema.Types.ObjectId, ref: 'BoardJob' },
    },
    status: {
      type: String,
      enum: ['pending', 'running', 'done', 'failed'],
      default: 'pending',
    },
    attempts: { type: Number, default: 0 },
    resultPinterestId: String,
    lastError: String,
    batch: String,
  },
  { timestamps: true }
);

boardJobSchema.index({ account: 1, status: 1, createdAt: 1 });

module.exports = mongoose.model('BoardJob', boardJobSchema);
