const mongoose = require('mongoose');

const refreshTokenSchema = new mongoose.Schema(
  {
    hash: String,
    createdAt: { type: Date, default: Date.now },
    userAgent: String,
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, trim: true },
    refreshTokenHashes: { type: [refreshTokenSchema], default: [] },
    plan: { type: String, default: 'free' },
    settings: {
      defaultTimezone: { type: String, default: 'UTC' },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
