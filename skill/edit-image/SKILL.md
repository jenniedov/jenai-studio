---
name: edit-image
description: Edit, restyle, or modify an existing image with JenAI Studio — add/remove elements, change style, make a sticker, change background, apply a look — by using the image as a reference. Use when someone says "edit this", "make this a sticker", "change the background", "turn this into <style>", or gives an image and asks to modify it.
---

# Edit an image

Editing = reference-to-image: the source image guides the generation, the prompt
says what to change.

1. Make sure there's a project (`create_project` if needed) — the edit lands there.
2. Pick a model good at edits/references: **`nano-banana-pro`** or **`nano-banana-2`**
   (strong reference following), or `gpt-image-2` when text must stay crisp.
3. Call **`edit_image`**:
   `edit_image({ project, model, image: "<path or URL>", prompt: "<the change>", options })`
   - `image` can be a local file path, an `/api/files/...` URL, or a public URL.
   - Keep the prompt about the *change* ("make it a die-cut sticker with a white
     border", "replace the background with a sunset", "same character, winter coat").
   - Set `options` (e.g. `aspect_ratio`) only if you want to override; otherwise the
     result tends to follow the source.
4. Report the result link and that it's in the project. For several variations of
   the same edit, call `edit_image` a few times or use `make-a-set`.

Tips: to preserve identity/character across edits, reuse the same source image as
the reference each time. To combine multiple references (subject + style), pass them
via `generate_image({ input_images: [...] })` instead.
