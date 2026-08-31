---
name: choosing-an-image-model
description: Pick the right image model in JenAI Studio — default GPT Image 2 for text/design/edits, Nano Banana for believable people and reference edits, Seedream for identity-preserving edits, FLUX for tunable/reproducible output. Use before generating any image.
---

# How to choose an image model

Model keys here are the studio's (`list_models({type:"image"})` is the source of
truth). Same principle as video: unless something specific applies, use the default.

## The default: `gpt-image-2`
Best text and typography (posters, ads, thumbnails, UI mockups, infographics),
strong at editing existing images, and good for product / e-commerce / lifestyle.
Up to 4K.

## Auto-routed by job type
| What you're making | Model | Why |
|---|---|---|
| **Default:** design, text, posters, ads, thumbnails, product/e-comm, editing existing images | **`gpt-image-2`** | best text + design + edit |
| A new believable person / character — UGC creator, influencer, editorial, fashion | **`nano-banana-pro`** or **`nano-banana-2`** | strongest at fresh, believable people |
| Face/identity edits on a real photo (identity stays put) | **`seedream-5-pro`**, **`nano-banana-pro`**, or **`nano-banana-2`** | identity-preserving edits |
| Reproducible or tunable output (seed / guidance / steps) | **`flux-2-pro`** / **`flux-2-flex`** | expose `seed`, `guidance_scale`, `steps` |
| Fast / cheap variations | **`nano-banana-2`** / **`nano-banana-2-lite`** | quick |

## Rules
- **Quality comes from the prompt, not the model** — refine the brief before switching.
- **Sticky choice** — once a model is named, keep it for that work.
- **References** — to guide from an image (subject, style, identity), pass it via
  `input_images` (local path or URL) to `generate_image` / `edit_image`. See the
  `edit-image` and `make-a-set` skills.

> Not in this studio yet (were in the Higgsfield playbook): Midjourney (cinematic
> film-still look). Closest here: `nano-banana-pro` or `seedream-5-pro` with a
> strong cinematic prompt — or add Midjourney with the `add-image-model` skill.
