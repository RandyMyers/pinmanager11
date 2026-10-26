const { addDays, addMinutes, setHours, setMinutes, startOfDay } = require('date-fns');
const { fromZonedTime, toZonedTime } = require('date-fns-tz');
const { roundToMinute } = require('../utils/dates');
const AppError = require('../utils/AppError');

function parseHm(value, fallbackH, fallbackM) {
  if (!value) return { h: fallbackH, m: fallbackM };
  const match = /^(\d{2}):(\d{2})$/.exec(String(value));
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
    throw new AppError(400, 'VALIDATION', `Invalid daily window time: ${value}`);
  }
  return { h: Number(match[1]), m: Number(match[2]) };
}

function spread({
  count,
  startAt,
  intervalMinutes = 60,
  windowStart = '09:00',
  windowEnd = '21:00',
  perDay = 10,
  jitterMinutes = 0,
  timezone = 'UTC',
}) {
  if (!Number.isInteger(count) || count < 0 || count > 500) {
    throw new AppError(400, 'VALIDATION', 'Schedule count must be between 0 and 500');
  }
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1) {
    throw new AppError(400, 'VALIDATION', 'intervalMinutes must be a positive integer');
  }
  if (!Number.isInteger(perDay) || perDay < 1 || perDay > 500) {
    throw new AppError(400, 'VALIDATION', 'perDay must be between 1 and 500');
  }
  if (!Number.isInteger(jitterMinutes) || jitterMinutes < 0 || jitterMinutes > 720) {
    throw new AppError(400, 'VALIDATION', 'jitterMinutes must be between 0 and 720');
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch {
    throw new AppError(400, 'VALIDATION', 'Invalid schedule timezone');
  }
  const times = [];
  const rawStart = new Date(startAt || Date.now());
  if (Number.isNaN(rawStart.getTime())) throw new AppError(400, 'VALIDATION', 'Invalid schedule startAt');
  const start = roundToMinute(rawStart);
  const now = new Date();
  const ws = parseHm(windowStart, 9, 0);
  const we = parseHm(windowEnd, 21, 0);
  let last = null;
  let dayOffset = 0;

  while (times.length < count && dayOffset < 400) {
    const probe = addDays(start, dayOffset);
    const zoned = toZonedTime(probe, timezone);
    const day = startOfDay(zoned);
    const winStartUtc = fromZonedTime(setMinutes(setHours(day, ws.h), ws.m), timezone);
    const winEndUtc = fromZonedTime(setMinutes(setHours(day, we.h), we.m), timezone);
    let cursor = winStartUtc;
    if (cursor < start) cursor = new Date(start);
    let placedToday = 0;

    while (times.length < count && placedToday < perDay && cursor < winEndUtc) {
      let candidate = new Date(cursor);
      if (jitterMinutes > 0) {
        const jitter = Math.floor(Math.random() * (jitterMinutes * 2 + 1)) - jitterMinutes;
        candidate = addMinutes(candidate, jitter);
      }
      if (last && candidate.getTime() - last.getTime() < intervalMinutes * 60 * 1000) {
        candidate = addMinutes(last, intervalMinutes);
      }
      candidate = roundToMinute(candidate);
      if (candidate < now || candidate < start || candidate >= winEndUtc) {
        cursor = addMinutes(cursor, intervalMinutes);
        continue;
      }
      times.push(candidate);
      last = candidate;
      placedToday += 1;
      cursor = addMinutes(cursor, intervalMinutes);
    }
    dayOffset += 1;
  }

  if (times.length !== count) {
    throw new AppError(400, 'VALIDATION', 'Schedule rule cannot fit all posts within the allowed date range');
  }
  return times;
}

module.exports = { spread };
