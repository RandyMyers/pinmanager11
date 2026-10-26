const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCsv, parseScheduledAt } = require('../services/csvService');

test('CSV columns are case-insensitive and normalized', () => {
  const result = parseCsv(
    Buffer.from('BOARD,Alt Text,IMAGE_URL,scheduled_at\nRecipes,Alt,https://example.com/a.jpg,2026-01-12 09:30')
  );

  assert.equal(result.summary.rowCount, 1);
  assert.equal(result.rows[0].data.board, 'Recipes');
  assert.equal(result.rows[0].data.altText, 'Alt');
  assert.equal(result.rows[0].data.imageUrl, 'https://example.com/a.jpg');
  assert.equal(result.rows[0].data.scheduledAt, '2026-01-12 09:30');
  assert.equal(result.rows[0].errors.length, 0);
});

test('local CSV schedule values are converted using their account timezone', () => {
  assert.equal(
    parseScheduledAt('2026-01-12 09:30', 'America/New_York').toISOString(),
    '2026-01-12T14:30:00.000Z'
  );
});

test('CSV links reject non-http schemes', () => {
  const result = parseCsv(Buffer.from('board,image_url,link\nRecipes,https://example.com/a.jpg,javascript:alert(1)'));
  assert.ok(result.rows[0].errors.some((error) => error.includes('http(s)')));
});
