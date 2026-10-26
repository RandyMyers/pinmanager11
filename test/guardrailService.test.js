const test = require('node:test');
const assert = require('node:assert/strict');
const { crossPostIssues } = require('../services/guardrailService');

function rowsForAccounts(accountIds) {
  return accountIds.map((accountId) => ({
    data: { accountId, contentHash: 'same-image-hash' },
  }));
}

test('cross-post check allows the same content on up to two accounts', () => {
  assert.deepEqual(crossPostIssues(rowsForAccounts(['a', 'b']), false), []);
});

test('cross-post check blocks the same content on more than two accounts without confirmation', () => {
  const issues = crossPostIssues(rowsForAccounts(['a', 'b', 'c']), false);

  assert.equal(issues.length, 3);
  assert.ok(issues.every(({ reason }) => reason.includes('confirmCrossPost: true')));
});

test('cross-post check accepts more than two accounts with explicit confirmation', () => {
  assert.deepEqual(crossPostIssues(rowsForAccounts(['a', 'b', 'c']), true), []);
});

test('repeated rows on the same account count as one cross-post destination', () => {
  assert.deepEqual(crossPostIssues(rowsForAccounts(['a', 'a', 'a']), false), []);
});

test('cross-post check includes matching content already active on other accounts', () => {
  const rows = rowsForAccounts(['c']);
  const existingAccounts = new Map([['same-image-hash', new Set(['a', 'b'])]]);

  assert.equal(crossPostIssues(rows, false, existingAccounts).length, 1);
  assert.deepEqual(crossPostIssues(rows, true, existingAccounts), []);
});