---
name: add-image-model
description: Add a new image (or video) model to JenAI Studio and wire it across ALL providers that can serve it (Oxen, Kie, OpenRouter, and any others registered). Goes through each provider's live catalog to find the model's real slug and its supported aspect ratios / resolutions / options. Use when the user says "add <model> as a model", "I want <model> in the studio", or "add the new <X> image/video model".
user-invocable: true
---

# Add a model to JenAI Studio

Goal: add one model to `config/models.json` so it appears in the model picker and
can run on **every provider that offers it** — not just one. A model is
provider-agnostic: its `providers` object maps each provider `id` to that
provider's own slug for the same underlying model.

Work in `~/code/jenai-studio`. Models live entirely in `config/models.json` — no
code change is needed for a standard model; the adapters already read the option
fields off `ctx.model`.

## 1. Find the model on each provider

For every registered provider (see the `ADAPTERS` list in
`server/adapters/index.js` — currently Oxen, Kie, OpenRouter), look up the model
in its live catalog and record the exact slug:

- **Oxen:** `curl https://hub.oxen.ai/api/ai/models` — 185+ models, each with a
  `request_schema`. Use the schema to read the real option field names.
- **Kie:** check api.kie.ai docs / model list. Image slugs are usually bare
  (`nano-banana-pro`); some families use a separate endpoint (Veo) — see `kie.js`.
- **OpenRouter:** `curl https://openrouter.ai/api/v1/models` and filter to
  `architecture.output_modalities` containing `image`. It serves Google
  `gemini-*-image` and OpenAI `gpt-*-image` families.
- Any provider added later: use its docs. If a provider doesn't offer the model,
  leave it out — cover every provider that genuinely does.

## 2. Read the model's real options (don't invent them)

From the provider schema (Oxen's `request_schema` is the richest source), capture:

- `aspectRatios` — the actual list the model accepts (omit `[]` if it has none).
- `resolutions` — the accepted values, AND set `resolutionField` if the model
  names the field something other than `resolution` (`size`, `image_size`, …).
- For video: `durations` + `durationField` (`duration` vs `seconds`) and `audio`.

Wrong option values become a friendly `BAD_REQUEST`, not a crash — but get them
right so the model actually works. Match ratios/resolutions to what the primary
provider documents.

## 3. Add the entry

Append an object to `models[]`:

```json
{
  "key": "<short-kebab-key>",
  "label": "<Display Name>",
  "type": "image",              // or "video"
  "tag": "new",                 // optional: "top" | "new"
  "blurb": "<one short line>",
  "priceUsd": 0.05,             // approx per-output cost, for the ✦ estimate
  "aspectRatios": ["1:1", "16:9", "9:16"],
  "resolutions": ["1K", "2K", "4K"],
  "providers": {
    "oxen": "<oxen-slug>",
    "kie": "<kie-slug>",
    "openrouter": "<openrouter-slug>"
  }
}
```

Include only the providers that serve it. `type: "image"` models also appear in
the Cinema studio automatically.

## 4. Verify

1. `npm run build` (or `npm test`) — must pass.
2. Start the server, open the model picker, select the new model, and confirm:
   the provider pill lists exactly the providers you wired, and the aspect /
   resolution / (duration/audio for video) pills show the right options.
3. Run one real generation on a provider that has credits (currently OpenRouter
   for the Gemini/GPT image families) to confirm the slug and options are valid.
4. Update `~/.claude/projects/-Users-jennie-code/memory/jenai-studio-project.md`
   with the new model and which providers serve it.

Report: the model key, providers wired, options captured, and the verification
result.
