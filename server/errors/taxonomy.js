// The universal error taxonomy. Every provider failure maps to one of these.
// The UI never shows a raw 401/402 — it shows the friendly copy for one of these codes.

export const CODES = {
  AUTH_MISSING: 'AUTH_MISSING', // no key set for this provider
  AUTH_INVALID: 'AUTH_INVALID', // key rejected (401)
  INSUFFICIENT_CREDITS: 'INSUFFICIENT_CREDITS', // out of money / credits (402 etc.)
  RATE_LIMITED: 'RATE_LIMITED', // too many requests (429)
  BAD_REQUEST: 'BAD_REQUEST', // bad params / unsupported model (400/422)
  MODERATION_BLOCKED: 'MODERATION_BLOCKED', // content filtered
  PERSON_IMAGE_BLOCKED: 'PERSON_IMAGE_BLOCKED', // reference image blocked as a real person
  PROVIDER_DOWN: 'PROVIDER_DOWN', // upstream 5xx / model unavailable
  TIMEOUT: 'TIMEOUT', // took too long
  UNKNOWN: 'UNKNOWN', // anything unmapped
};

/**
 * Build a normalized error object.
 * @param {string} code one of CODES
 * @param {object} [extra] { provider, model, status, raw, retryAfter }
 */
export function normalizedError(code, extra = {}) {
  return {
    code: CODES[code] ? code : CODES.UNKNOWN,
    provider: extra.provider || null,
    model: extra.model || null,
    status: extra.status ?? null,
    retryAfter: extra.retryAfter ?? null,
    // The raw provider payload, kept for the "technical details" disclosure only.
    raw: extra.raw ?? null,
  };
}
