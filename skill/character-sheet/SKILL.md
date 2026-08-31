---
name: character-sheet
description: Generate a three-panel character reference sheet in the studio's house style — left panel headless (garment on an invisible body), center rear view with head, right chest-up close-up, on a flat 18% neutral-gray field with completely shadowless relighting. Use whenever someone asks for a character sheet, a character reference, a turnaround, or a model sheet.
---

# Character reference sheet

A character sheet in this studio is **one horizontal image, three equal vertical
panels** of the *same figure in the same outfit*, on a flat gray field with flat
shadowless light. It's a clean, consistent reference you can reuse to keep a
character identical across later generations — so **save it as an asset** with a
`role:` tag afterwards (see the `assets` skill).

## The format (always these three panels)
- **LEFT — full-body FRONT, headless.** The body squared to camera from the
  shoulders down, arms relaxed, weight even. **No head, no neck, no hair** —
  nothing rises above the shoulder line. The garment reads as worn by an
  **invisible body**: full 3D shape and natural drape, the collar/hood holding its
  form, the neckline an **empty dark hollow** looking into the inside of the
  garment. **No stump, no cut edge, no skin, no anatomy** at the neck. Keep full
  headroom — empty gray above the shoulders — so the figure sits at the same scale
  and position as a normal full-body portrait.
- **CENTER — full-body REAR, head attached.** The same figure from directly
  behind, standing straight, head to shoes. Hair and the back of the outfit read.
- **RIGHT — chest-up PORTRAIT close-up.** The same figure from just above the head
  down to the collarbones, face filling most of the panel, level head, cool relaxed
  neutral expression, lips together.

## The house style — non-negotiable (paste this block verbatim into the prompt)
These rules are what make it a *reference sheet* and not a photo. Keep them exactly;
only fill the SUBJECT below.

> A three-panel character reference sheet composed as one horizontal frame, divided
> into three equal vertical panels side by side with a thin clean separation between
> panels, the same figure and the same outfit rendered identically across all three.
>
> The background is a single flat 18% neutral gray field applied uniformly across all
> three panels — one identical value at every pixel in every panel, corner to corner,
> with no seam line, no gradient, no hotspot, no vignette, and no falloff. It is a flat
> color field, not a photographed backdrop — no surface, no floor, no wall, no corner,
> no horizon, and no plane the figure stands on or in front of.
>
> Relight from scratch, overriding any reference lighting: completely flat shadowless
> illumination in every panel — one enormous soft frontal source at camera position
> with matched equal fill from left, right, above and below, so both sides of the face
> and body read at exactly the same brightness. No key-and-fill ratio, no modelling, no
> shadow side, no cheek triangle, no nose shadow, no under-chin shadow, no rim light, no
> hair light, no kicker. Extremely low contrast, even, milky, catalogue-flat, identical
> in all three panels. Form is described by bone structure, fabric folds and garment
> structure alone, not by light and shadow.
>
> Absolutely zero shadow anywhere outside the subject in any panel: no cast shadow, no
> contact shadow beneath the shoes, no floor shadow, no drop shadow, no ambient
> occlusion where the body meets the background, no halo, no edge darkening, no rim
> separating the figure from the field. Shading exists only on the subject and stops
> cleanly at the silhouette. Absolutely zero light bleed outside the subject — no spill,
> no glow, no bounce, no reflected color cast thrown onto the background.
>
> Skin reads matte and velvety with only a light natural dewy sheen on the high points —
> real fine pore texture, subsurface scattering, never plastic, never doll-skin. Skin
> renders at its true tone, identical in value and hue across the face, shoulders, arms
> and midriff in every panel — never darkened in the rear panel, never washed-out or
> cool-shifted by the background. Never harsh: no acne, no blemishes.
>
> Even sharpness edge to edge across every panel. No depth-of-field falloff, no bokeh, no
> background blur, no lens vignette, no lens distortion, no flare, no bloom, no chromatic
> aberration, no film grain, no atmospheric haze.
>
> LEFT PANEL — full body front view, no head, no neck, no hair. Nothing rises above the
> shoulder line; no hair falls onto the chest or shoulders. The hood/collar holds its own
> 3D shape and the neckline reads as an empty dark hollow into the inside of the garment.
> The garment reads as worn by an invisible body — full shape, natural drape, real fabric
> tension — but nothing emerging from the neckline. No stump, no skin, no cut edge, no
> anatomy, no blood, no blur, no transparency in the body. Full headroom, generous empty
> flat gray above the shoulders, figure at normal full-body scale and position.
>
> CENTER PANEL — full body rear view, head attached, from the top of the head to the shoes.
>
> RIGHT PANEL — tight chest-up portrait, face filling most of the panel, level head, cool
> relaxed neutral expression, lips together.

## SUBJECT — fill this per character (identity, outfit, hair, makeup, accessories, tattoos)
Write the subject once, in concrete physical detail, and keep it **identical** for
every future sheet/clip of this character. Cover:
- **Build & skin:** body line, proportions, skin tone + undertone + finish.
- **Face:** bone structure, nose, brows, lips, chin (this is the identity — be precise).
- **Hair:** part, texture, length, how it falls (remember: absent in the left panel).
- **Makeup:** keep it a consistent named look.
- **Outfit:** every garment, its fit, fabric, any print (describe faded/worn exactly).
- **Accessories:** eyewear, jewelry, shoes, hardware.
- **Tattoos / marks:** each one's exact placement and size, so they land the same
  spot in every panel where that skin shows.

## How to generate it
1. **Model:** a strong, prompt-faithful image model — `nano-banana-pro` (best for
   believable people + identity) or `gpt-image-2`. Check `choosing-an-image-model`.
2. **Identity reference:** if the person gave a face photo, pass it via
   `input_images` so the face in the center/right panels matches. (The left panel is
   headless, so identity lives in the other two.)
3. **Aspect ratio:** wide/horizontal — the frame holds three panels. Use `16:9`
   (or wider like `21:9` if the model offers it) and the highest resolution
   available (`get_model_options`).
4. **Prompt = the house-style block above + the SUBJECT block.** Don't drop the
   shadowless / flat-gray / headless-left language — that's what makes it a sheet.
5. **After it's approved:** `save_asset` it into the project with a `role:` tag
   (e.g. `["character","sheet","role:hero"]`) so every later generation reuses the
   exact same reference. Swapping the character later = move the `role:` tag (see
   the `assets` skill).

## Common failures to head off
- A head/neck/stump creeping into the LEFT panel → restate "no head, no neck, no
  hair; neckline is an empty dark hollow; garment on an invisible body."
- A cast/contact shadow on the floor, or a vignette → restate the "zero shadow
  outside the subject / flat 18% gray, no falloff" lines.
- Skin darker in the rear panel → restate "skin identical in value across all panels,
  never darkened in the rear panel."
