const env = require('./env');

const SCOPES = {
  default: [
    'user_accounts:read',
    'boards:read',
    'boards:write',
    'pins:read',
    'pins:write',
  ],
  secret: ['boards:read_secret', 'boards:write_secret', 'pins:read_secret', 'pins:write_secret'],
};

function apiBase(accountEnv = env.PINTEREST_ENV) {
  return accountEnv === 'production'
    ? 'https://api.pinterest.com/v5'
    : 'https://api-sandbox.pinterest.com/v5';
}

module.exports = {
  OAUTH_AUTHORIZE: 'https://www.pinterest.com/oauth/',
  TOKEN_URL: 'https://api.pinterest.com/v5/oauth/token',
  TOKEN_URL_SANDBOX: 'https://api-sandbox.pinterest.com/v5/oauth/token',
  SCOPES,
  PIN_LIMITS: {
    title: 100,
    description: 800,
    altText: 500,
    link: 2048,
    boardName: 50,
    sectionName: 180,
  },
  ANALYTICS_MAX_LOOKBACK_DAYS: 90,
  TRIAL_WRITE_DAILY: 300,
  apiBase,
};
