---
name: studio
description: How to run JenAI Studio as a creative agent — turn a person's brief ("make me 10 launch images", "a 4-second clip of this", "restyle this photo") into generated images/videos saved into a project they watch fill up live. Use this whenever someone asks you to generate, create, edit, or make images or videos with JenAI Studio.
---

# Running JenAI Studio as an agent

You generate images and videos for a person through the **jenai-studio MCP tools**.
Everything you make goes into a **project** (a named folder) they watch populate
live in the JenAI Studio browser tab. Be concrete, show results, keep it in one project.

> **Clear request vs. "help me figure it out."** This skill is the generate loop for
> a **concrete** brief ("three images of a cat", "a 5s clip of waves", "restyle this
> photo") — just do it, don't interview. If instead the person is **vague or unsure**
> ("I want to make a video but no idea what", "something for my launch"), start with
> the **`creative-director`** skill: it reads intent, runs a light interview only
> when needed, proposes a concept, and produces it in gated stages — then comes back
> here to actually generate.

## Setup (once per session)
1. You don't need to start anything — the MCP launches the studio for you on your
   first tool call (the very first request may take ~15s while it boots).
2. **Create a project named the way the person would say it** — `create_project({name})`,
   short and natural, **in their language** (a Hebrew speaker gets "פאודה" or
   "נרות סתיו", not "Night Protocol — Powder Thriller"). It's their folder label,
   not a marketing title. Use that exact name as `project` for **every** generation
   this session, so all the output lands together.

## The loop for any generation
1. **Pick a model.** Call `list_models({type})` (image or video). Choose by the
   brief (see "Choosing a model"). Call `get_model_options({model})` to see exactly
   what it accepts (aspect ratios, resolutions, and custom options like seed).
2. **Build the options bag** from that schema — e.g. `{ aspect_ratio: "16:9",
   resolution: "2K" }`. Only use values the schema lists.
3. **Estimate and state the cost** — `estimate_cost({model, provider, resolution,
   count})` (or `duration` for video). Say it in one line ("~$0.20 for 2 images").
   Do **not** block on it — it's their money; just be transparent.
4. **Generate** — `generate_image` / `generate_video`. For several images, pass
   `count` (1–20). Omit `provider` to auto-pick, or set `kie` / `oxen` / `openrouter`.
5. **Wait by polling, never by blocking.** Generation is **asynchronous**: the
   generate tool submits the job(s) and returns quickly — sometimes with the
   finished images, often with **job ids that are still running** (this is normal,
   especially for video, which can take up to ~15 minutes, and for heavy 2K/large
   batches). When you get back "still generating" + job ids:
   - **Do NOT resubmit** — that spends money twice. The studio is already working.
   - Call **`check_jobs({ job_ids: [...] })`** to see the current status without
     waiting. Repeat every ~30–60s (a bit longer for video) until they're done.
   - The person also watches them appear live in the JenAI Studio browser tab.
6. **Report** — once done, the results carry links + previews. Say what you made and
   that it's in the "<project>" project in their browser.

## Choosing a model (rules of thumb)
- **General images / characters / references:** `nano-banana-pro` (flagship) or `nano-banana-2` (fast).
- **Text in the image / crisp typography:** `gpt-image-2`.
- **Reproducible or tunable images (seed/guidance/steps):** `flux-2-pro` / `flux-2-flex`.
- **Video, default:** `seedance-2-5` (best) or `seedance-2-0`; **cinematic + sound:** `veo-3-1`; **motion control:** `kling-2-6`.
- When unsure, call `list_models` and pick by `tag` ("top"/"new") and `blurb`.

## Providers
- Omit `provider` and the studio picks a sensible one. If they care about cost,
  compare with `estimate_cost` across providers and pick the cheapest that serves it.
- `openrouter` serves the Gemini/GPT image families; `oxen` serves the most models;
  `kie` is async. Video runs on `oxen`/`kie` (not `openrouter`).

## References & editing
- To use images as references (style, subject, character), pass `input_images`
  (local paths, `/api/files/...` URLs, or public URLs).
- **Project assets:** each project has a reusable, tagged reference library
  (`list_project_assets` / `save_asset` / `tag_asset`). Check it for existing
  references, use an asset's `url` as an `input_image`, and promote+tag good
  outputs for reuse. See the `assets` skill.
- To restyle/modify one image, use the `edit-image` skill (`edit_image` tool).

## Sets & series
- For "N images", prefer one `generate_image` call with `count: N`. For a series
  with *different* prompts (a storyboard, variations), see the `make-a-set` skill.

## Etiquette
- Keep everything in the current project; don't scatter across projects.
- Show the person what you made (links/previews) and where to see it.
- If a generation errors, read the returned message — it's usually actionable
  (wrong option value, out of credits, a provider setting) — and adjust or say so.
- **If the connection drops mid-generation** (result says "lost contact", or the
  tool call fails after you submitted): the job very likely **kept running and
  finished** in the studio. NEVER regenerate blindly — that spends their money
  twice. First check `get_job` with the job_id (it's in the result), or
  `list_assets({project})` to see what actually landed; only regenerate what is
  truly missing.
