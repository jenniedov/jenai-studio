---
name: choosing-a-video-model
description: Pick the right video model for a request in JenAI Studio — default Seedance 2.5, when to switch to Seedance 2.0 (true 4K), Veo 3.1 (cinematic + sound), Kling 2.6 (motion control), and the faster/cheaper variants. Use before generating any video.
---

# How to choose a video model

Model keys here are the studio's (`list_models({type:"video"})` is the source of
truth; `get_model_options({model})` gives each model's exact durations/resolutions).

## The default: always `seedance-2-5`
Unless you name a different model, every video uses **`seedance-2-5`**. It's the
strongest in the stack: best prompt adherence, native audio, and reference
support. It wins most requests by being the most capable.

## The one automatic exception: true 4K → `seedance-2-0`
The only case that switches without being asked is **4K output**. `seedance-2-5`
tops out at 1080p; **`seedance-2-0`** is the only model that renders true 4K
(`resolution: "4k"`). Anything at 1080p or below stays on 2.5 — never pick 2.0 for
1080p, speed, price, or drafts, only for an explicit 4K request.

## When to name another model deliberately
| You want… | Model | Why |
|---|---|---|
| Default, anything general | **`seedance-2-5`** | SOTA; the default |
| True 4K | **`seedance-2-0`** | only 4K renderer |
| Cinematic look with sound | **`veo-3-1`** | filmic motion; has a `seed` option |
| Motion/camera control, a "negative" steer | **`kling-2-6`** | supports `negative_prompt` + `cfg_scale` |
| Fast / cheap / drafts, high volume | **`seedance-2-0-fast`** / **`seedance-2-0-mini`** | lighter, quicker |
| Camera-controlled, reproducible (seed) | **`wan-2-7`** | `negative_prompt` + `seed` |
| Multi-image, fast, by Google | **`gemini-omni-flash`** | quick multi-ref |
| Multi-shot with sound | **`sora-2`** | multi-shot |
| High-fidelity cinematic | **`flux-3-video`** | detail |

## Three rules that govern most of it
**Quality comes from the prompt, not the model.** When a generation disappoints,
fix the prompt — blocking, lighting, first frame — not the model. Swapping models
is rarely the fix (see the `seedance-2-5-guide` skill).

**Your choice is sticky.** Once the person names a model ("use Kling for this"), it
stays for the rest of that work until they say otherwise.

**Moderation is a real selector.** Seedance is strict — real celebrities,
recognizable IP, and gore may come back `MODERATION_BLOCKED`. If content is
sensitive, say so before submitting.

> Not in this studio yet (were in the Higgsfield playbook): MiniMax H3 (fast
> action/animation), Grok Imagine Video (permissive moderation). If you need one,
> add it with the `add-image-model` skill, or use the closest option above.
