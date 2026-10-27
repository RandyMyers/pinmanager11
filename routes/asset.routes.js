const express = require('express');
const validate = require('../middleware/validate');
const schema = require('../validators/asset.schema');
const controller = require('../controllers/asset.controller');

const router = express.Router();

router.post('/sign', validate(schema.sign), controller.sign);
router.post('/', validate(schema.register), controller.register);
router.post('/import-url', validate(schema.importUrl), controller.importUrl);
router.get('/', validate(schema.list), controller.list);
router.patch('/:id', validate(schema.update), controller.update);
router.delete('/:id', controller.remove);

module.exports = router;
