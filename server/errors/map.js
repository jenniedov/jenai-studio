import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CODES, normalizedError } from './taxonomy.js';

const here = dirname(fileURLToPath(import.meta.url));
const copy = {
  en: JSON.parse(readFileSync(join(here, 'copy.en.json'), 'utf8')),
  he: JSON.parse(readFileSync(join(here, 'copy.he.json'), 'utf8')),
};

// Generic HTTP-status → code. Used as the first pass for every provider, then
// each adapter can refine with provider-specific machine fields.
export function codeFromStatus(status) {
  if (status === 401 || status === 403) return CODES.AUTH_INVALID;
  if (status === 402) return CODES.INSUFFICIENT_CREDITS;
  if (status === 429) return CODES.RATE_LIMITED;
  if (status === 400 || status === 422) return CODES.BAD_REQUEST;
  if (status === 408 || status === 504) return CODES.TIMEOUT;
  if (status >= 500) return CODES.PROVIDER_DOWN;
  return CODES.UNKNOWN;
}

// A light keyword sniff over a message string — the last-resort third pass.
export function codeFromMessage(message = '') {
  const m = String(message).toLowerCase();
  if (/insufficient|no credit|out of credit|balance|not enough/.test(m)) return CODES.INSUFFICIENT_CREDITS;
  if (/rate limit|too many|slow down/.test(m)) return CODES.RATE_LIMITED;
  if (/unauthor|invalid.*key|api key|forbidden/.test(m)) return CODES.AUTH_INVALID;
  if (/real person|inputimagesensitive|privacyinformation|sensitivecontent/.test(m)) return CODES.PERSON_IMAGE_BLOCKED;
  if (/moderat|content policy|safety|nsfw|blocked|flagged/.test(m)) return CODES.MODERATION_BLOCKED;
  if (/timeout|timed out/.test(m)) return CODES.TIMEOUT;
  if (/unavailable|overloaded|try again later|busy/.test(m)) return CODES.PROVIDER_DOWN;
  return CODES.UNKNOWN;
}

/**
 * Attach bilingual friendly copy to a normalized error, with {provider}/{model}
 * substituted in. The UI reads `.friendly.he` / `.friendly.en`.
 */
export function decorate(err) {
  const provider = err.provider || 'the provider';
  const model = err.model || 'the model';
  const fill = (s) => s.replaceAll('{provider}', provider).replaceAll('{model}', model);
  const friendly = {};
  for (const locale of ['en', 'he']) {
    const c = copy[locale][err.code] || copy[locale].UNKNOWN;
    friendly[locale] = {
      title: fill(c.title),
      body: fill(c.body),
      action: c.action,
      claudePrompt: fill(c.claudePrompt),
    };
  }
  return { ...err, friendly };
}

// Convenience: build a fully-decorated normalized error in one call.
export function makeError(code, extra = {}) {
  return decorate(normalizedError(code, extra));
}
