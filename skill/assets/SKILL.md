---
name: assets
description: Use a project's asset library — reusable, tagged reference files (the person's uploads + generations promoted with save_asset). List them, read their tags to pick the right one, pass an asset's URL as a reference, tag what you find, and promote good generations so they can be reused. Use whenever a project has references or you make something worth keeping.
---

# Project assets

Every project has an **asset library**: reusable files with **tags**. Two sources:
- **Uploads** — reference images/videos the person added in the Project tab.
- **Generated** — outputs promoted with `save_asset` (by you or by the person's ★
  button).

Assets are how consistency works across a session: the hero character, the
location, a product shot — save them once, reuse them everywhere.

## The tools (jenai-studio MCP)
- `list_project_assets({project})` → every asset with `name`, `tags`, `type`,
  `source`, `prompt`, and a `url`. **This is your reference shelf.**
- `save_asset({project, job_id?, url?, name?, tags?})` → promote a generation into
  the library so it can be reused. Pass the `job_id` (or result `url`) from a
  generation you just made.
- `tag_asset({asset_id, tags?, name?})` → set the tags/name on an asset. **Tags
  replace** the existing ones — include the ones you want to keep.

## Use them before you generate
1. Call `list_project_assets({project})` at the start of anything that needs
   consistency, and whenever the person says "use the … from before."
2. Read the **tags** and names to find the right reference (e.g. tags
   `["character","hero"]` for the main character).
3. Pass that asset's **`url`** in `input_images` on `generate_image` /
   `generate_video` / `edit_image`. The url is the source of truth for identity —
   reuse the *same* asset every time so the character/location doesn't drift.

## Candidates: presenting, picking, and swapping

**Presenting candidates.** When you generate several options (character sheets,
locations, styles), the results come back **numbered** (1., 2., 3. — the same
order as the inline previews, with a matching `n` in the JSON block). Show them
to the person with those numbers and ask which one they want. When they say "the
second one," map that number to its `job_id`.

**Locking the pick — the `role:` tag.** Promote the chosen candidate with
`save_asset`, and give it a **`role:<name>` tag** that marks it as the ACTIVE
reference for that role, e.g.:

```
save_asset({ project, job_id: <the picked one>,
             name: "hero character sheet",
             tags: ["character", "sheet", "role:hero"] })
```

Rule: **exactly one asset per project carries a given `role:` tag.** From then on,
whenever that role appears in a generation, look up the asset with `role:hero` in
`list_project_assets` and pass its `url` in `input_images`. That's what keeps the
character consistent everywhere.

**Swapping later ("use a different character sheet").** When the person wants to
replace a role's reference:
1. Get (or generate + let them pick) the new sheet, and `save_asset` it.
2. Move the role tag: `tag_asset` **replaces** the tag list, so first read the old
   asset's tags from `list_project_assets`, then re-tag the OLD asset without the
   `role:` tag (keep its other tags — don't delete it, the person may want it
   back), and tag the NEW asset with `role:hero`.
3. Confirm in one line what's now active ("hero is now the red-jacket sheet").
   Future generations automatically follow the tag.

The unused candidates don't need saving — they stay in the project gallery anyway.
Save only what won (or anything the person explicitly wants kept).

## Promote and tag what you make
- When you generate something worth reusing (a locked character, an approved
  location, a good product shot), **`save_asset`** it right away — don't make the
  person hunt for it later.
- **Always tag on save.** Good tags are what you'd search for later:
  `["character","hero","front-view"]`, `["location","laundromat","night"]`,
  `["product","bottle","hero-angle"]`. Add a short `name` too.
- If you find useful but untagged assets (the person just uploaded a few), tag them
  with `tag_asset` so the library stays findable.

## Etiquette
- One library per project — keep references where they belong.
- Don't delete or replace the person's uploads. Deleting/replacing/downloading is
  the person's call in the Project tab; you add and tag.
- This ties into the `creative-director` "consistency references" step: the assets
  library IS where those approved references live.
