const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { nanoid } = require('nanoid');
const User = require('../models/User');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const { sha256 } = require('../utils/hash');

function signAccess(user) {
  return jwt.sign({ sub: String(user._id) }, env.JWT_ACCESS_SECRET, { expiresIn: env.ACCESS_TTL });
}

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  };
}

function createRefreshToken(userAgent) {
  const raw = nanoid(48);
  const hash = sha256(raw);
  return {
    raw,
    entry: { hash, createdAt: new Date(), userAgent },
  };
}

async function issueRefresh(user, userAgent) {
  const token = createRefreshToken(userAgent);
  await User.updateOne(
    { _id: user._id },
    { $push: { refreshTokenHashes: { $each: [token.entry], $slice: -10 } } }
  );
  return token.raw;
}

function publicUser(user) {
  return {
    id: String(user._id),
    email: user.email,
    name: user.name,
    plan: user.plan,
    settings: user.settings,
    createdAt: user.createdAt,
  };
}

const register = asyncHandler(async (req, res) => {
  const { email, password, name } = req.body;
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) throw new AppError(409, 'CONFLICT', 'Email already registered');
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({ email, passwordHash, name });
  const accessToken = signAccess(user);
  const refresh = await issueRefresh(user, req.get('user-agent'));
  res.cookie('refreshToken', refresh, refreshCookieOptions());
  return ok(res, { user: publicUser(user), accessToken }, undefined, 201);
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Invalid email or password');
  }
  const accessToken = signAccess(user);
  const refresh = await issueRefresh(user, req.get('user-agent'));
  res.cookie('refreshToken', refresh, refreshCookieOptions());
  return ok(res, { user: publicUser(user), accessToken });
});

const refresh = asyncHandler(async (req, res) => {
  const raw = req.cookies.refreshToken;
  if (!raw) throw new AppError(401, 'UNAUTHENTICATED', 'Missing refresh token');
  const hash = sha256(raw);
  const token = createRefreshToken(req.get('user-agent'));
  const user = await User.findOneAndUpdate(
    { 'refreshTokenHashes.hash': hash },
    {
      $pull: { refreshTokenHashes: { hash } },
      $push: { refreshTokenHashes: { $each: [token.entry], $slice: -10 } },
    },
    { new: true }
  );
  if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Invalid refresh token');
  res.cookie('refreshToken', token.raw, refreshCookieOptions());
  return ok(res, { user: publicUser(user), accessToken: signAccess(user) });
});

const logout = asyncHandler(async (req, res) => {
  const raw = req.cookies.refreshToken;
  if (raw) {
    const hash = sha256(raw);
    await User.updateOne(
      { 'refreshTokenHashes.hash': hash },
      { $pull: { refreshTokenHashes: { hash } } }
    );
  }
  res.clearCookie('refreshToken', { path: '/api/auth' });
  return ok(res, { success: true });
});

const me = asyncHandler(async (req, res) => ok(res, { user: publicUser(req.user) }));

module.exports = { register, login, refresh, logout, me };
