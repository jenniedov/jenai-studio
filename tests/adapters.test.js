import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { kie } from '../server/adapters/kie.js';
import { oxen } from '../server/adapters/oxen.js';
import { makeError, codeFromMessage } from '../server/errors/map.js';

// A tiny ctx like the engine builds.
function ctx(overrides = {}) {
  return {
    key: 'test-key',
    providerSlug: overrides.providerSlug || 'google/nano-banana-2',
    model: overrides.model || { type: 'image', label: 'Nano Banana 2' },
    makeError: (code, extra = {}) => makeError(code, { provider: 'TestProvider', ...extra }),
    sniff: codeFromMessage,
  };
}

// Mock the global fetch with a queue of responses.
const realFetch = global.fetch;
function mockFetch(handler) {
  global.fetch = async (url, opts) => handler(url, opts);
}
afterEach(() => { global.fetch = realFetch; });

function jsonResponse(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => headers[k.toLowerCase()] || null },
    json: async () => body,
  };
}

const imageReq = {
  task: 'image', mode: 'text_to_x', model: 'nano-banana-2',
  prompt: 'a red panda', aspect_ratio: '1:1', num_outputs: 1,
};

// --- Oxen (sync) -----------------------------------------------------------

test('oxen: universal request -> correct provider body, returns done job', async () => {
  let seenBody;
  mockFetch(async (url, opts) => {
    assert.match(url, /images\/generate$/);
    seenBody = JSON.parse(opts.body);
    return jsonResponse(200, { image_url: 'https://oxen/out.png' });
  });
  const r = await oxen.submit(imageReq, ctx({ providerSlug: 'nano-banana-2' }));
  assert.equal(seenBody.model, 'nano-banana-2');
  assert.equal(seenBody.prompt, 'a red panda');
  assert.equal(r.done, true);
  assert.deepEqual(r.outputs, [{ type: 'image', url: 'https://oxen/out.png' }]);
});

test('oxen: video request hits the videos endpoint', async () => {
  let seenUrl;
  mockFetch(async (url) => { seenUrl = url; return jsonResponse(200, { video_url: 'https://oxen/v.mp4' }); });
  const r = await oxen.submit(
    { ...imageReq, task: 'video', duration_seconds: 5 },
    ctx({ model: { type: 'video', label: 'Seedance' } }),
  );
  assert.match(seenUrl, /videos\/generate$/);
  assert.equal(r.outputs[0].type, 'video');
});

test('oxen: 402 -> INSUFFICIENT_CREDITS', async () => {
  mockFetch(async () => jsonResponse(402, { error: 'no credits' }));
  const r = await oxen.submit(imageReq, ctx());
  assert.equal(r.error.code, 'INSUFFICIENT_CREDITS');
});

test('oxen: 401 -> AUTH_INVALID', async () => {
  mockFetch(async () => jsonResponse(401, { error: 'bad key' }));
  const r = await oxen.submit(imageReq, ctx());
  assert.equal(r.error.code, 'AUTH_INVALID');
});

// --- Kie (async) -----------------------------------------------------------

test('kie: submit returns a jobRef (not done)', async () => {
  let seenBody;
  mockFetch(async (url, opts) => {
    assert.match(url, /createTask$/);
    seenBody = JSON.parse(opts.body);
    return jsonResponse(200, { data: { taskId: 'task_abc' } });
  });
  const r = await kie.submit(imageReq, ctx({ providerSlug: 'google/nano-banana-2' }));
  assert.equal(seenBody.model, 'google/nano-banana-2');
  assert.equal(seenBody.input.prompt, 'a red panda');
  assert.equal(r.done, false);
  assert.equal(r.jobRef, 'task_abc');
});

test('kie: poll success parses resultJson', async () => {
  mockFetch(async () => jsonResponse(200, {
    data: { state: 'success', resultJson: JSON.stringify({ resultUrls: ['https://kie/1.png'] }) },
  }));
  const r = await kie.poll('task_abc', ctx());
  assert.equal(r.done, true);
  assert.deepEqual(r.outputs, [{ type: 'image', url: 'https://kie/1.png' }]);
});

