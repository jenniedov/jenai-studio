// Kie.ai adapter. Verified against docs.kie.ai (2026-08).
//
// Most models use the unified Jobs API:
//   POST /api/v1/jobs/createTask  { model, input:{...} }  -> { data:{ taskId } }
//   GET  /api/v1/jobs/recordInfo?taskId=...  -> { data:{ state, resultJson, failCode, failMsg } }
//   state: waiting | queuing | generating | success | fail
//   outputs: JSON.parse(data.resultJson).resultUrls   (resultJson is a STRING)
//
// Veo 3.1 is NOT on the Jobs API — it uses a dedicated endpoint:
//   POST /api/v1/veo/generate   { model: veo3_fast, prompt, imageUrls, aspectRatio, generationType }
//   GET  /api/v1/veo/record-info?taskId=...
//
// Auth: Authorization: Bearer <key>. Envelope: { code, msg, data }.

const BASE = 'https://api.kie.ai/api/v1';

// --- model families -------------------------------------------------------
function familyOf(slug) {
  if (/^veo/.test(slug)) return 'veo';
  if (/kling/.test(slug)) return 'kling';
  if (/nano-banana/.test(slug)) return 'nano';
  if (/gpt-image/.test(slug)) return 'gpt';
  if (/seedance|bytedance|sora|hailuo|wan/.test(slug)) return 'seedance';
  return 'generic';
}

function refUrls(req) {
  return (req.input_images || []).map((i) => i.url).filter(Boolean);
}

// Build the `input` object for the Jobs API, per family.
function buildJobsInput(req, slug) {
  const fam = familyOf(slug);
  const urls = refUrls(req);
  const input = { prompt: req.prompt };
  if (req.aspect_ratio) input.aspect_ratio = req.aspect_ratio;

  if (fam === 'nano') {
    if (req.resolution) input.resolution = req.resolution;
    input.output_format = 'png';
    if (urls.length) input.image_input = urls;
  } else if (fam === 'gpt') {
    if (req.resolution) input.resolution = req.resolution;
    if (urls.length) input.input_urls = urls;
  } else if (fam === 'kling') {
    input.sound = req.generate_audio !== false;
    if (req.duration_seconds) input.duration = String(req.duration_seconds);
    input.mode = req.resolution === '2160p' ? '4K' : req.resolution === '1080p' ? 'pro' : 'std';
    input.multi_shots = false; // required by Kie's Kling endpoint
    input.multi_prompt = [];
    if (urls.length) input.image_urls = urls;
  } else if (fam === 'seedance') {
    if (req.duration_seconds) input.duration = req.duration_seconds;
    if (req.resolution) input.resolution = req.resolution;
    input.generate_audio = req.generate_audio !== false;
    if (urls.length) input.first_frame_url = urls[0];
  } else {
    // generic: pass through the common fields
    if (req.resolution) input.resolution = req.resolution;
    if (req.duration_seconds) input.duration = req.duration_seconds;
    if (urls.length) input.image_urls = urls;
  }
  return { ...input, ...(req.provider_options || {}) };
}

export const kie = {
  id: 'kie',
  label: 'Kie.ai',
  signupUrl: 'https://kie.ai',

  async submit(req, ctx) {
    if (familyOf(ctx.providerSlug) === 'veo') return submitVeo(req, ctx);

    let res;
    try {
      res = await fetch(`${BASE}/jobs/createTask`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ctx.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: ctx.providerSlug, input: buildJobsInput(req, ctx.providerSlug) }),
      });
    } catch (e) {
      return { error: ctx.makeError('PROVIDER_DOWN', { raw: String(e) }) };
    }
    const body = await safeJson(res);
    if (!res.ok || (body && body.code && body.code !== 200)) {
      return { error: mapKieError(res.status, body, res.headers, ctx) };
    }
    const taskId = body?.data?.taskId || body?.taskId;
    if (!taskId) return { error: ctx.makeError('UNKNOWN', { status: res.status, raw: body }) };
    return { done: false, jobRef: taskId };
  },

  async poll(jobRef, ctx) {
    if (jobRef.startsWith('veo:')) return pollVeo(jobRef.slice(4), ctx);

    let res;
    try {
      res = await fetch(`${BASE}/jobs/recordInfo?taskId=${encodeURIComponent(jobRef)}`, {
        headers: { Authorization: `Bearer ${ctx.key}` },
      });
    } catch (e) {
      return { error: ctx.makeError('PROVIDER_DOWN', { raw: String(e) }) };
    }
    const body = await safeJson(res);
    if (!res.ok) return { error: mapKieError(res.status, body, res.headers, ctx) };

    const data = body?.data || {};
    if (data.state === 'success') {
      let urls = [];
      try { urls = JSON.parse(data.resultJson).resultUrls || []; } catch { /* leave empty */ }
      return { done: true, outputs: urls.map((url) => ({ type: ctx.model.type, url })) };
    }
    if (data.state === 'fail') {
      return { error: mapKieError(200, { failCode: data.failCode, msg: data.failMsg || 'generation failed' }, res.headers, ctx) };
    }
    return { done: false };
  },
};

