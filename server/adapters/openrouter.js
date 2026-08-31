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

export const openrouter = {
  id: 'openrouter',
  label: 'OpenRouter',
  signupUrl: 'https://openrouter.ai/keys',

  async submit(req, ctx) {
    if (req.task !== 'image') {
      return { error: ctx.makeError('BAD_REQUEST', { raw: { message: 'OpenRouter supports image generation only.' } }) };
    }
    const urls = (req.input_images || []).map((i) => i.url).filter(Boolean);

    // Reference→image goes through chat completions (the Images endpoint ignores
    // the reference). Text→image stays on the Images endpoint for aspect fidelity.
    if (urls.length) return submitWithReference(req, ctx, urls);

    const payload = { model: ctx.providerSlug, prompt: req.prompt };
    if (req.aspect_ratio) payload.aspect_ratio = req.aspect_ratio;
    if (req.resolution) payload.resolution = req.resolution;
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
};

// Reference→image via chat completions. The reference image(s) go in the message
// as image_url content parts, which is the path Gemini/Nano-Banana actually
// conditions on. aspect_ratio isn't a first-class field here, so nudge it in text.
async function submitWithReference(req, ctx, urls) {
  const parts = [{ type: 'text', text: req.prompt + (req.aspect_ratio ? `\n\nOutput aspect ratio: ${req.aspect_ratio}.` : '') }];
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
  // OpenRouter blocks some models (notably OpenAI image models) unless the
  // account's data policy allows them. Give a clear, actionable message.
  if (/no endpoints available|data policy|guardrail/i.test(msg)) {
    const e = ctx.makeError('BAD_REQUEST', { status, raw: { message:
      "OpenRouter is blocking this model for your account's data policy. Open https://openrouter.ai/settings/privacy → Zero Data Retention and turn the OpenAI toggle OFF so OpenAI image models (like GPT Image) can run — or pick a Google model (Nano Banana / Gemini) on OpenRouter, which works without that. Original: " + msg } });
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
