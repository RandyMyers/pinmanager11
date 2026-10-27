const test = require('node:test');
const assert = require('node:assert/strict');
const schema = require('../validators/asset.schema');

const assetId = '507f1f77bcf86cd799439011';

test('asset metadata accepts Pin defaults and an optional HTTP(S) destination', () => {
  const parsed = schema.update.safeParse({
    params: { id: assetId },
    body: {
      title: 'Pin title',
      description: 'Pin description',
      altText: 'A clear image description',
      link: 'https://example.com/pin',
    },
  });

  assert.equal(parsed.success, true);
});

test('asset metadata rejects non-HTTP destination links and empty updates', () => {
  assert.equal(
    schema.update.safeParse({
      params: { id: assetId },
      body: { link: 'javascript:alert(1)' },
    }).success,
    false
  );
  assert.equal(schema.update.safeParse({ params: { id: assetId }, body: {} }).success, false);
});
