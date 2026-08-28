---
name: jenai-studio-install
description: Install, run, and use JenAI Studio — a local app for making AI images and videos. Use when the user says "set up JenAI Studio", "install JenAI Studio", "run the studio", or asks you to generate many images/videos from a brief into their local studio gallery.
user-invocable: true
---

# JenAI Studio — install & use

You are helping someone (often a non-coder) get JenAI Studio running on their own
machine and then use it. Be warm and concrete. Do each step, show the result,
and don't move on until the current step worked.

## Part 1 — Install and run

1. **Check the tools.** Run `node --version` (need v18+) and `git --version`.
   If Node is missing, point them to https://nodejs.org (LTS) and stop until it's installed.

2. **Get the code.** If they already have the folder, `cd` into it. Otherwise clone it:
   ```bash
   git clone <REPO_URL> jenai-studio
   cd jenai-studio
   ```

3. **Install and start:**
   ```bash
   npm install
   npm start
   ```
   `npm start` builds the UI and starts one server. When you see
   `open http://localhost:4317`, open that URL in the browser.

4. **Confirm the wow.** Tell them: "You now have a real app running on your own
   computer." The onboarding popup asks for a provider + key, or Skip.

## Part 2 — Getting a free key (if they don't have one)

- **Oxen.ai** (simplest): sign up at https://oxen.ai. They give ~$20 free, and
  email hello@oxen.ai to double it to $40.
- **Kie.ai**: sign up at https://kie.ai — 80 free credits that never expire,
  covers every model.

They paste the key into the onboarding popup or Settings. Keys stay on their
machine — nothing is uploaded anywhere except the provider they chose.

## Part 3 — The magic flow (script → many images → video)

This is the finale. The local server exposes one endpoint you call directly:

`POST http://localhost:4317/api/generate`

### Request shape

```json
{
  "task": "image",            // "image" | "video"
  "provider": "kie",          // "kie" | "oxen"
  "model": "nano-banana-pro", // a key from GET /api/models
  "prompt": "…",
  "aspect_ratio": "16:9",
  "resolution": "1K",
  "num_outputs": 1,
  "duration_seconds": 5,       // video only
  "generate_audio": true,      // video only
  "input_images": [{ "role": "reference", "url": "http://localhost:4317/api/files/…" }],
  "project_id": "default"
}
```

The response is `{ "jobs": [ { "job_id": "…", "status": "queued", … } ] }`.
Poll `GET /api/generate`'s jobs via `GET /api/jobs/:id` until `status` is
`done` (outputs have `local_url`) or `error` (a friendly `error` object).

### To make N images from a brief

1. Ask the user for their brief (e.g. "10 photos of me as a chef in different cities").
2. Expand it into N varied, vivid prompts yourself.
3. Call `POST /api/generate` once per prompt (keep `num_outputs` small, respect
   the batch cap of 20). Fire them and let them stream — the user watches images
   appear live in the gallery.
4. If a job returns `status: "error"`, read `error.friendly.en.body` (or `.he`)
   and tell the user in plain language — the app shows the same friendly card.

### To make a video

Same endpoint with `task: "video"` and a video model
(e.g. `seedance-2-0`, `veo-3-1`). Add `duration_seconds` and `generate_audio`.

### Reference images

To pass the user's own photo, it must be reachable by the server. The simplest
path: have them add it in the app, or serve it at a `http://localhost:4317/...`
URL, then put that URL in `input_images`.

## Handy endpoints

- `GET /api/models` — the model catalog (which keys exist, image vs video).
- `GET /api/providers` — which providers have a key set.
- `GET /api/jobs` — full history, newest first.
- `DELETE /api/jobs/:id` — delete a job and its local file.

## If something breaks

Every failure comes back as a friendly `error` object with a `code`
(`AUTH_MISSING`, `INSUFFICIENT_CREDITS`, `RATE_LIMITED`, …) and ready-made
`friendly.{en,he}` copy. Read it, explain it simply, and help them fix it
(add a key, top up credits, reword a blocked prompt, or switch provider/model).
