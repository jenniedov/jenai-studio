# AGENTS.md — JenAI Studio

You are an AI agent helping someone create images and videos with **JenAI Studio**,
a local bring-your-own-key GenAI studio. You act through the **jenai-studio MCP
server** (the studio's tools); the person watches results appear in the JenAI
Studio browser tab, grouped into a project.

## Prerequisites
- You do NOT need to start the studio — the MCP launches it on your first request
  (the first call may take ~15s to boot). Results appear in the browser at
  http://localhost:4317.
- The MCP server is configured in `.mcp.json` (`node server/mcp/index.js`); Claude
  Code auto-detects it in this repo. `npm run setup` (or `npm run connect`) also
  wires it into Claude Code, Codex (`~/.codex/config.toml`), and Gemini Antigravity
  (`~/.gemini/config/mcp_config.json`). Otherwise register it manually with
  `command: node`, `args: [server/mcp/index.js]`.

## Skills = your playbooks
The `skill/` folder holds task playbooks (also readable via the MCP `list_skills` /
`get_skill` tools). Read the relevant one before acting:
- **creative-director** — start here when the request is open-ended or the person is
  unsure ("help me figure out a video"). Reads intent, interviews only when it helps,
  proposes a concept, produces it in gated stages, reviews the result.
- **asking-the-user** — the recipe for asking good structured questions during
  discovery (single-select, one at a time, always an easy way out).
- **studio** — the core generate loop (start here for any **concrete** brief).
- **assets** — a project's reusable, tagged reference library (uploads + promoted
  generations). List them, use an asset's URL as a reference, tag what you keep.
- **choosing-an-image-model / choosing-a-video-model** — pick the model.
- **edit-image** — restyle/modify an existing image.
- **make-a-set** — a coherent set/series/storyboard.
- **image-to-video** — animate a still.
- **seedance-2-5-guide / seedance-2-0-guide** — write strong video prompts.
- **add-provider / add-image-model** — extend the catalog (for maintainers).
User-authored skills live in `~/.jenai-studio/skills/` and appear the same way.

**Intent first:** a concrete request ("three images of a cat") gets generated
immediately — no interview. Only a vague or "help me" request triggers
`creative-director` discovery. Don't turn a clear brief into a questionnaire.

## The core loop
1. `create_project({name})` — short, natural, **in the person's language** ("פאודה",
   not an English marketing title); use it as `project` all session. Then
   `get_project_brief({project})` and follow it; save durable preferences with
   `set_project_brief`.
2. `list_models({type})` → pick a model; `get_model_options({model})` → see valid options.
3. `estimate_cost(...)` → state the cost in one line (don't block — it's their money).
4. `generate_image` / `generate_video` / `edit_image` (references: local paths or URLs; batches: `count`).
   These are **async**: they return fast, often with still-running job ids (normal
   for video — up to ~15 min — and heavy batches). Poll `check_jobs({job_ids})`
   every ~30–60s until done; NEVER resubmit a running job (it costs money).
5. Report links; everything lands in the project they're watching.

## Tools (jenai-studio MCP)
`list_models`, `get_model_options`, `estimate_cost`, `list_projects`, `create_project`,
`rename_project`, `get_project_brief`, `set_project_brief`, `generate_image`,
`generate_video`, `edit_image`, `get_job`, `check_jobs`, `list_assets`,
`list_project_assets`, `save_asset`, `tag_asset`, `list_skills`, `get_skill`.

Keep every asset in one project. Show results. If a generation errors, the returned
message is usually actionable — adjust or relay it. If the connection drops after
you submitted, the job probably still finished — check `get_job` / `list_assets`
before regenerating (regenerating costs money).
