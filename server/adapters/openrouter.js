// OpenRouter adapter. TWO endpoints, picked by whether there's a reference:
//
//  • text→image (no reference): the dedicated Images API, which honours
//    aspect_ratio and resolution (chat completions ignores them, always 1:1).
//      POST /images { model, prompt, aspect_ratio, resolution } -> { data:[{b64_json}] }
//
//  • reference→image (has input_images): the CHAT COMPLETIONS API with
//    modalities + image_url content parts. The Images endpoint's `image` field
//    is silently IGNORED for reference conditioning — it generates fresh from the
//    prompt — so an "edit / keep this person" request must go through chat.
//      POST /chat/completions { model, modalities:["image","text"],
//        messages:[{role:"user", content:[{type:"text",text}, {type:"image_url",image_url:{url}}]}] }
//      -> { choices:[{ message:{ images:[{ image_url:{ url: dataUrl } }] } }] }
//
// The engine inlines local file references to base64 data URLs first. Auth:
// Authorization: Bearer <key>. Video is not offered here.

const BASE = 'https://openrouter.ai/api/v1';

const HEADERS = (key) => ({
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
  'HTTP-Referer': 'http://localhost',
  'X-Title': 'JenAI Studio',
});

// Some models (e.g. GPT Image 1.5) express "resolution" as OpenAI size keywords
// (auto/square/portrait/landscape) meant for the OpenAI `size` field. OpenRouter's
// Images API doesn't understand those — it wants aspect_ratio + a real resolution
// (1K/2K/…). Translate the keyword to an aspect ratio and drop the bogus
// resolution so the request is valid.
// Which OpenRouter image models condition on references via /chat/completions
// (modalities). Gemini and the OpenAI GPT-image family do; everything else is
// Images-only and takes its reference through the /images `image` field.
function usesChatCompletions(slug) {
  return /gemini/i.test(slug) || /^openai\/gpt/i.test(slug);
}

const SIZE_TO_RATIO = { square: '1:1', portrait: '2:3', landscape: '3:2' };
function normSize(req) {
  let aspect = req.aspect_ratio;
  let resolution = req.resolution;
  if (resolution && SIZE_TO_RATIO[resolution]) { aspect = aspect || SIZE_TO_RATIO[resolution]; resolution = undefined; }
  else if (resolution === 'auto') resolution = undefined;
  return { aspect, resolution };
}

