const mongoose = require('mongoose');

const sectionSchema = new mongoose.Schema(
  {
    pinterestSectionId: String,
    name: String,
  },
  { _id: false }
);

const boardSchema = new mongoose.Schema(
  {
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'PinterestAccount', required: true, index: true },
    pinterestBoardId: { type: String, required: true },
    name: String,
    description: String,
    privacy: String,
    pinCount: Number,
    followerCount: Number,
    sections: { type: [sectionSchema], default: [] },
    coverImageUrl: String,
    lastSyncedAt: Date,
    deletedOnPinterest: { type: Boolean, default: false },
  },
  { timestamps: true }
);

boardSchema.index({ account: 1, pinterestBoardId: 1 }, { unique: true });

module.exports = mongoose.model('Board', boardSchema);
