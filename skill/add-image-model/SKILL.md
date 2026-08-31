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
- **OpenRouter:** `curl https://openrouter.ai/api/v1/models` lists **image**
  models (filter `architecture.output_modalities` for `image`) — Google
  `gemini-*-image`, OpenAI `gpt-*-image`, ByteDance `seedream-*`, and more.
  ⚠️ **Video models are HIDDEN from that list.** To find/confirm a video (or any)
  model, probe its endpoint directly:
  `curl .../api/v1/models/<slug>/endpoints` → `data.architecture.output_modalities`.
  OpenRouter has Seedance, Veo, Sora, Wan, Kling (`kwaivgi/…`), Flux video, etc.
  See "## OpenRouter contract" below before wiring an OpenRouter slug.
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

## OpenRouter contract (hard-won specifics — read before wiring an OpenRouter slug)

The OpenRouter adapter (`server/adapters/openrouter.js`) already implements all of
this; you rarely touch code, just add the slug. But know how it behaves:

- **Two image endpoints, picked by model family:**
  - **Text→image:** `POST /api/v1/images { model, prompt, aspect_ratio?, resolution? }`
    → `{ data: [{ b64_json, media_type }] }`. Honors aspect_ratio/resolution.
  - **Reference→image:** Gemini & GPT-image condition on the reference via
    `POST /api/v1/chat/completions` with `modalities:["image","text"]` and the
    image as an `image_url` content part. **All other image models (Seedream, …)
    are Images-only** — chat completions rejects them ("no endpoints support
    image,text modalities") — so their reference goes on `/images` in
    **`input_references: [{ type:"image_url", image_url:{ url } }]`**.
    ⚠️ The `/images` `image` field is **silently ignored** — it invents a new
    person. Identity only holds via `input_references` (or the chat path). Data
    URLs are accepted.
  - Routing lives in `usesChatCompletions(slug)` (`/gemini/` or `/^openai\/gpt/`).

- **Size keywords:** models whose `resolutions` are OpenAI size words
  (`auto/square/portrait/landscape`, `resolutionField:"size"`) don't work on
  OpenRouter's `resolution` field. The adapter maps `square→1:1, portrait→2:3,
  landscape→3:2` and drops `auto` (`normSize`). Just set the model's real values.

- **Video:** `POST /api/v1/videos { model, prompt, duration?, resolution?,
  aspect_ratio?, frame_images:[{type:"image_url",image_url:{url},frame_type:"first_frame"}]?,
  input_references:[…]? }` → `{ id, polling_url, status }`. **Async:** poll
  `GET /api/v1/videos/{id}` until `status:"completed"`, then download
  `unsigned_urls[0]` — that content URL needs the `Authorization: Bearer` header
  (the adapter passes it via `outputs[].headers`).

- **Data-policy / ZDR gate (404 "No endpoints available … data policy"):** NOT a
  bug and NOT a request-field problem. The user's OpenRouter account privacy
  (openrouter.ai/settings/privacy) blocks the provider — commonly the **Non-frontier
  Zero Data Retention** toggle (blocks Seedance/Seedream/etc.) or a per-provider
  Data-Training toggle set to disabled. Tell the user to allow the provider there;
  the friendly error already says so. OpenAI-on-OpenRouter is auto-verified at
  startup (`probeOpenaiEligibility`) — video/ByteDance is not, so it needs the
  manual account toggle.

- **Real-person filter (ByteDance):** Seedance/Seedream **hard-block input images
  of a real identifiable person** (`InputImageSensitiveContentDetected`). Rewording
  won't help — it's the image. Workaround: render the person as a **character
  sheet / character asset** first (see the `character-sheet` skill) and use THAT.
