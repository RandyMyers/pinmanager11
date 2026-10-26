const { fromZonedTime, toZonedTime } = require('date-fns-tz');
const { format, startOfDay } = require('date-fns');

function accountDayKey(date, timezone = 'UTC') {
  const zoned = toZonedTime(date, timezone);
  return format(zoned, 'yyyy-MM-dd');
}

function utcDayKey(date) {
  return format(date, 'yyyy-MM-dd');
}

function startOfAccountDayUtc(date, timezone = 'UTC') {
  const zoned = toZonedTime(date, timezone);
  return fromZonedTime(startOfDay(zoned), timezone);
}

function roundToMinute(date) {
  const next = new Date(date);
  next.setSeconds(0, 0);
  return next;
}

module.exports = { accountDayKey, utcDayKey, startOfAccountDayUtc, roundToMinute };
