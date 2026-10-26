const test = require('node:test');
const assert = require('node:assert/strict');
const { differenceInMinutes } = require('date-fns');
const { spread } = require('../services/scheduleService');
const { accountDayKey } = require('../utils/dates');

test('spread respects daily window, spacing, and per-day cap in the requested timezone', () => {
  const times = spread({
    count: 4,
    startAt: '2026-10-26T00:00:00.000Z',
    intervalMinutes: 60,
    windowStart: '09:00',
    windowEnd: '12:00',
    perDay: 2,
    jitterMinutes: 0,
    timezone: 'Europe/London',
  });

  assert.equal(times.length, 4);
  assert.ok(times.every((time) => time >= new Date('2026-10-26T00:00:00.000Z')));
  assert.ok(times.every((time) => ['09:00', '10:00'].includes(time.toLocaleTimeString('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }))));
  assert.equal(accountDayKey(times[0], 'Europe/London'), '2026-10-26');
  assert.equal(accountDayKey(times[1], 'Europe/London'), '2026-10-26');
  assert.equal(accountDayKey(times[2], 'Europe/London'), '2026-10-27');
  assert.ok(times.every((time, index) => index === 0 || differenceInMinutes(time, times[index - 1]) >= 60));
});

test('spread rejects rules that cannot produce a complete schedule', () => {
  assert.throws(
    () =>
      spread({
        count: 2,
        startAt: '2026-10-26T00:00:00.000Z',
        intervalMinutes: 0,
        perDay: 2,
        timezone: 'UTC',
      }),
    /intervalMinutes must be a positive integer/
  );
});
