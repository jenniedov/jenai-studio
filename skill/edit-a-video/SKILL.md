---
name: edit-a-video
description: Change ONE element in an existing video while preserving everything else (subjects, motion, camera, timing, audio) — the PRESERVE / CHANGE prompt structure for a clean single-edit. Use when someone wants to add/remove/replace/modify one thing in a clip they already have.
---

# How to edit a video

A clean video edit re-renders a clip with **one** requested change applied and
everything else preserved.

## What it does (and doesn't)
- Takes **one source video** plus a text prompt, and applies **one** edit: add,
  remove, replace, or modify a single element.
- **Preserves** the subjects, motion, camera, timing, and audio from the source.
- **One edit per run** — multiple changes at once garble the result.

## The prompt: PRESERVE + CHANGE
Build the edit prompt from two parts (keep it under ~4,000 chars):
1. **PRESERVE** — the exact current state (subject, camera, lighting, audio),
   written as a confident *positive* description. This is what stops the model from
   reshooting the whole scene.
2. **ADD / REMOVE / REPLACE / MODIFY** — your one change, with timing written as
   **beats, not timestamps** (e.g. *"the can appears on the table the moment she sets
   down the mug"* — never `0:00–0:02`).

Ideally derive both parts from a **video analysis** of the source (watch the clip,
describe the untouched parts as confidently as the changed part).

## Settings for the submit
- **prompt** — the compiled PRESERVE + CHANGE text.
- **duration** — the source's real duration (the output matches the source, so don't
  fight it).
- **aspect_ratio** — the source ratio (or `auto`).
- **resolution** — `1080p`.
- **generate_audio** — on, so the preserved soundtrack carries through.
- **source video** — passed via `input_images`.
- **reference image** *(optional)* — include only when the inserted/replaced thing
  has a specific look (*"replace the red car with the car in this photo"*). Without
  one, the model invents the element from the prompt.

## Rules for a clean edit
- Describe the untouched parts as confidently as the change.
- Timing as beats, not timestamps.
- If it comes back wrong, **fix the prompt, don't switch models** — re-run once,
  then simplify the change, then re-analyze.

> Studio note: JenAI Studio does not have a dedicated **video-to-video edit** tool
> yet — the MCP's `edit_image` covers *image* edits, and `generate_video` takes
> references but doesn't re-render a source clip with one change. Use this skill's
> PRESERVE/CHANGE structure once a video-edit-capable model is wired (see
> `add-image-model`). For now, image editing follows the same PRESERVE/CHANGE idea
> via `edit_image`.
