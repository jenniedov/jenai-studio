---
name: add-provider
description: Add a new generation provider (like fal, Replicate, Together, a new API) to JenAI Studio end-to-end — write the adapter, register it, AND wire its model slug into every existing model so it shows up as a selectable provider everywhere (images, videos, Cinema). Use when the user says "add a provider", "add <name> as a provider", "I have a new API key for <service>", or complains that a provider they added isn't selectable on some models.
user-invocable: true
---

# Add a provider to JenAI Studio

Goal: a newly added provider must appear automatically **everywhere** — for every
image model, every video model, and the Cinema studio — anywhere it can actually
serve the model. The #1 mistake (which has bitten us before) is writing the
adapter but forgetting to add the provider's slug to each model in
`config/models.json`. The UI only offers a provider for a model when that model
has a slug for it (`availableProviders` in `web/src/lib/studio.jsx`). No slug →
the provider silently never appears. **The model-slug pass is the important half
of this job, not an afterthought.**

Work in `~/code/jenai-studio`. Do every step; verify at the end.

## 1. Write the adapter

1. Copy the template: `server/adapters/_template.js` → `server/adapters/<id>.js`
   (e.g. `fal.js`). Keep the exported object's `id` short and lowercase — this
   `id` is the provider key used everywhere (config, models.json slugs, UI).
2. Fill in `label`, `signupUrl`, and `submit(req, ctx)`. Study `oxen.js` (sync:
   returns `{ done:true, outputs }` immediately) and `kie.js` (async: returns
   `{ done:false, jobRef }` then implements `poll(jobRef, ctx)`). Pick whichever
   matches the new API.
3. `submit` must return one of: `{ done, jobRef }`, `{ done:true, outputs:[{url,type}] }`,
   or `{ error: ctx.makeError(CODE, {...}) }`. Map HTTP status → a taxonomy code
   (`AUTH_INVALID`, `INSUFFICIENT_CREDITS`, `RATE_LIMITED`, `BAD_REQUEST`,
   `MODERATION_BLOCKED`, `PROVIDER_DOWN`, `TIMEOUT`, `UNKNOWN`) — copy the mapping
   block from an existing adapter. Never throw for an API error; return `makeError`.
4. Read per-model option fields off `ctx.model`: `resolutionField`
   (`resolution`/`size`/`image_size`), `durationField` (`duration`/`seconds`),
   and `audio`. Only send fields the model declares — that's how one adapter
   serves models with different option names.
5. If the provider's output URLs need auth headers to download, thread them via
   `out.headers` (see how `oxen.js` passes the Bearer token to `downloadToFiles`).

## 2. Register it

In `server/adapters/index.js`, import the adapter and add it to the `ADAPTERS`
array. That's all the server needs — `/api/providers` now lists it, and a key
can be saved for it in Settings.

## 3. Wire the slug into EVERY model it can serve (do not skip)

Open `config/models.json`. For **each** model in `models[]`, decide whether the
new provider can serve it, and if so add a `"<id>": "<provider's slug>"` entry to
that model's `providers` object — alongside the existing `oxen`/`kie`/etc.

- Find the provider's real slug for each model from its live model list / docs
  (e.g. `curl https://openrouter.ai/api/v1/models`). Match by capability and
  family, don't guess a string that will 400.
- If the provider genuinely can't serve a model, leave it out — honest coverage,
  not fake slugs. But cover **everything it can**, images and videos both.
- Every model listed here also feeds the Cinema studio (it reuses the image
  pipeline), so covering the image models covers Cinema automatically.

This is the step that makes the provider "global." When you're done, no model the
provider supports should be missing its slug.

## 4. Verify

1. `npm run build` (or `npm test`) — must pass.
2. Start the server (`npm start`) and, for a spot-check model plus one it can't
   serve, confirm the provider dropdown shows/hides it correctly. In the browser
   console: pick the model, open the ⚑ provider pill.
3. Save a key for the provider in Settings and run one real generation on the
   cheapest supported model to confirm the adapter's request + output parsing +
   local download all work.
4. Update `~/.claude/projects/-Users-jennie-code/memory/jenai-studio-project.md`
   with the provider, which models got slugs, and anything it can't serve.

Report: adapter file, models covered, models intentionally skipped (with why),
and the verification result.
