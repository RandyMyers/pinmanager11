const mongoose = require('mongoose');
const env = require('../config/env');

const accountSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    env: { type: String, enum: ['sandbox', 'production'], default: env.PINTEREST_ENV },
    pinterestUserId: { type: String, required: true },
    username: String,
    accountType: { type: String, enum: ['PERSONAL', 'BUSINESS'], default: 'PERSONAL' },
    profileImageUrl: String,
    followerCount: Number,
    monthlyViews: Number,
    scopes: [String],
    tokens: {
      accessTokenEnc: String,
      refreshTokenEnc: String,
      accessExpiresAt: Date,
      refreshExpiresAt: Date,
      version: { type: Number, default: 0 },
      refreshingUntil: Date,
    },
    publishLockId: String,
    publishLockUntil: Date,
    status: {
      type: String,
      enum: ['active', 'needs_reconnect', 'paused', 'disconnected'],
      default: 'active',
    },
    statusReason: String,
    timezone: { type: String, default: 'UTC' },
    limits: {
      dailyCap: { type: Number, default: env.DEFAULT_DAILY_CAP },
      minGapMinutes: { type: Number, default: env.DEFAULT_MIN_GAP_MINUTES },
      jitterMinutes: { type: Number, default: 5 },
    },
    lastBoardSyncAt: Date,
    lastAnalyticsSyncAt: Date,
  },
  { timestamps: true }
);

accountSchema.index({ owner: 1, pinterestUserId: 1, env: 1 }, { unique: true });

module.exports = mongoose.model('PinterestAccount', accountSchema);
