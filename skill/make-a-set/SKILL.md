---
name: make-a-set
description: Generate a coherent SET or series of images — a product line, a storyboard, style variations, a carousel, an icon set — into one project with a consistent look. Use when someone asks for "a set of", "N variations", "a series", "a storyboard", "options for", or several related images at once.
---

# Make a set / series

Two shapes — pick by whether the images share one prompt or differ.

## Same idea, N variations (fastest)
One call: `generate_image({ project, model, prompt, count: N, options })`. The
studio makes N and drops them in the project. Good for "give me 6 options of X".

## A series with different prompts (storyboard, product line, icon set)
1. Create/confirm the project (`create_project`), named for the series.
2. Lock a **consistent look** so the set feels like one family:
   - Same model, same `aspect_ratio`/`resolution`.
   - A shared style clause repeated in every prompt (e.g. "flat pastel vector,
     soft shadows, centered") plus the per-item subject.
   - For character/subject consistency, pass the same reference `input_images` on
     each call (or the first result as the reference for the rest).
   - If the model supports `seed` (FLUX), reuse a seed for repeatability.
3. Generate each item: loop `generate_image({ project, model, prompt: sharedLook +
   item, options })` for each subject. Keep `count: 1` per call for a series.
4. Estimate the total first (`estimate_cost` × items) and state it once.
5. Report the set as a group; they're all in the project to browse together.

Keep the whole set in **one project** so it reads as a collection.
