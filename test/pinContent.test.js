const test = require('node:test');
const assert = require('node:assert/strict');
const { missingRequiredPinFields, assertRequiredPinFields } = require('../utils/pinContent');

test('Pin publishing requires a title, description, and alt text', () => {
  assert.deepEqual(missingRequiredPinFields({}), ['title', 'description', 'altText']);
  assert.deepEqual(
    missingRequiredPinFields({ title: 'Title', description: 'Description', altText: 'Alt text' }),
    []
  );
  assert.deepEqual(
    missingRequiredPinFields({ title: '  ', description: 'Description', altText: 'Alt text' }),
    ['title']
  );
});

test('required Pin field validation reports missing fields', () => {
  assert.throws(
    () => assertRequiredPinFields({ title: 'Title', description: '', altText: 'Alt text' }),
    (error) => {
      assert.equal(error.code, 'VALIDATION');
      assert.deepEqual(error.details.fields, ['description']);
      return true;
    }
  );
});
