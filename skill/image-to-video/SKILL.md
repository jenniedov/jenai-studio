---
name: image-to-video
description: Turn an image into a short video, or animate a still — camera moves, motion, bring a picture to life. Use when someone says "make this move", "animate this", "turn this image into a video", "image to video", or gives a still and asks for motion.
---

# Image → video

Animate a still by using it as the first frame / reference for a video model.

1. Make sure there's a project (`create_project` if needed).
2. Pick a video model (`list_models({type:"video"})`):
   - **`seedance-2-5`** — best all-round motion (and sound).
   - **`veo-3-1`** — cinematic, with sound.
   - **`kling-2-6`** — strong motion control; supports `negative_prompt`, `cfg_scale`.
3. Check options with `get_model_options` — set `duration` (e.g. 4), `aspect_ratio`,
   and `generate_audio` if supported.
4. Generate with the still as the reference:
   `generate_video({ project, model, prompt: "<the motion you want>", input_images: ["<image path/URL>"], options: { duration: 4, aspect_ratio: "16:9" } })`
   - Describe the **motion**, not the scene: "slow push-in, gentle parallax, hair
     moving in the wind, golden-hour light".
5. Estimate cost first (`estimate_cost({ ..., duration })`) — video is priced per
   second × length — and state it. Then generate and report the link.

Notes: video takes longer than images (tens of seconds to minutes) — the tool waits.
No source image? Just omit `input_images` for text-to-video.