// --- Veo dedicated endpoint ------------------------------------------------
async function submitVeo(req, ctx) {
  const urls = refUrls(req);
  const body = {
    model: ctx.providerSlug, // veo3 | veo3_fast | veo3_lite
    prompt: req.prompt,
    aspectRatio: req.aspect_ratio === '9:16' ? '9:16' : req.aspect_ratio === '16:9' ? '16:9' : 'Auto',
    generationType: urls.length ? 'REFERENCE_2_VIDEO' : 'TEXT_2_VIDEO',
    ...(urls.length ? { imageUrls: urls.slice(0, 3) } : {}),
  };
  let res;
  try {
    res = await fetch(`${BASE}/veo/generate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ctx.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { error: ctx.makeError('PROVIDER_DOWN', { raw: String(e) }) };
  }
  const j = await safeJson(res);
  if (!res.ok || (j && j.code && j.code !== 200)) return { error: mapKieError(res.status, j, res.headers, ctx) };
  const taskId = j?.data?.taskId || j?.taskId;
  if (!taskId) return { error: ctx.makeError('UNKNOWN', { status: res.status, raw: j }) };
  return { done: false, jobRef: `veo:${taskId}` };
}

async function pollVeo(taskId, ctx) {
  let res;
  try {
    res = await fetch(`${BASE}/veo/record-info?taskId=${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${ctx.key}` },
    });
  } catch (e) {
    return { error: ctx.makeError('PROVIDER_DOWN', { raw: String(e) }) };
  }
  const body = await safeJson(res);
  if (!res.ok) return { error: mapKieError(res.status, body, res.headers, ctx) };
  const data = body?.data || {};
  const flag = data.successFlag;
  // successFlag: 0 generating, 1 success, 2/3 failed
  if (flag === 1) {
    const urls = data?.response?.resultUrls || data?.resultUrls || [];
    return { done: true, outputs: urls.map((url) => ({ type: 'video', url })) };
  }
  if (flag === 2 || flag === 3) {
    return { error: mapKieError(200, { msg: data.errorMessage || 'generation failed' }, res.headers, ctx) };
  }
  return { done: false };
}

// --- error mapping ---------------------------------------------------------
function mapKieError(status, body, headers, ctx) {
  const code = body?.code ?? status;
  const msg = body?.msg || body?.failMsg || '';
  const retryAfter = Number(headers?.get?.('retry-after')) || null;

  let taxCode;
  // Kie sometimes returns HTTP 500 with a "Credits insufficient" message, so
  // check the message for credit exhaustion before the status-based mapping.
  if (/credit|balance|top up|insufficient/i.test(msg)) taxCode = 'INSUFFICIENT_CREDITS';
  else if (code === 401 || code === 403 || code === 433) taxCode = 'AUTH_INVALID';
  else if (code === 402) taxCode = 'INSUFFICIENT_CREDITS';
  else if (code === 429) taxCode = 'RATE_LIMITED';
  else if (code === 400 || code === 422) taxCode = 'BAD_REQUEST';
  else if (code === 455 || code === 501 || code === 505 || code >= 500) taxCode = 'PROVIDER_DOWN';
  else taxCode = ctx.sniff(msg);
  return ctx.makeError(taxCode, { status: code, retryAfter, raw: body });
}

async function safeJson(res) {
  try { return await res.json(); } catch { return null; }
}
