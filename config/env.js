const path = require('path');
const crypto = require('crypto');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

function first(...values) {
  for (const value of values) {
    if (value !== undefined && value !== '') return value;
  }
  return undefined;
}

function required(name, value) {
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const mongoUrl = first(process.env.MONGO_URL, process.env.MONGODB_URI);
const jwtSecret = first(process.env.JWT_ACCESS_SECRET, process.env.JWT_SECRET);
const jwtRefreshSecret = first(process.env.JWT_REFRESH_SECRET, process.env.JWT_SECRET, jwtSecret);

required('MONGO_URL (or MONGODB_URI)', mongoUrl);
required('JWT_SECRET (or JWT_ACCESS_SECRET)', jwtSecret);

let tokenEncKey = process.env.TOKEN_ENC_KEY;
if (!tokenEncKey) {
  if (process.env.NODE_ENV === 'production') {
    required('TOKEN_ENC_KEY', tokenEncKey);
  }
  tokenEncKey = crypto.createHash('sha256').update(String(jwtSecret)).digest('base64');
  console.warn('TOKEN_ENC_KEY is not set; deriving a local key from JWT_SECRET. Set TOKEN_ENC_KEY in production.');
}
if (Buffer.from(tokenEncKey, 'base64').length !== 32) {
  throw new Error('TOKEN_ENC_KEY must be a base64-encoded 32-byte key');
}

if (process.env.PINTEREST_ENV && !['sandbox', 'production'].includes(process.env.PINTEREST_ENV)) {
  throw new Error('PINTEREST_ENV must be either sandbox or production');
}

const nodeEnv = process.env.NODE_ENV || 'development';
if (nodeEnv === 'production' && String(jwtSecret).length < 32) {
  throw new Error('JWT_ACCESS_SECRET must be at least 32 characters in production');
}

const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
const clientUrls = [
  clientUrl,
  'https://gleeful-haupia-f0ede4.netlify.app',
  ...(process.env.CLIENT_URLS || '').split(',').map((url) => url.trim()),
].filter(Boolean);

const env = {
  NODE_ENV: nodeEnv,
  PORT: Number(process.env.PORT || 5000),
  CLIENT_URL: clientUrl,
  CLIENT_URLS: [...new Set(clientUrls)],
  MONGO_URL: mongoUrl,
  JWT_ACCESS_SECRET: jwtSecret,
  JWT_REFRESH_SECRET: jwtRefreshSecret,
  ACCESS_TTL: process.env.ACCESS_TTL || '15m',
  REFRESH_TTL: process.env.REFRESH_TTL || '30d',
  TOKEN_ENC_KEY: tokenEncKey,
  PINTEREST_APP_ID: process.env.PINTEREST_APP_ID || '',
  PINTEREST_APP_SECRET: process.env.PINTEREST_APP_SECRET || '',
  PINTEREST_REDIRECT_URI:
    process.env.PINTEREST_REDIRECT_URI || 'http://localhost:5000/api/accounts/callback',
  PINTEREST_ENV: process.env.PINTEREST_ENV === 'production' ? 'production' : 'sandbox',
  PINTEREST_STANDARD_APPROVED: process.env.PINTEREST_STANDARD_APPROVED === 'true',
  CLOUDINARY_CLOUD_NAME: first(process.env.CLOUDINARY_CLOUD_NAME, process.env.CLOUDINARY_NAME) || '',
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || '',
  CLOUDINARY_API_SECRET: first(process.env.CLOUDINARY_API_SECRET, process.env.CLOUDINARY_SECRET) || '',
  CLOUDINARY_FOLDER: process.env.CLOUDINARY_FOLDER || 'pin-dashboard',
  DEFAULT_DAILY_CAP: Number(process.env.DEFAULT_DAILY_CAP || 15),
  DEFAULT_MIN_GAP_MINUTES: Number(process.env.DEFAULT_MIN_GAP_MINUTES || 20),
  WORKER_TICK_SECONDS: Number(process.env.WORKER_TICK_SECONDS || 30),
  COOKIE_SECURE: process.env.NODE_ENV === 'production',
};

module.exports = env;
