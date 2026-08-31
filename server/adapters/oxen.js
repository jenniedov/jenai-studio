// Oxen.ai adapter — sync. Verified against docs.oxen.ai + live catalog (2026-08).
// URL in, URL out, no polling.
//
//   POST https://hub.oxen.ai/api/ai/images/generate  { model, prompt, ... } -> { image_url }
//   POST https://hub.oxen.ai/api/ai/videos/generate  { model, prompt, ... } -> { video_url }
//
// Auth: `Authorization: Bearer <key>` (the Oxen account auth token).
// Video calls block for minutes (true async is "under development"), so there is
// no timeout on the fetch. Errors come in two shapes: 401 { error:{type,title} }
// and 404 { error:{message} } — we read both defensively.
//
// Model slugs are Oxen's OWN ids (see config/models.json), not the vendor names.
// The live catalog `GET /api/ai/models` (no auth) is the source of truth.

import { getKey, localFileToDataUrl } from '../storage/store.js';
import { uploadDataUrlToKie, isLocalUrl, isDataUrl } from './upload.js';

const BASE = 'https://hub.oxen.ai/api/ai';

// Oxen FETCHES reference URLs server-side, so it can't read a data: URL or our
// localhost files (both fail as a 500 "Internal Server Error"). Re-host any such
// reference on a public URL (via Kie's file API) first. Returns { urls } or a
// clean { error } — never lets an unreachable reference reach Oxen.
async function resolvePublicRefs(req, ctx) {
  const images = req.input_images || [];
  const urls = [];
  for (let i = 0; i < images.length; i++) {
    let u = images[i]?.url;
    if (!u) continue;
    if (isLocalUrl(u)) u = localFileToDataUrl(u); // localhost file -> data URL
    if (isDataUrl(u)) {
      const kieKey = getKey('kie');
      if (!kieKey) {
        return { error: ctx.makeError('BAD_REQUEST', {
          raw: 'Oxen needs a publicly reachable reference image. Add a Kie.ai key (Keys tab) so local references can be hosted for Oxen, or use provider "openrouter" or "kie" for reference/identity edits.',
        }) };
      }
      try {
        u = await uploadDataUrlToKie(u, kieKey, i);
      } catch (e) {
        const auth = e.status === 401 || e.status === 403;
        return { error: ctx.makeError(auth ? 'AUTH_INVALID' : 'PROVIDER_DOWN', {
          raw: `couldn't host the reference for Oxen via Kie (${e.message}). Check your Kie.ai key, or use provider "openrouter"/"kie".`,
        }) };
      }
    }
    urls.push(u);
  }
  return { urls };
}

export const oxen = {
  id: 'oxen',
  label: 'Oxen.ai',
  signupUrl: 'https://oxen.ai',

  async submit(req, ctx) {
    const endpoint = req.task === 'video' ? 'videos/generate' : 'images/generate';
    const model = ctx.model;
    const resolved = await resolvePublicRefs(req, ctx);
    if (resolved.error) return { error: resolved.error };
    const urls = resolved.urls;
    // Each model names its options differently (resolution / size / image_size /
    // seconds) and only some accept aspect_ratio or generate_audio. models.json
    // carries per-model `resolutionField`, `durationField`, and `audio`, so we
    // only ever send fields the chosen model actually supports.
    const payload = { model: ctx.providerSlug, prompt: req.prompt };
    if (req.aspect_ratio && model.aspectRatios?.length) payload.aspect_ratio = req.aspect_ratio;
    if (req.resolution && model.resolutions?.length) {
      payload[model.resolutionField || 'resolution'] = req.resolution;
    }
    if (req.task === 'image') payload.output_format = 'png';
    if (req.task === 'video') {
      if (req.duration_seconds) {
        const df = model.durationField || 'duration';
        payload[df] = df === 'seconds' ? String(req.duration_seconds) : req.duration_seconds;
      }
      if (model.audio) payload.generate_audio = req.generate_audio !== false;
    }
    if (urls.length) payload.input_image = urls;
    ctx.applyOptions?.(payload); // config-driven custom options (seed, negative_prompt, …)
    Object.assign(payload, req.provider_options || {});

    let res;
    try {
      res = await fetch(`${BASE}/${endpoint}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ctx.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      return { error: ctx.makeError('PROVIDER_DOWN', { raw: String(e) }) };
    }

    const body = await safeJson(res);
    if (!res.ok) {
      const status = res.status;
      // Oxen error shapes: { error:{ type, title, detail } } or { error:{ message } }.
      // The real reason is often in `detail` (e.g. a wrapped 422 content policy).
      const msg = body?.error?.detail || body?.error?.message || body?.error?.title || body?.error?.type
        || body?.message || (typeof body?.error === 'string' ? body.error : '') || '';
      let taxCode;
      if (/content policy|content safety|flagged|moderat|nsfw|safety checker/i.test(msg)) taxCode = 'MODERATION_BLOCKED';
      else if (status === 401 || status === 403 || /unauthenticated|unauthorized/i.test(msg)) taxCode = 'AUTH_INVALID';
      else if (status === 402 || /credit|balance|payment|fund/i.test(msg)) taxCode = 'INSUFFICIENT_CREDITS';
      else if (status === 429) taxCode = 'RATE_LIMITED';
      else if (status === 404 || status === 400 || status === 422) taxCode = 'BAD_REQUEST';
      else if (status >= 500) taxCode = 'PROVIDER_DOWN';
      else taxCode = ctx.sniff(msg);
      const retryAfter = Number(res.headers.get('retry-after')) || null;
      return { error: ctx.makeError(taxCode, { status, retryAfter, raw: body }) };
    }

    // Live response shapes vary: {image_url}/{video_url} (docs), or
    // {images:[{url}]}/{videos:[{url}]}/{video:{url}} (actual). Read all.
    const url = body?.image_url || body?.video_url
      || body?.images?.[0]?.url || body?.videos?.[0]?.url
      || body?.video?.url || body?.image?.url
      || body?.url || body?.data?.url || body?.output?.[0];
    if (!url) return { error: ctx.makeError('UNKNOWN', { status: res.status, raw: body }) };
    // Oxen file URLs live under hub.oxen.ai and require the Bearer token to fetch,
    // so pass an auth header through to the local downloader.
    const out = { type: ctx.model.type, url };
    if (/hub\.oxen\.ai/.test(url)) out.headers = { Authorization: `Bearer ${ctx.key}` };
    return { done: true, outputs: [out] };
  },
};

async function safeJson(res) {
  try { return await res.json(); } catch { return null; }
}
