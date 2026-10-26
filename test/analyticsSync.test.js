process.env.MONGO_URL = 'mongodb://127.0.0.1:27017/pin_dashboard_test';
process.env.JWT_SECRET = 'unit-test-secret-that-is-not-used-outside-this-process';
process.env.TOKEN_ENC_KEY = Buffer.alloc(32, 7).toString('base64');

const test = require('node:test');
const assert = require('node:assert/strict');
const { addDays } = require('date-fns');
const { shouldSyncPin } = require('../jobs/analyticsSync');

test('Pin analytics stays daily through age 30', () => {
  const now = new Date('2026-10-25T12:00:00.000Z');
  assert.equal(shouldSyncPin({ publishedAt: addDays(now, -30), lastPinAnalyticsSyncAt: now }, now), true);
});

test('older Pins sync initially and then no more than weekly', () => {
  const now = new Date('2026-10-25T12:00:00.000Z');
  assert.equal(shouldSyncPin({ publishedAt: addDays(now, -31) }, now), true);
  assert.equal(
    shouldSyncPin(
      { publishedAt: addDays(now, -31), lastPinAnalyticsSyncAt: addDays(now, -6) },
      now
    ),
    false
  );
  assert.equal(
    shouldSyncPin(
      { publishedAt: addDays(now, -31), lastPinAnalyticsSyncAt: addDays(now, -7) },
      now
    ),
    true
  );
});