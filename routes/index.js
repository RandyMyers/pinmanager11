const express = require('express');
const auth = require('../middleware/auth');
const authRoutes = require('./auth.routes');
const accountRoutes = require('./account.routes');
const accountController = require('../controllers/account.controller');
const boardRoutes = require('./board.routes');
const boardJobRoutes = require('./boardJob.routes');
const assetRoutes = require('./asset.routes');
const postRoutes = require('./post.routes');
const bulkRoutes = require('./bulk.routes');
const analyticsRoutes = require('./analytics.routes');
const dashboardRoutes = require('./dashboard.routes');
const activityRoutes = require('./activity.routes');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ data: { ok: true, uptime: process.uptime() } });
});

router.use('/auth', authRoutes);
router.get('/accounts/callback', accountController.callback);

router.use(auth);
router.use('/accounts', accountRoutes);
router.use('/accounts/:accountId/boards', boardRoutes);
router.use('/board-jobs', boardJobRoutes);
router.use('/assets', assetRoutes);
router.use('/posts', postRoutes);
router.use('/bulk', bulkRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/activity', activityRoutes);

module.exports = router;
