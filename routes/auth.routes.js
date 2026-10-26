const express = require('express');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const { authLimiter } = require('../middleware/rateLimit');
const schema = require('../validators/auth.schema');
const controller = require('../controllers/auth.controller');

const router = express.Router();

router.post('/register', authLimiter, validate(schema.register), controller.register);
router.post('/login', authLimiter, validate(schema.login), controller.login);
router.post('/refresh', authLimiter, controller.refresh);
router.post('/logout', controller.logout);
router.get('/me', auth, controller.me);

module.exports = router;
