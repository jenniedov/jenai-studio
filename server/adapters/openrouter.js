// OpenRouter adapter. OpenRouter generates images through its chat-completions
// API (image-output models like Gemini Flash Image / GPT Image), returning the
// image as a base64 data URL in the message. Sync — no polling.
//
//   POST https://openrouter.ai/api/v1/chat/completions
//     { model, messages:[{role:'user',content:prompt}], modalities:['image','text'] }
//   -> choices[0].message.images[].image_url.url  (data:image/...;base64,...)
//
// Auth: Authorization: Bearer <key>. Best machine-readable errors of any
// provider via error.metadata.error_type. Video is not offered here.

const BASE = 'https://openrouter.ai/api/v1';

export const openrouter = {
  id: 'openrouter',
  label: 'OpenRouter',
  signupUrl: 'https://openrouter.ai/keys',

  async submit(req, ctx) {
    if (req.task !== 'image') {
      return { error: ctx.makeError('BAD_REQUEST', { raw: { message: 'OpenRouter supports image generation only.' } }) };
    }
    const content = [{ type: 'text', text: req.prompt }];
    for (const im of req.input_images || []) {
      if (im.url) content.push({ type: 'image_url', image_url: { url: im.url } });
    }
    let res;
    try {
      res = await fetch(`${BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ctx.key}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost',
          'X-Title': 'JenAI Studio',
        },
        body: JSON.stringify({
          model: ctx.providerSlug,
          messages: [{ role: 'user', content }],
          modalities: ['image', 'text'],
          // OpenAI image models route only when the account allows data sharing.
          // The user opts in via the in-app consent (and enables it on their
          // OpenRouter account); passing this makes routing explicit.
          ...(/^openai\//.test(ctx.providerSlug) ? { provider: { data_collection: 'allow' } } : {}),
        }),
      });
    } catch (e) {
      return { error: ctx.makeError('PROVIDER_DOWN', { raw: String(e) }) };
    }

    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const status = res.status;
      const et = body?.error?.metadata?.error_type || '';
      const msg = body?.error?.message || et || '';
      let code;
      // OpenRouter blocks some models (notably OpenAI image models) unless the
      // account's data policy allows them. Give a clear, actionable message.
      if (/no endpoints available|data policy|guardrail/i.test(msg)) {
        return { error: ctx.makeError('BAD_REQUEST', { status, raw: { message:
          "OpenRouter blocked this model for your account's data policy. Open https://openrouter.ai/settings/privacy and enable the prompt-training / data-sharing option so OpenAI image models (like GPT Image) can run — or pick a Google model (Nano Banana / Gemini) on OpenRouter, which works without that. Original: " + msg } }) };
      }
      if (/moderat|content|safety|flagged/i.test(et + msg)) code = 'MODERATION_BLOCKED';
      else if (status === 401 || status === 403) code = 'AUTH_INVALID';
      else if (status === 402 || /credit|insufficient|balance/i.test(msg)) code = 'INSUFFICIENT_CREDITS';
      else if (status === 429) code = 'RATE_LIMITED';
      else if (status === 400 || status === 422) code = 'BAD_REQUEST';
      else if (status >= 500) code = 'PROVIDER_DOWN';
      else code = ctx.sniff(msg);
      return { error: ctx.makeError(code, { status, raw: body }) };
    }

    const msg = body?.choices?.[0]?.message || {};
    const url = msg.images?.[0]?.image_url?.url
      || (typeof msg.content === 'string' ? msg.content.match(/data:image[^)"'\s]+/)?.[0] : null);
    if (!url) return { error: ctx.makeError('UNKNOWN', { status: res.status, raw: body }) };
    return { done: true, outputs: [{ type: 'image', url }] };
  },
};
