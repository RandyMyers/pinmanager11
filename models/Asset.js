const mongoose = require('mongoose');

const assetSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    cloudinaryPublicId: { type: String, required: true },
    secureUrl: { type: String, required: true },
    resourceType: { type: String, enum: ['image', 'video'], default: 'image' },
    width: Number,
    height: Number,
    bytes: Number,
    format: String,
    duration: Number,
    contentHash: String,
    originalFilename: String,
    tags: [String],
    title: { type: String, maxlength: 100 },
    description: { type: String, maxlength: 800 },
    altText: { type: String, maxlength: 500 },
    link: { type: String, maxlength: 2048 },
  },
  { timestamps: true }
);

assetSchema.index({ owner: 1, contentHash: 1 });
assetSchema.index({ owner: 1, cloudinaryPublicId: 1 }, { unique: true });

module.exports = mongoose.model('Asset', assetSchema);
