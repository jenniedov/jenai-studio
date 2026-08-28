import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codeFromStatus, codeFromMessage, makeError, decorate } from '../server/errors/map.js';
import { CODES, normalizedError } from '../server/errors/taxonomy.js';

test('codeFromStatus maps HTTP statuses to taxonomy codes', () => {
  const cases = [
    [401, CODES.AUTH_INVALID],
    [403, CODES.AUTH_INVALID],
    [402, CODES.INSUFFICIENT_CREDITS],
    [429, CODES.RATE_LIMITED],
    [400, CODES.BAD_REQUEST],
    [422, CODES.BAD_REQUEST],
    [504, CODES.TIMEOUT],
    [500, CODES.PROVIDER_DOWN],
    [503, CODES.PROVIDER_DOWN],
    [418, CODES.UNKNOWN],
  ];
  for (const [status, expected] of cases) {
    assert.equal(codeFromStatus(status), expected, `status ${status}`);
  }
});

test('codeFromMessage sniffs common provider phrasings', () => {
  const cases = [
    ['You have insufficient credits', CODES.INSUFFICIENT_CREDITS],
    ['Rate limit exceeded, slow down', CODES.RATE_LIMITED],
    ['Invalid API key provided', CODES.AUTH_INVALID],
    ['Blocked by content policy', CODES.MODERATION_BLOCKED],
    ['Request timed out', CODES.TIMEOUT],
    ['Model temporarily unavailable', CODES.PROVIDER_DOWN],
    ['some random thing', CODES.UNKNOWN],
  ];
  for (const [msg, expected] of cases) {
    assert.equal(codeFromMessage(msg), expected, msg);
  }
});

test('every taxonomy code has friendly copy in both locales', () => {
  for (const code of Object.values(CODES)) {
    const err = makeError(code, { provider: 'Kie.ai', model: 'Nano Banana Pro' });
    for (const locale of ['en', 'he']) {
      const f = err.friendly[locale];
      assert.ok(f.title, `${code}/${locale} title`);
      assert.ok(f.body, `${code}/${locale} body`);
      assert.ok(f.claudePrompt, `${code}/${locale} claudePrompt`);
    }
  }
});

test('decorate substitutes {provider} and {model}', () => {
  const err = decorate(normalizedError(CODES.INSUFFICIENT_CREDITS, { provider: 'Oxen.ai', model: 'Seedance 2.0' }));
  assert.match(err.friendly.en.claudePrompt, /Oxen\.ai/);
  assert.doesNotMatch(err.friendly.en.claudePrompt, /\{provider\}/);
  assert.match(err.friendly.he.title, /נגמרו הקרדיטים/);
});

test('unknown codes fall back to UNKNOWN', () => {
  const err = makeError('NOT_A_REAL_CODE', { provider: 'X' });
  assert.equal(err.code, CODES.UNKNOWN);
  assert.ok(err.friendly.he.title);
});
