import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { chat, DEFAULT_LLM_MODEL } from '../server/llm.js';

const realFetch = global.fetch;
afterEach(() => { global.fetch = realFetch; });

function mockFetch(status, body) {
  let captured = null;
  global.fetch = async (url, opts) => {
    captured = { url, body: JSON.parse(opts.body) };
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  return () => captured;
}

const completion = (content) => ({
  model: 'meta-llama/llama-3.3-70b-instruct',
  choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
  usage: { total_tokens: 12 },
});

test('chat returns the model text on success', async () => {
  mockFetch(200, completion('OK'));
  const out = await chat({ prompt: 'say OK' });
  assert.equal(out.error, undefined);
  assert.equal(out.text, 'OK');
  assert.equal(out.finish_reason, 'stop');
  assert.deepEqual(out.usage, { total_tokens: 12 });
});

test('defaults the model and builds a user message from prompt', async () => {
  const get = mockFetch(200, completion('hi'));
  await chat({ prompt: 'hello' });
  const sent = get();
  assert.equal(sent.body.model, DEFAULT_LLM_MODEL);
  assert.deepEqual(sent.body.messages, [{ role: 'user', content: 'hello' }]);
});

test('prepends a system message and honors overrides', async () => {
  const get = mockFetch(200, completion('x'));
  await chat({ prompt: 'q', system: 'be terse', model: 'openai/gpt-5-mini', temperature: 0.2, max_tokens: 50 });
  const sent = get();
  assert.equal(sent.body.model, 'openai/gpt-5-mini');
  assert.deepEqual(sent.body.messages[0], { role: 'system', content: 'be terse' });
  assert.equal(sent.body.messages[1].content, 'q');
  assert.equal(sent.body.temperature, 0.2);
  assert.equal(sent.body.max_tokens, 50);
});

test('empty input is a friendly BAD_REQUEST (no network call)', async () => {
  let called = false;
  global.fetch = async () => { called = true; return { ok: true, status: 200, json: async () => ({}) }; };
  const out = await chat({});
  assert.equal(called, false);
  assert.equal(out.error.code, 'BAD_REQUEST');
});

test('maps an OpenRouter 402 to INSUFFICIENT_CREDITS', async () => {
  mockFetch(402, { error: { message: 'insufficient credits' } });
  const out = await chat({ prompt: 'hi' });
  assert.equal(out.error.code, 'INSUFFICIENT_CREDITS');
  assert.ok(out.error.friendly.he.title);
});
