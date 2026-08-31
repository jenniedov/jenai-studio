---
name: multi-camera-video
description: Turn one continuous take into a multi-camera sequence — many different angles of the SAME performance, without changing the performance or audio. A ready-to-fill prompt template. Use when someone wants "multiple angles", "multi-cam", or a cut sequence from a single clip.
---

# Multi-camera video — many angles from one take

Use this to turn a single continuous take into a multi-camera sequence: many angles
of the *same* performance, without changing the performance or the audio. Fill in
the bracketed fields, and supply the original video plus a reference image of the
environment via `input_images`.

## The prompt
> **Universal multi-camera generation**
>
> Treat the ORIGINAL VIDEO as the absolute ground truth for the performance and
> audio. Preserve the original audio track unchanged — do not synthesize, recreate,
> redub, replace, enhance or reinterpret voices, dialogue or sound. No music.
>
> Preserve every subject's identity, face, body, hairstyle, clothing and
> accessories, and preserve their exact performance frame-for-frame: body movement,
> gestures, posture, expressions, mouth movement, lip sync, eyelines, interactions,
> object handling and timing. Do not invent, recreate or reinterpret any movement.
> Every new viewpoint is simply another physical camera observing the same original
> performance at the same moment.
>
> Use the REFERENCE IMAGE as the absolute visual reference for the environment, set
> design, lighting, materials, color, mood and overall look. Reconstruct the
> subjects naturally inside that space with correct perspective, scale,
> environmental relighting, contact shadows and reflections. Keep the image
> realistic, raw and slightly imperfect rather than glossy or cinematic.
>
> [Optional scene context: EMOTIONAL / STORY CONTEXT. Use it only to understand the
> existing performance; do not invent new actions.]
>
> Turn the continuous performance into a multi-camera sequence. Cut to a
> substantially different camera setup approximately every 1.5–2 seconds, as if many
> cameras around the same set captured the exact same performance simultaneously.
> Mix medium shots, close-ups, extreme close-ups, over-the-shoulder views, profiles,
> detail shots, low and high angles, partially obstructed foreground views, unusual
> off-center compositions, full-body views and occasional very wide environmental
> shots. Vary lens distance aggressively so some shots feel intimate and others
> reveal the scale of the location.
>
> Make roughly half the setups static and give the others short, creative camera
> motion: subtle orbiting, curved lateral movement, push-ins, pullbacks, crane rises
> or drops, slight rolls, foreground reveals and parallax moves. Keep the movement
> physically believable and varied. Use real cuts between camera positions rather
> than teleporting one continuous camera.
>
> Camera changes must NEVER create a new performance. Across every cut, preserve the
> source video's exact temporal continuity, original audio and frame-accurate
> actions. Only the environment, environmental lighting, camera position, framing,
> lens perspective and camera movement may change.
>
> [Optional pacing: CHANGE CAMERA EVERY ___ SECONDS.]

## How to use it
- **Fill the bracketed fields** — scene context (read-only guidance, never a license
  to add action) and optional pacing (override the 1.5–2s rhythm).
- **Supply** the original video (ground-truth performance + audio) and a reference
  image (ground-truth environment) via `input_images` on `generate_video`.
- **Core idea:** every new angle is *another physical camera* watching the *same*
  moment — performance, timing, and audio are locked; only camera position, framing,
  lens, movement, and environmental lighting may change.

> Studio note: this needs a video model that accepts a **source video** as a
> reference. If the model you pick only takes image references, it can't do a true
> multi-cam recut yet — pick a reference-to-video model, or add one with
> `add-image-model`.
