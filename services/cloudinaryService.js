const dns = require('dns').promises;
const net = require('net');
const https = require('https');
const axios = require('axios');
const cloudinary = require('../config/cloudinary');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const { sha256 } = require('../utils/hash');

function ownerFolder(ownerId) {
  if (!ownerId) throw new AppError(400, 'VALIDATION', 'An asset owner is required');
  return `${env.CLOUDINARY_FOLDER}/${String(ownerId)}`;
}

function signUpload({ ownerId, tags, resourceType = 'image' } = {}) {
  if (!['image', 'video'].includes(resourceType)) {
    throw new AppError(400, 'VALIDATION', 'Upload resourceType must be image or video');
  }
  const timestamp = Math.floor(Date.now() / 1000);
  const params = {
    timestamp,
    folder: ownerFolder(ownerId),
  };
  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
    throw new AppError(503, 'CONFIG', 'Cloudinary is not configured');
  }
  if (tags?.length) params.tags = tags.map(String).join(',');
  const signature = cloudinary.utils.api_sign_request(params, env.CLOUDINARY_API_SECRET);
  return {
    timestamp,
    signature,
    apiKey: env.CLOUDINARY_API_KEY,
    cloudName: env.CLOUDINARY_CLOUD_NAME,
    folder: params.folder,
    resourceType,
    tags: params.tags,
  };
}

function isPrivateIp(ip) {
  if (!ip) return true;
  if (ip === '::1' || ip.startsWith('fe80:') || ip.startsWith('fc') || ip.startsWith('fd')) return true;
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) return net.isIP(ip) === 6;
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

async function assertPublicHttps(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new AppError(400, 'VALIDATION', 'Invalid URL');
  }
  if (parsed.protocol !== 'https:') throw new AppError(400, 'VALIDATION', 'Only https URLs are allowed');
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
  if (parsed.username || parsed.password || (parsed.port && parsed.port !== '443')) {
    throw new AppError(400, 'VALIDATION', 'Remote URL credentials and non-standard ports are not allowed');
  }
  if (['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(hostname)) {
    throw new AppError(400, 'VALIDATION', 'Private hosts are not allowed');
  }
  const addresses = net.isIP(hostname)
    ? [{ address: hostname, family: net.isIP(hostname) }]
    : await dns.lookup(hostname, { all: true });
  if (!addresses.length || addresses.some((entry) => isPrivateIp(entry.address))) {
    throw new AppError(400, 'VALIDATION', 'Private IP addresses are not allowed');
  }
  return { parsed, addresses };
}

async function importFromUrl(url, ownerId) {
  const { parsed, addresses } = await assertPublicHttps(url);
  const allowedHosts = new Set(addresses.map((entry) => entry.address));
  const httpsAgent = new https.Agent({
    lookup: (hostname, options, callback) => {
      if (hostname.replace(/^\[|\]$/g, '') !== parsed.hostname.replace(/^\[|\]$/g, '')) {
        callback(new Error('Unexpected DNS lookup host'));
        return;
      }
      const matches = addresses.filter((entry) => allowedHosts.has(entry.address));
      if (options && options.all) {
        callback(null, matches.map((entry) => ({ address: entry.address, family: entry.family })));
      } else {
        callback(null, matches[0].address, matches[0].family);
      }
    },
  });
  const response = await axios.get(parsed.toString(), {
    responseType: 'arraybuffer',
    timeout: 20000,
    maxContentLength: 20 * 1024 * 1024,
    maxBodyLength: 20 * 1024 * 1024,
    maxRedirects: 0,
    proxy: false,
    httpsAgent,
  });
  const contentType = String(response.headers['content-type'] || '').toLowerCase();
  if (!contentType.startsWith('image/')) {
    throw new AppError(400, 'VALIDATION', 'Remote URL is not an image');
  }
  const contentLength = Number(response.headers['content-length']);
  if (Number.isFinite(contentLength) && contentLength > 20 * 1024 * 1024) {
    throw new AppError(413, 'UPLOAD_TOO_LARGE', 'Remote image exceeds the 20 MB limit');
  }
  const buffer = Buffer.from(response.data);
  if (!buffer.length || buffer.length > 20 * 1024 * 1024) {
    throw new AppError(413, 'UPLOAD_TOO_LARGE', 'Remote image is empty or exceeds the 20 MB limit');
  }
  const uploaded = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: ownerFolder(ownerId), resource_type: 'image' },
      (error, result) => (error ? reject(error) : resolve(result))
    );
    stream.end(buffer);
  });
  return uploaded;
}

function buildPinterestUrl(publicId, fallbackUrl) {
  if (!publicId) return fallbackUrl;
  return cloudinary.url(publicId, {
    secure: true,
    fetch_format: 'jpg',
    quality: 'auto',
    width: 1000,
    crop: 'limit',
  });
}

async function getResource(publicId) {
  return cloudinary.api.resource(publicId);
}

function isOwnedPublicId(ownerId, publicId) {
  return (
    typeof publicId === 'string' &&
    publicId.startsWith(`${ownerFolder(ownerId)}/`) &&
    !publicId.slice(ownerFolder(ownerId).length + 1).includes('..')
  );
}

async function deleteAsset(publicId) {
  return cloudinary.uploader.destroy(publicId);
}

function hashFromResource(resource, bytes) {
  if (resource.etag) return String(resource.etag);
  if (bytes) return sha256(bytes);
  return sha256(resource.public_id + resource.version);
}

function dimensionWarnings(width, height) {
  const warnings = [];
  if (width && height) {
    if (width < 600 || height < 900) warnings.push('Image is smaller than the recommended 1000x1500');
    const ratio = width / height;
    if (ratio < 0.5 || ratio > 1.2) warnings.push('Image ratio is outside the typical 2:3 Pinterest range');
  }
  return warnings;
}

module.exports = {
  signUpload,
  importFromUrl,
  isOwnedPublicId,
  buildPinterestUrl,
  getResource,
  deleteAsset,
  hashFromResource,
  dimensionWarnings,
};
