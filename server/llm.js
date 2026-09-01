// Text LLM via OpenRouter — a thin, synchronous chat layer separate from the
// image/video job engine. It exists so small apps built INSIDE the studio (and
// the MCP `chat` tool) can call a language model with the same OpenRouter key the
// user already set — no extra config, no key handling in the app itself.
//
//   POST /api/llm { prompt | messages, model?, system?, temperature?, max_tokens? }
//     -> { text, model, usage, finish_reason }
//
// Any OpenRouter chat-model slug works; the default is a cheap, capable model
// that returns plain text without the account data-policy gate.

import { getKey } from './storage/store.js';
import { makeError, codeFromStatus, codeFromMessage } from './errors/map.js';

const BASE = 'https://openrouter.ai/api/v1';
export const DEFAULT_LLM_MODEL = 'meta-llama/llama-3.3-70b-instruct';

const HEADERS = (key) => ({
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
  'HTTP-Referer': 'http://localhost',
  'X-Title': 'JenAI Studio',
});

// Build the OpenAI-style messages array from either an explicit `messages` list
// or a single `prompt`, with an optional `system` message prepended.
function buildMessages({ messages, prompt, system }) {
  let msgs = Array.isArray(messages) ? messages.filter((m) => m && m.role && m.content != null) : [];
  if (!msgs.length && prompt != null && String(prompt).trim()) msgs = [{ role: 'user', content: String(prompt) }];
  if (system != null && String(system).trim()) msgs = [{ role: 'system', content: String(system) }, ...msgs];
  return msgs;
}

/**
 * Call an OpenRouter chat model and return its text.
 * @returns {Promise<{text,model,usage,finish_reason}|{error}>}
 */
export async function chat(req = {}) {
  const model = req.model || DEFAULT_LLM_MODEL;
  const key = getKey('openrouter');
  const err = (code, extra = {}) => ({ error: makeError(code, { provider: 'OpenRouter', model, ...extra }) });
  if (!key) return err('AUTH_MISSING');

  const messages = buildMessages(req);
  if (!messages.length) return err('BAD_REQUEST', { raw: { message: 'Provide `prompt` or a non-empty `messages` array.' } });

  const body = { model, messages };
  if (req.temperature != null && Number.isFinite(Number(req.temperature))) body.temperature = Number(req.temperature);
  if (req.max_tokens != null && Number.isFinite(Number(req.max_tokens))) body.max_tokens = Number(req.max_tokens);

  let res;
  try {
    res = await fetch(`${BASE}/chat/completions`, { method: 'POST', headers: HEADERS(key), body: JSON.stringify(body) });
  } catch (e) {
    return err('PROVIDER_DOWN', { raw: String(e) });
  }

  const j = await res.json().catch(() => null);
  if (!res.ok || j?.error) {
    const msg = j?.error?.message || '';
    let code = res.ok ? codeFromMessage(msg) : codeFromStatus(res.status);
    if (code === 'UNKNOWN' && msg) code = codeFromMessage(msg);
    return err(code, { status: res.status, raw: j });
  }

  const choice = j?.choices?.[0] || {};
  return {
    text: choice.message?.content ?? '',
    model: j?.model || model,
    usage: j?.usage || null,
    finish_reason: choice.finish_reason || null,
  };
}
