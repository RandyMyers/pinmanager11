const multer = require('multer');
const AppError = require('../utils/AppError');

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok =
      file.mimetype === 'text/csv' ||
      file.originalname.toLowerCase().endsWith('.csv') ||
      file.mimetype === 'application/vnd.ms-excel';
    if (!ok) return cb(new AppError(400, 'VALIDATION', 'CSV file required'));
    cb(null, true);
  },
});

module.exports = { csvUpload };
