# The friendly-error system

No user ever sees a raw `401` or `402`. Every provider failure is normalized to
one **taxonomy code**, and each code has bilingual friendly copy plus a
ready-to-paste **Claude hand-off prompt**.

## The taxonomy

| Code | Meaning |
|---|---|
| `AUTH_MISSING` | No key set for this provider |
| `AUTH_INVALID` | Key rejected (401/403) |
| `INSUFFICIENT_CREDITS` | Out of money / credits (402) — the most common; must be crystal clear |
| `RATE_LIMITED` | Too many requests (429) — respects `Retry-After` |
| `BAD_REQUEST` | Bad params / unsupported model (400/422) |
| `MODERATION_BLOCKED` | Content filtered |
| `PROVIDER_DOWN` | Upstream 5xx / model unavailable |
| `TIMEOUT` | Took too long |
| `UNKNOWN` | Anything unmapped |

Defined in [`server/errors/taxonomy.js`](../server/errors/taxonomy.js).

## How a failure is mapped

Decided in this order (see each adapter's `mapError`):

1. **HTTP status** — `codeFromStatus()` in [`map.js`](../server/errors/map.js).
2. **Provider machine field** — e.g. Kie's envelope `code` / `failCode`,
   OpenRouter's `error.metadata.error_type`, fal's `X-Fal-Error-Type` header.
3. **Message string** — `codeFromMessage()` sniffs the text as a last resort.

## The copy

Two JSON files hold the friendly copy, keyed by taxonomy code:

- [`server/errors/copy.en.json`](../server/errors/copy.en.json)
- [`server/errors/copy.he.json`](../server/errors/copy.he.json)

Each entry has `title`, `body`, `action`, and `claudePrompt`. The
`{provider}` and `{model}` placeholders are filled in at runtime by `decorate()`.

## What the user sees

1. A **failed tile** in the gallery: a muted card with the word **Error / שגיאה**
   and a small **More info / פרטים** link. No stack traces in the grid.
2. Clicking opens a **modal**: friendly title, one plain sentence, and a primary
   **What do I do now? / מה עכשיו?** button.
3. That button reveals the **Paste this into your Claude** step: the pre-filled
   prompt with a Copy button, and the raw provider payload folded behind a
   **Technical details** disclosure for the curious.

## Adding or changing copy

Edit the two `copy.*.json` files. Every taxonomy code must exist in both locales —
the test in `tests/errors.test.js` enforces this. Write the Hebrew in Jennie's
spoken 2026 style (no periods or commas — line breaks instead, plain words).
