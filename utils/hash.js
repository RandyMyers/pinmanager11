const crypto = require('crypto');

function sha256(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

function normalizeLink(url) {
  if (!url) return '';
  try {
    const parsed = new URL(String(url).trim());
    parsed.hash = '';
    parsed.hostname = parsed.hostname.toLowerCase();
    if (parsed.pathname.endsWith('/') && parsed.pathname !== '/') {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.toString();
  } catch {
    return String(url).trim().toLowerCase();
  }
}

function normalizeTitle(title) {
  return String(title || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function dedupeKey(accountId, assetHash, link) {
  return sha256(`${accountId}|${assetHash || ''}|${normalizeLink(link)}`);
}

module.exports = { sha256, normalizeLink, normalizeTitle, dedupeKey };
