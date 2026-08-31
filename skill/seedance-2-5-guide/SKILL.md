---
name: seedance-2-5-guide
description: How to write strong Seedance 2.5 video prompts in JenAI Studio — the prompt structure, Simplified-Chinese control prose, first-frame lock, FOV-based optics, lighting as a hard constraint, physics, audio, and references. Read before generating video with seedance-2-5.
---

# Seedance 2.5 — prompting guide

Your working reference for generating video (with sound) on **`seedance-2-5`**.
Read once, keep open while you build.

## 1. Model + fields
Use `seedance-2-5` as the default for everything — strongest adherence, generates
audio in the same pass, accepts image/video references. Set the options with the
studio's option bag (call `get_model_options({model:"seedance-2-5"})` for the exact
allowed values):
- **duration** — seconds (the schema lists the choices).
- **resolution** — up to 1080p on 2.5 (for true 4K, switch to `seedance-2-0`).
- **aspect_ratio** — 16:9 default; also 9:16, 1:1, 4:3, 21:9, 3:4.
- **generate_audio** — `true` for dialogue/SFX/music; off for silence.
Pass these as `options` to `generate_video`.

## 2. The prompt structure that works
Don't write a wall of prose. Break the prompt into **addressed sections**, one job each:

| Section (Chinese label) | What goes in it |
|---|---|
| 场景背景 scene context | 1–2 sentences, **this shot only**. No scene numbers, no carryover. |
| 首帧 first frame | Subjects already in position. Never open on an empty establishing frame. |
| 空间调度 blocking | Measurable positions — not "near" or "around". |
| 光学 optics | Field of view in degrees + camera distance. No mm, f-stops, or lens brands. |
| 摄影机 camera | What the operator physically does: height, which side, movement. |
| 动作顺序 action timing | Beats in order. Never timestamps. |
| 物理 physics | Weight, ground contact, cause and effect. |
| 灯光 lighting | Source + direction + which side of the light the camera sits on. A lock, not decoration. |
| 音频 audio | Ambient sound, or the exact scripted line. |

## 3. The four rules that separate "works" from "doesn't"
**Write control text in Simplified Chinese.** It steers the generation most
reliably. Keep quoted dialogue / on-screen text in its real language. English works
too, but Chinese control text is stronger.

**Lock the first frame first.** The most common failure is the model opening on an
establishing shot and letting the character drift in late. Say it outright: *the
first visible frame already contains every character, in position.*

**Treat lighting as a hard constraint.** Define the key source, its direction, and
which side of the light the camera is on. Backlit / contre-jour usually beats flat
frontal light — but only where it belongs; don't crush an intimate scene to silhouette.

**Block physically, not vaguely.** "Within 1 meter of the tree, boots inside the
root circle" beats "by the tree". Keep gaze separate from body: "torso faces camera,
eyes locked on X."

## 4. Describe lenses as FOV degrees, not hardware
Seedance responds to the observable result. Give diagonal FOV + distance:
- **47°** standard/normal, 3–5m — human-eye, natural.
- **84°** classic wide, 1–1.5m — immersive, spreads fg/bg.
- **29°** short tele / portrait, 4–6m — sharp subject, creamy bokeh.
- **18°** classic tele, 6–8m — compression, isolated subject.
- **8°** super-tele, 20–25m — surveillance feel; pair with foreground occlusion.

## 5. References and continuity
To drive from a reference image, pass it via **`input_images`** (a local path or a
URL — the studio uploads local files for you) to `generate_video`. The reference is
the source of truth for identity — don't paint over it with prose; add only detail
the action needs (hand state, props, wounds). For the same character across clips,
reuse the **same reference image** every time, or the identity drifts.

## 6. Realistic expectations
Seedance moderates strictly (NSFW / IP) — a real celebrity or copyrighted character
may come back `MODERATION_BLOCKED`. Motion realism comes from describing **cause and
effect** (heel contact, weight transfer, cloth lag), not from asking for "smooth
motion."

*(Adapted for JenAI Studio: references go through `input_images` instead of a
Higgsfield upload/`omni_reference`; exact durations/resolutions come from
`get_model_options`.)*