export const openrouter = {
  id: 'openrouter',
  label: 'OpenRouter',
  signupUrl: 'https://openrouter.ai/keys',

  async submit(req, ctx) {
    if (req.task === 'video') return submitVideo(req, ctx);
    const urls = (req.input_images || []).map((i) => i.url).filter(Boolean);

    // Gemini / GPT-image condition on references through chat completions (the
    // Images endpoint ignores them). Other image models (Seedream, …) are
    // Images-only — chat completions rejects them ("no endpoints support
    // image,text modalities") — so their references go in the Images `image` field.
    if (urls.length && usesChatCompletions(ctx.providerSlug)) return submitWithReference(req, ctx, urls);

    const { aspect, resolution } = normSize(req);
    const payload = { model: ctx.providerSlug, prompt: req.prompt };
    if (aspect) payload.aspect_ratio = aspect;
    if (resolution) payload.resolution = resolution;
    // References on the Images endpoint go in `input_references` (image_url parts).
    // `image` is silently ignored — Seedream et al. only condition on identity here.
    if (urls.length) payload.input_references = urls.map((u) => ({ type: 'image_url', image_url: { url: u } }));
    ctx.applyOptions?.(payload); // config-driven custom options mapped to openrouter
    // OpenAI image models route only when the account allows data sharing.
    if (/^openai\//.test(ctx.providerSlug)) payload.provider = { data_collection: 'allow' };

    let res;
    try {
      res = await fetch(`${BASE}/images`, {
        method: 'POST',
        headers: HEADERS(ctx.key),
        body: JSON.stringify(payload),
      });
    } catch (e) {
      return { error: ctx.makeError('PROVIDER_DOWN', { raw: String(e) }) };
    }

    const body = await res.json().catch(() => null);
    if (!res.ok) return { error: mapOpenrouterError(res.status, body, ctx) };

    const item = body?.data?.[0] || {};
    const url = item.url
      || (item.b64_json ? `data:${item.media_type || 'image/png'};base64,${item.b64_json}` : null);
    if (!url) return { error: ctx.makeError('UNKNOWN', { status: res.status, raw: body }) };
    return { done: true, outputs: [{ type: 'image', url }] };
  },

  // Video is async: submit returns a jobRef; the engine calls poll() until the
  // job completes, then downloads the (auth-protected) content URL.
  async poll(jobRef, ctx) {
    let res;
    try { res = await fetch(`${BASE}/videos/${encodeURIComponent(jobRef)}`, { headers: HEADERS(ctx.key) }); }
    catch (e) { return { error: ctx.makeError('PROVIDER_DOWN', { raw: String(e) }) }; }
    const b = await res.json().catch(() => null);
    if (!res.ok || b?.error) return { error: mapOpenrouterError(res.status, b, ctx) };
    const status = b?.status;
    if (status === 'completed') {
      const url = (b.unsigned_urls || [])[0];
      if (!url) return { error: ctx.makeError('UNKNOWN', { status: res.status, raw: b }) };
      // The content URL needs the API key to download — pass it as headers so the
      // engine's downloadToFiles authenticates the fetch.
      return { done: true, outputs: [{ type: 'video', url, headers: { Authorization: `Bearer ${ctx.key}` } }] };
    }
    if (status === 'failed') {
      return { error: mapOpenrouterError(200, { error: { message: b?.error?.message || 'video generation failed' } }, ctx) };
    }
    return { done: false }; // pending / in_progress
  },
};

// Text/image→video via POST /videos (async). Returns { id, polling_url, status };
// we hand back the id as the jobRef to poll.
//
// ALL references go in `input_references` (subject/content guides) — NOT
// `frame_images`. Two reasons this matters when there are multiple references
// (e.g. a person + a location): (1) frame_images only takes ONE image, so the
// others (the person!) would be dropped; (2) a forced first_frame makes the video
// inherit THAT image's shape, so a 16:9 location frame overrode a requested 9:16.
// With input_references, every reference informs the video and `aspect_ratio`
// controls the frame. (A true "start from this exact frame" mode can be added
// later behind an explicit flag.)
async function submitVideo(req, ctx) {
  const { aspect } = normSize(req);
  const body = { model: ctx.providerSlug, prompt: req.prompt };
  if (req.duration_seconds) body.duration = req.duration_seconds;
  if (req.resolution) body.resolution = req.resolution;
  if (aspect) body.aspect_ratio = aspect;
  const urls = (req.input_images || []).map((i) => i.url).filter(Boolean);
  if (urls.length) {
    body.input_references = urls.map((u) => ({ type: 'image_url', image_url: { url: u } }));
  }
  ctx.applyOptions?.(body); // config-driven custom options mapped to openrouter
  if (/^openai\//.test(ctx.providerSlug)) body.provider = { data_collection: 'allow' };

  let res;
  try { res = await fetch(`${BASE}/videos`, { method: 'POST', headers: HEADERS(ctx.key), body: JSON.stringify(body) }); }
  catch (e) { return { error: ctx.makeError('PROVIDER_DOWN', { raw: String(e) }) }; }
  const b = await res.json().catch(() => null);
  if (!res.ok || b?.error) return { error: mapOpenrouterError(res.status, b, ctx) };
  const id = b?.id;
  if (!id) return { error: ctx.makeError('UNKNOWN', { status: res.status, raw: b }) };
  return { done: false, jobRef: id };
}

// Reference→image via chat completions. The reference image(s) go in the message
// as image_url content parts, which is the path Gemini/Nano-Banana actually
// conditions on. aspect_ratio isn't a first-class field here, so nudge it in text.
async function submitWithReference(req, ctx, urls) {
  const { aspect } = normSize(req);
  const parts = [{ type: 'text', text: req.prompt + (aspect ? `\n\nOutput aspect ratio: ${aspect}.` : '') }];
  for (const u of urls) parts.push({ type: 'image_url', image_url: { url: u } });
  const payload = {
    model: ctx.providerSlug,
    modalities: ['image', 'text'],
    messages: [{ role: 'user', content: parts }],
  };
  if (/^openai\//.test(ctx.providerSlug)) payload.provider = { data_collection: 'allow' };

  let res;
  try {
    res = await fetch(`${BASE}/chat/completions`, { method: 'POST', headers: HEADERS(ctx.key), body: JSON.stringify(payload) });
  } catch (e) {
    return { error: ctx.makeError('PROVIDER_DOWN', { raw: String(e) }) };
  }
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.error) return { error: mapOpenrouterError(res.status, body, ctx) };

  const msg = body?.choices?.[0]?.message || {};
  const img = (msg.images || [])[0];
  const url = img?.image_url?.url || img?.url || null;
  if (!url) return { error: ctx.makeError('UNKNOWN', { status: res.status, raw: body }) };
  return { done: true, outputs: [{ type: 'image', url }] };
}

function mapOpenrouterError(status, body, ctx) {
  const et = body?.error?.metadata?.error_type || '';
  const msg = body?.error?.message || et || '';
  // OpenRouter blocks some models (OpenAI image models, and most video models)
  // unless the account's data policy allows the provider. Give an actionable message.
  if (/no endpoints available|data policy|guardrail/i.test(msg)) {
    const e = ctx.makeError('BAD_REQUEST', { status, raw: { message:
      "OpenRouter is blocking this model for your account's data policy. Open https://openrouter.ai/settings/privacy and allow the provider (enable prompt/data sharing for the model's provider — e.g. OpenAI, ByteDance/Seed, Google) so it can run. Video models and OpenAI image models generally need this; Google image models (Nano Banana / Gemini) work without it. Original: " + msg } });
    e.openrouterDataPolicy = true; // lets the engine mark this account not-eligible
    return e;
  }
  let code;
  if (/moderat|content|safety|flagged|recitation|copyright/i.test(et + msg)) code = 'MODERATION_BLOCKED';
  else if (status === 401 || status === 403) code = 'AUTH_INVALID';
  else if (status === 402 || /credit|insufficient|balance/i.test(msg)) code = 'INSUFFICIENT_CREDITS';
  else if (status === 429) code = 'RATE_LIMITED';
  else if (status === 400 || status === 422) code = 'BAD_REQUEST';
  else if (status >= 500) code = 'PROVIDER_DOWN';
  else code = ctx.sniff(msg);
  return ctx.makeError(code, { status, raw: body });
}

// Probe whether OpenAI-on-OpenRouter is reachable on this account. Eligibility
// is purely "not blocked by the account's data policy" — so we send a tiny
// TEXT-only request (max_tokens:1, no image) to the OpenAI image endpoint: it
// hits the same first-party-OpenAI data-policy gate but generates no image, so
// the check is free. A data-policy 404 means not eligible; any 200 means
// eligible (even if the model returns nothing). Other failures are inconclusive
// (eligible: null) so a transient hiccup never wrongly flips the stored state.
export async function probeOpenaiEligibility(key) {
  if (!key) return { eligible: false, reason: 'no_key' };
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost',
        'X-Title': 'JenAI Studio',
      },
      body: JSON.stringify({
        model: 'openai/gpt-5-image-mini',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
        provider: { data_collection: 'allow' },
      }),
    });
    if (res.ok) return { eligible: true, reason: 'ok' };
    const body = await res.json().catch(() => null);
    const msg = body?.error?.message || '';
    if (/no endpoints available|data policy|guardrail/i.test(msg)) return { eligible: false, reason: 'data_policy' };
    return { eligible: null, reason: `http_${res.status}` }; // inconclusive
  } catch {
    return { eligible: null, reason: 'network' }; // inconclusive
  }
}
