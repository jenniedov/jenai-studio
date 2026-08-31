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
  Code auto-detects it in this repo. For other agents, `npm run connect` wires it,
  or register it manually: `command: node`, `args: [server/mcp/index.js]`.

## Skills = your playbooks
The `skill/` folder holds task playbooks (also readable via the MCP `list_skills` /
`get_skill` tools). Read the relevant one before acting:
- **studio** — the core operating manual (start here for any generation).
- **edit-image** — restyle/modify an existing image.
- **make-a-set** — a coherent set/series/storyboard.
- **image-to-video** — animate a still.
- **add-provider / add-image-model** — extend the catalog (for maintainers).
User-authored skills live in `~/.jenai-studio/skills/` and appear the same way.

## The core loop
1. `create_project({name})` named for what they're building; use it as `project` all session.
2. `list_models({type})` → pick a model; `get_model_options({model})` → see valid options.
3. `estimate_cost(...)` → state the cost in one line (don't block — it's their money).
4. `generate_image` / `generate_video` / `edit_image` (references: local paths or URLs; batches: `count`).
5. Report links; everything lands in the project they're watching.

## Tools (jenai-studio MCP)
`list_models`, `get_model_options`, `estimate_cost`, `list_projects`, `create_project`,
`generate_image`, `generate_video`, `edit_image`, `get_job`, `list_assets`,
`list_skills`, `get_skill`.

Keep every asset in one project. Show results. If a generation errors, the returned
message is usually actionable — adjust or relay it.
