const express = require('express');
const validate = require('../middleware/validate');
const schema = require('../validators/analytics.schema');
const controller = require('../controllers/analytics.controller');

const router = express.Router();

router.get('/overview', validate(schema.query), controller.overview);
router.get('/accounts/:accountId', validate(schema.accountParams), controller.accountSeries);
router.get('/accounts/:accountId/top-pins', validate(schema.accountParams), controller.topPins);
router.get('/pins/:pinterestPinId', validate(schema.pinParams), controller.pinSeries);
router.get('/posts', validate(schema.query), controller.posts);
router.post('/accounts/:accountId/sync', validate(schema.accountParams), controller.sync);
router.get('/export.csv', validate(schema.query), controller.exportCsv);

module.exports = router;
