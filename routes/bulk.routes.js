const express = require('express');
const { csvUpload } = require('../middleware/upload');
const validate = require('../middleware/validate');
const schema = require('../validators/bulk.schema');
const controller = require('../controllers/bulk.controller');

const router = express.Router();

router.post('/preview/csv', csvUpload.single('file'), validate(schema.previewCsv), controller.previewCsv);
router.post('/preview/images', validate(schema.previewImages), controller.previewImages);
router.patch('/:batchId/rows/:rowId', validate(schema.rowParams), validate(schema.editRow), controller.updateRow);
router.post('/:batchId/commit', validate(schema.commit), controller.commit);
router.get('/:batchId', validate(schema.batchParams), controller.detail);
router.post('/:batchId/cancel', validate(schema.batchParams), controller.cancel);

module.exports = router;
