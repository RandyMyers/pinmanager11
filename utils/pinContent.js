const AppError = require('./AppError');

const REQUIRED_PIN_FIELDS = ['title', 'description', 'altText'];

function missingRequiredPinFields(post) {
  return REQUIRED_PIN_FIELDS.filter(
    (field) => typeof post[field] !== 'string' || post[field].trim().length === 0
  );
}

function assertRequiredPinFields(post) {
  const missing = missingRequiredPinFields(post);
  if (missing.length) {
    const labels = missing.map((field) => (field === 'altText' ? 'alt text' : field));
    throw new AppError(
      400,
      'VALIDATION',
      `Complete the required Pin fields: ${labels.join(', ')}`,
      { fields: missing }
    );
  }
}

module.exports = { missingRequiredPinFields, assertRequiredPinFields };
