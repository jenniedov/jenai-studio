// ===========================================================================
// COPY ME to add a new provider.
//
// 1. Copy this file to `server/adapters/myprovider.js`.
// 2. Fill in the four marked spots: base URL + auth, request mapping,
//    response/poll parsing, error mapping.
// 3. Register it in `server/adapters/index.js` (add to the ADAPTERS list).
// 4. Add a "myprovider" slug to the models you support in config/models.json.
//
// See docs/add-a-provider.md for the full walkthrough, and kie.js (async) /
// oxen.js (sync) for two real, working examples.
// ===========================================================================

// (1) BASE URL + AUTH ------------------------------------------------------
const BASE = 'https://api.myprovider.com/v1';
// Most providers use `Authorization: Bearer <key>`. fal.ai uses `Key <key>`.
function authHeaders(key) {
  return { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

export const myprovider = {
  id: 'myprovider',
  label: 'My Provider',
  signupUrl: 'https://myprovider.com',

  async submit(req, ctx) {
    // (2) REQUEST MAPPING -------------------------------------------------
    // Translate the universal request into this provider's body shape.
    const payload = {
      model: ctx.providerSlug, // the "myprovider" slug from models.json
      prompt: req.prompt,
      // aspect_ratio: req.aspect_ratio, resolution: req.resolution, ...
      // ...(req.provider_options || {}),
    };

    let res;
    try {
      res = await fetch(`${BASE}/generate`, {
        method: 'POST',
        headers: authHeaders(ctx.key),
        body: JSON.stringify(payload),
      });
    } catch (e) {
      return { error: ctx.makeError('PROVIDER_DOWN', { raw: String(e) }) };
    }

    const body = await res.json().catch(() => null);

    // (4) ERROR MAPPING ---------------------------------------------------
    if (!res.ok) {
      return { error: mapError(res.status, body, res.headers, ctx) };
    }

    // (3) RESPONSE PARSING ------------------------------------------------
    // SYNC provider (URL comes back immediately):
    //   const url = body.output_url;
    //   return { done: true, outputs: [{ type: ctx.model.type, url }] };
    //
    // ASYNC provider (you get a job id, then poll):
    //   return { done: false, jobRef: body.id };
    const url = body?.output_url;
    if (url) return { done: true, outputs: [{ type: ctx.model.type, url }] };
    if (body?.id) return { done: false, jobRef: body.id };
    return { error: ctx.makeError('UNKNOWN', { status: res.status, raw: body }) };
  },

  // Only needed for ASYNC providers. Delete this for sync ones.
  async poll(jobRef, ctx) {
    let res;
    try {
      res = await fetch(`${BASE}/jobs/${jobRef}`, { headers: authHeaders(ctx.key) });
    } catch (e) {
      return { error: ctx.makeError('PROVIDER_DOWN', { raw: String(e) }) };
    }
    const body = await res.json().catch(() => null);
    if (!res.ok) return { error: mapError(res.status, body, res.headers, ctx) };

    if (body.status === 'succeeded' || body.status === 'done') {
      const urls = body.output || [];
      return { done: true, outputs: urls.map((url) => ({ type: ctx.model.type, url })) };
    }
    if (body.status === 'failed' || body.status === 'error') {
      return { error: mapError(200, body, res.headers, ctx) };
    }
    return { done: false }; // still running
  },
};

// (4) ERROR MAPPING helper --------------------------------------------------
// Map (status, body, headers) -> a taxonomy code. Order: HTTP status first,
// then any machine-readable field the provider gives, then sniff the message.
function mapError(status, body, headers, ctx) {
  let code;
  if (status === 401 || status === 403) code = 'AUTH_INVALID';
  else if (status === 402) code = 'INSUFFICIENT_CREDITS';
  else if (status === 429) code = 'RATE_LIMITED';
  else if (status === 400 || status === 422) code = 'BAD_REQUEST';
  else if (status >= 500) code = 'PROVIDER_DOWN';
  else code = ctx.sniff(body?.error?.message || body?.message || '');
  const retryAfter = Number(headers?.get?.('retry-after')) || null;
  return ctx.makeError(code, { status, retryAfter, raw: body });
}
