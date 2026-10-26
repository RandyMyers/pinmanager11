const express = require('express');
const validate = require('../middleware/validate');
const schema = require('../validators/board.schema');
const controller = require('../controllers/boardJob.controller');

const router = express.Router();

router.post('/', validate(schema.bulkJobs), controller.create);
router.get('/', controller.list);

module.exports = router;
