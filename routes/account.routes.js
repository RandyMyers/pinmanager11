const express = require('express');
const controller = require('../controllers/account.controller');
const ownsAccount = require('../middleware/ownsAccount');
const validate = require('../middleware/validate');
const schema = require('../validators/account.schema');

const router = express.Router();

router.get('/', controller.list);
router.post('/connect', validate(schema.connect), controller.connect);
router.get('/:accountId', ownsAccount, controller.detail);
router.patch('/:accountId', ownsAccount, validate(schema.update), controller.update);
router.post('/:accountId/refresh-profile', ownsAccount, controller.refreshProfile);
router.post('/:accountId/reconnect', ownsAccount, controller.reconnect);
router.delete('/:accountId', ownsAccount, controller.disconnect);

module.exports = router;
