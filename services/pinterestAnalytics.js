const { subDays, format } = require('date-fns');
const pinterestClient = require('./pinterestClient');
const config = require('../config/pinterest');

function clampRange(start, end) {
  const maxStart = subDays(new Date(), config.ANALYTICS_MAX_LOOKBACK_DAYS);
  let s = start ? new Date(start) : subDays(new Date(), 29);
  const e = end ? new Date(end) : new Date();
  if (s < maxStart) s = maxStart;
  return { start_date: format(s, 'yyyy-MM-dd'), end_date: format(e, 'yyyy-MM-dd') };
}

const DEFAULT_METRICS = ['IMPRESSION', 'PIN_CLICK', 'OUTBOUND_CLICK', 'SAVE', 'SAVE_RATE'];

async function getAccountAnalytics(account, start, end, metrics = DEFAULT_METRICS) {
  const client = await pinterestClient.forAccount(account);
  const range = clampRange(start, end);
  const { data } = await client.get('/user_account/analytics', {
    params: { ...range, metric_types: metrics.join(',') },
  });
  return data;
}

async function getTopPins(account, start, end, sortBy = 'IMPRESSION') {
  const client = await pinterestClient.forAccount(account);
  const range = clampRange(start, end);
  const { data } = await client.get('/user_account/analytics/top_pins', {
    params: { ...range, sort_by: sortBy },
  });
  return data;
}

async function getPinAnalytics(account, pinId, start, end, metrics = DEFAULT_METRICS) {
  const client = await pinterestClient.forAccount(account);
  const range = clampRange(start, end);
  const { data } = await client.get(`/pins/${pinId}/analytics`, {
    params: { ...range, metric_types: metrics.join(',') },
  });
  return data;
}

async function getPinsAnalyticsBatch(account, pinIds, start, end, metrics = DEFAULT_METRICS) {
  const client = await pinterestClient.forAccount(account);
  const range = clampRange(start, end);
  try {
    const { data } = await client.get('/pins/analytics', {
      params: {
        ...range,
        pin_ids: pinIds.slice(0, 100).join(','),
        metric_types: metrics.join(','),
      },
    });
    return data;
  } catch (err) {
    if (err.statusCode === 403 || err.statusCode === 404) {
      const results = [];
      for (const id of pinIds) {
        results.push(await getPinAnalytics(account, id, start, end, metrics));
      }
      return { items: results };
    }
    throw err;
  }
}

module.exports = {
  getAccountAnalytics,
  getTopPins,
  getPinAnalytics,
  getPinsAnalyticsBatch,
  clampRange,
  DEFAULT_METRICS,
};
