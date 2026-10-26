const express = require('express');
const validate = require('../middleware/validate');
const schema = require('../validators/post.schema');
const controller = require('../controllers/post.controller');

const router = express.Router();

router.get('/', validate(schema.list), controller.list);
router.post('/', validate(schema.create), controller.create);
router.post('/bulk-action', validate(schema.bulkAction), controller.bulkAction);
router.get('/:id', validate(schema.idParams), controller.detail);
router.patch('/:id', validate(schema.update), controller.update);
router.post('/:id/publish-now', validate(schema.idParams), controller.publishNow);
router.post('/:id/retry', validate(schema.idParams), controller.retry);
router.post('/:id/cancel', validate(schema.idParams), controller.cancel);
router.delete('/:id', validate(schema.idParams), controller.remove);

module.exports = router;
