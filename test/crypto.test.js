process.env.MONGO_URL = 'mongodb://127.0.0.1:27017/pin_dashboard_test';
process.env.JWT_SECRET = 'unit-test-secret-that-is-not-used-outside-this-process';
process.env.TOKEN_ENC_KEY = Buffer.alloc(32, 7).toString('base64');

const test = require('node:test');
const assert = require('node:assert/strict');
const { encrypt, decrypt } = require('../utils/crypto');

test('AES-GCM token encryption round-trips and rejects modified ciphertext', () => {
  const encrypted = encrypt('Pinterest token for test only');
  assert.equal(decrypt(encrypted), 'Pinterest token for test only');

  const value = Buffer.from(encrypted, 'base64');
  value[value.length - 1] ^= 1;
  assert.throws(() => decrypt(value.toString('base64')));
});
