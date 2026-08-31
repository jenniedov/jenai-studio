---
name: seedance-2-0-guide
description: Seedance 2.0 prompting in JenAI Studio — the prompt playbook is identical to Seedance 2.5; the reason to use 2.0 is true 4K. Covers the capability differences vs 2.5. Read when generating video with seedance-2-0 (usually for 4K).
---

# Seedance 2.0 — prompting guide

`seedance-2-0` is the same family, one generation back. The **entire prompting
playbook is identical to 2.5** — every rule in the `seedance-2-5-guide` skill
carries over unchanged: Simplified-Chinese control prose, first-frame lock,
measurable blocking, FOV-based optics, lighting as a hard constraint, physics, and
the audio section. So the prompt-writing work doesn't change; only the **capability
envelope** does.

## What's different from 2.5
| | `seedance-2-5` | `seedance-2-0` |
|---|---|---|
| **Max resolution** | 1080p | **4K (3840×2160)** |
| **Duration** | (see `get_model_options`) | (see `get_model_options`) |
| **Audio** | native, same pass | native, same pass |
| **References** | more capacity | less capacity |

Use `get_model_options({model:"seedance-2-0"})` for the exact allowed durations and
resolutions — don't hardcode them.

## Practical takeaways
**Only reach for 2.0 to get native 4K.** It's the one model in the stack that truly
renders 3840×2160. For anything at 1080p or below, `seedance-2-5` is the stronger
pick — better prompt adherence and more reference capacity. Hard rule: **never pick
2.0 for 1080p, speed, price, or drafts — only for an explicit 4K request.**

**Submitting for 4K.** Set `options.resolution: "4k"` on `generate_video` with
model `seedance-2-0`. References come in through `input_images` (local paths or
URLs), same as 2.5 — be economical and lean on the single most important reference
per subject.

## Bottom line
Targeting a true 4K deliverable → `seedance-2-0`. Otherwise stick with
`seedance-2-5`. Either way the prompt-quality work is exactly the same.

*(Adapted for JenAI Studio: no Higgsfield `params.mode`/`@Image1` tokens — use the
`generate_video` tool with `options` and `input_images`.)*
