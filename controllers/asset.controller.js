const Asset = require('../models/Asset');
const Post = require('../models/Post');
const cloudinaryService = require('../services/cloudinaryService');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { ok } = require('../utils/response');

function fromResource(owner, resource, extra = {}) {
  const resourceType = resource.resource_type === 'video' ? 'video' : 'image';
  return {
    owner,
    cloudinaryPublicId: resource.public_id,
    secureUrl: resource.secure_url,
    resourceType,
    width: resource.width,
    height: resource.height,
    bytes: resource.bytes,
    format: resource.format,
    duration: resource.duration,
    contentHash: cloudinaryService.hashFromResource(resource),
    originalFilename: extra.originalFilename || resource.original_filename,
    tags: resource.tags || extra.tags || [],
  };
}

const sign = asyncHandler(async (req, res) => {
  return ok(res, cloudinaryService.signUpload({ ...(req.body || {}), ownerId: req.user._id }));
});

const update = asyncHandler(async (req, res) => {
  const asset = await Asset.findOne({ _id: req.params.id, owner: req.user._id });
  if (!asset) throw new AppError(404, 'NOT_FOUND', 'Asset not found');
  Object.assign(asset, req.body);
  await asset.save();
  return ok(res, asset);
});

const register = asyncHandler(async (req, res) => {
  const { publicId, originalFilename } = req.body;
  if (!publicId) throw new AppError(400, 'VALIDATION', 'publicId is required');
  if (!cloudinaryService.isOwnedPublicId(req.user._id, publicId)) {
    throw new AppError(404, 'NOT_FOUND', 'Uploaded asset not found');
  }
  const resource = await cloudinaryService.getResource(publicId);
  if (!['image', 'video'].includes(resource.resource_type)) {
    throw new AppError(400, 'VALIDATION', 'Only image and video assets are supported');
  }
  const asset = await Asset.findOneAndUpdate(
    { owner: req.user._id, cloudinaryPublicId: resource.public_id },
    fromResource(req.user._id, resource, { originalFilename }),
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  const warnings = cloudinaryService.dimensionWarnings(asset.width, asset.height);
  return ok(res, asset, { warnings }, 201);
});

const importUrl = asyncHandler(async (req, res) => {
  const { url } = req.body;
  if (!url) throw new AppError(400, 'VALIDATION', 'url is required');
  const resource = await cloudinaryService.importFromUrl(url, req.user._id);
  const asset = await Asset.create(fromResource(req.user._id, resource));
  const warnings = cloudinaryService.dimensionWarnings(asset.width, asset.height);
  return ok(res, asset, { warnings }, 201);
});

const list = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(50, Number(req.query.limit || 24));
  const filter = { owner: req.user._id };
  if (req.query.type) filter.resourceType = req.query.type;
  if (req.query.q) {
    filter.originalFilename = new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }
  const [items, total] = await Promise.all([
    Asset.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Asset.countDocuments(filter),
  ]);
  return ok(res, items, { page, limit, total });
});

const remove = asyncHandler(async (req, res) => {
  const asset = await Asset.findOne({ _id: req.params.id, owner: req.user._id });
  if (!asset) throw new AppError(404, 'NOT_FOUND', 'Asset not found');
  const used = await Post.exists({
    $or: [{ asset: asset._id }, { coverAsset: asset._id }],
    status: { $in: ['scheduled', 'queued', 'publishing'] },
  });
  if (used) throw new AppError(409, 'IN_USE', 'Asset is used by a scheduled post');
  await cloudinaryService.deleteAsset(asset.cloudinaryPublicId);
  await asset.deleteOne();
  return ok(res, { success: true });
});

module.exports = { sign, register, update, importUrl, list, remove };
