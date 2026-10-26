const mongoose = require('mongoose');
const PinterestAccount = require('../models/PinterestAccount');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

const ownsAccount = asyncHandler(async (req, res, next) => {
  const accountId = req.params.accountId;
  if (!mongoose.isValidObjectId(accountId)) {
    throw new AppError(400, 'VALIDATION', 'Invalid account id');
  }
  const account = await PinterestAccount.findOne({
    _id: accountId,
    owner: req.user._id,
    status: { $ne: 'disconnected' },
  });
  if (!account) throw new AppError(404, 'NOT_FOUND', 'Pinterest account not found');
  req.account = account;
  next();
});

module.exports = ownsAccount;
