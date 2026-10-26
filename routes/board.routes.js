const express = require('express');
const ownsAccount = require('../middleware/ownsAccount');
const validate = require('../middleware/validate');
const schema = require('../validators/board.schema');
const controller = require('../controllers/board.controller');

const router = express.Router({ mergeParams: true });

router.use(ownsAccount);
router.get('/', controller.list);
router.post('/', validate(schema.createBoard), controller.create);
router.patch('/:boardId', validate(schema.updateBoard), controller.update);
router.delete('/:boardId', controller.remove);
router.post('/:boardId/sections', validate(schema.createSection), controller.createSection);
router.patch('/:boardId/sections/:sectionId', controller.updateSection);
router.delete('/:boardId/sections/:sectionId', controller.deleteSection);

module.exports = router;