test('kie: poll still running returns done:false', async () => {
  mockFetch(async () => jsonResponse(200, { data: { state: 'generating' } }));
  const r = await kie.poll('task_abc', ctx());
  assert.equal(r.done, false);
  assert.equal(r.outputs, undefined);
});

test('kie: envelope code 402 -> INSUFFICIENT_CREDITS', async () => {
  mockFetch(async () => jsonResponse(200, { code: 402, msg: 'insufficient credits' }));
  const r = await kie.submit(imageReq, ctx());
  assert.equal(r.error.code, 'INSUFFICIENT_CREDITS');
});

test('kie: task-level fail is mapped by message sniff', async () => {
  mockFetch(async () => jsonResponse(200, { data: { state: 'fail', failMsg: 'blocked by content policy' } }));
  const r = await kie.poll('task_abc', ctx());
  assert.equal(r.error.code, 'MODERATION_BLOCKED');
});

test('kie: 500 with a validation message -> BAD_REQUEST, not PROVIDER_DOWN', async () => {
  mockFetch(async () => jsonResponse(500, { code: 500, msg: 'image_input file type not supported' }));
  const r = await kie.submit(imageReq, ctx());
  assert.equal(r.error.code, 'BAD_REQUEST');
});

test('kie: data: reference images are re-hosted via the File Upload API', async () => {
  const calls = [];
  mockFetch(async (url, opts) => {
    calls.push(url);
    if (/file-base64-upload$/.test(url)) {
      const body = JSON.parse(opts.body);
      assert.match(body.base64Data, /^data:image\/jpeg;base64,/);
      assert.match(body.fileName, /\.jpg$/);
      return jsonResponse(200, { success: true, code: 200, data: { fileUrl: 'https://kieai.redpandaai.co/files/jenai-refs/ref.jpg' } });
    }
    assert.match(url, /createTask$/);
    const body = JSON.parse(opts.body);
    assert.deepEqual(body.input.image_input, ['https://kieai.redpandaai.co/files/jenai-refs/ref.jpg']);
    return jsonResponse(200, { data: { taskId: 'task_up' } });
  });
  const req = { ...imageReq, input_images: [{ url: 'data:image/jpeg;base64,AAAA' }] };
  const r = await kie.submit(req, ctx({ providerSlug: 'google/nano-banana-pro' }));
  assert.equal(calls.length, 2);
  assert.equal(r.jobRef, 'task_up');
});

test('kie: public http reference images skip the upload hop', async () => {
  const calls = [];
  mockFetch(async (url, opts) => {
    calls.push(url);
    const body = JSON.parse(opts.body);
    assert.deepEqual(body.input.image_input, ['https://example.com/ref.png']);
    return jsonResponse(200, { data: { taskId: 'task_pub' } });
  });
  const req = { ...imageReq, input_images: [{ url: 'https://example.com/ref.png' }] };
  const r = await kie.submit(req, ctx({ providerSlug: 'google/nano-banana-pro' }));
  assert.deepEqual(calls.length, 1);
  assert.equal(r.jobRef, 'task_pub');
});

test('kie: a failed reference upload surfaces a mapped error, no createTask call', async () => {
  const calls = [];
  mockFetch(async (url) => {
    calls.push(url);
    return jsonResponse(401, { code: 401, msg: 'unauthorized' });
  });
  const req = { ...imageReq, input_images: [{ url: 'data:image/png;base64,AAAA' }] };
  const r = await kie.submit(req, ctx());
  assert.equal(calls.length, 1);
  assert.equal(r.error.code, 'AUTH_INVALID');
});

test('kie: 429 -> RATE_LIMITED with retryAfter', async () => {
  mockFetch(async () => jsonResponse(429, { code: 429, msg: 'too many' }, { 'retry-after': '10' }));
  const r = await kie.submit(imageReq, ctx());
  assert.equal(r.error.code, 'RATE_LIMITED');
  assert.equal(r.error.retryAfter, 10);
});
