# PRD — JenAI Studio Agent ("Studio Copilot")

Status: draft v1 · Owner: Jennie · Last updated: 2026-08-30

## 1. Summary

Turn JenAI Studio from a manual generate-images-yourself app into an
**agent-driven creative studio**: the user talks to an AI agent ("make me ten
product shots", "turn this into a 4-second clip"), and the agent reads the
relevant skills, picks models, and generates the images/videos into a **project**
they watch fill up live.

The decisive constraint: it must work with **whatever agent the user already
runs** — Claude Code, Codex, Gemini Antigravity — using **their own subscription
as the LLM** (no per-token cost to us or them). Antigravity is an IDE, not a CLI,
so we cannot wrap agents in our own chat backend. Therefore the architecture is:

> **External agent (theirs) + a shared tool layer (our MCP) + a shared playbook
> (skills) + our web UI as the live project workspace/viewer.**

We do **not** build a chat backend that wraps each CLI. The agent runs in its
native home; our app is the hands (MCP), the manual (skills), and the eyes (web).

## 2. Goals / Non-goals

**Goals**
- One MCP server any MCP-capable agent can use to generate images/videos into a project.
- A skills layer the agent reads for judgment (model choice, editing, house style), browsable and extendable in the UI.
- A web Projects workspace that shows a project's images **and** videos together, live-updating as the agent works, with the existing lightbox behavior.
- Each agent session = one auto-named project; all of that session's output lands there.
- A one-click Update that safely pulls new skills/models/code (Hermes-style).
- Works across Claude Code, Codex, and Antigravity via MCP + portable skills.

**Non-goals (for v1)**
- An in-app chat window that embeds/streams the agent. (Optional later, Claude/Codex only — never Antigravity.)
- Wrapping or re-implementing any agent CLI.
- Hosting/multi-tenant/cloud. This is local, single-user, BYO-key, BYO-LLM.
- A hard cost-gate on generation. Cost is shown, never blocked (user's money, user's call).

## 3. Users & scenarios

- **Workshop student (primary):** already has Claude Code / Codex / Antigravity + a subscription. Installs the repo, adds provider API keys, opens their agent in the repo, says "use these skills — make me a set of 10 launch images," and watches them appear in a project in the browser.
- **Jennie (power user):** builds/curates skills, adds providers/models, ships updates students pull.

## 4. Architecture

```
Their agent (Claude Code / Codex / Antigravity)     ← the brain, their subscription
   │  MCP tools + reads the playbook (skills)
   ▼
JenAI MCP server  ── generate_image / generate_video / edit_image
   │                 list_models / get_model_options / estimate_cost
   │                 create_project / list_projects / bind_session
   │                 list_skills / get_skill
   ▼
Existing engine + adapters (Oxen / OpenRouter / Kie) → providers
   ▲
Web UI (Projects workspace, Skills browser, Update)  ← the eyes, live-updating
```

- **Brain:** the user's own agent. Swappable, no lock-in (Hermes principle).
- **Hands:** the MCP server, wrapping today's `/api/generate` + option schema.
- **Manual:** skills (built-in + user-saved), exposed both to the agent (via MCP `list_skills`/`get_skill` and on-disk files) and to the user (web browser).
- **Eyes/memory:** the web app — projects, assets, live view. Jobs already carry `project_id`.

## 5. Components

### 5.1 MCP generation server

A thin MCP server (same Node process or a sibling) exposing typed tools. It calls
the existing internal API — no new generation logic.

Tools (initial set):
- `list_models(type?)` → models + their `optionSchema` (so the agent knows exactly what each model accepts).
- `get_model_options(model)` → the option schema for one model.
- `estimate_cost(model, provider, options, count)` → uses the jenai.house feed.
- `create_project(name)` / `list_projects()` / `rename_project(from, to)` → project management.
- `get_project_brief(project)` / `set_project_brief(project, brief)` → the project's
  durable notes (brand, style, characters) — the studio's portable per-project memory.
- `generate_image(project, model, provider?, prompt, options?, input_images?, count?)`
- `generate_video(project, model, provider?, prompt, options?, input_images?)`
- `edit_image(project, image, prompt, options?)` — reference-to-image edit.
- **Async by default:** `generate_*` submit and return quickly; if not finished within
  a short budget they hand back job ids (video always does — up to ~15 min). The agent
  polls `check_jobs(job_ids)` (immediate, no wait) until done — never resubmits. The
  studio keeps processing in the background regardless.
- `get_job(job_id)` / `check_jobs(job_ids)` / `list_assets(project)` → status + results.
- `list_project_assets(project)` / `save_asset(project, job_id|url, name?, tags?)` /
  `tag_asset(asset_id, tags?, name?)` → the reusable, tagged reference library (§assets).
- `list_skills()` / `get_skill(name)` → what the agent can do + how (§5.2, §10).

**Returning results so the agent can show them:** each `generate_*` result returns
structured content — the asset's local URL/path, model, provider, cost — AND, for
images, an MCP image content block so clients that render inline (Claude Code,
desktop Claude) can display the result in-conversation. Codex/Antigravity behavior
varies; regardless, the **canonical rich view is the live web project**. So the
answer to "can the agent show the images?" is: yes, references always, inline
preview where the client supports it, full gallery always in the web project.

Provider/model selection stays the agent's choice, informed by `list_models` +
skills; `provider` is optional (server resolves a sensible default, as today).

### 5.2 Playbook / skills (the judgment layer)

Skills tell the agent *how to think*: which model for which brief, how to edit,
when to make a set vs. one, house style, always call `estimate_cost` and state
the cost. Two delivery formats for portability:
- **Claude Code:** `SKILL.md` files (already our format).
- **Codex / others:** the same content mirrored into `AGENTS.md` the agent auto-reads.
- **Evaluate the [agentskills.io](https://agentskills.io) open standard** (Hermes uses it) as a single portable format we author once and adapt — reduces the dual-maintenance cost.

Built-in skills to ship: "generate into a project", "edit an image", "make a set",
"turn image into video", plus the existing add-provider / add-image-model.

### 5.3 Web UI

**a) Projects workspace (upgrade the current Projects tab).**
Today clicking a project jumps to the Images tab. Instead, a project opens its
**own view showing images AND videos together** (one grid or image/video
sections), live-updating via the existing job polling, with the current lightbox
behavior (prompt, references, actions) on click. Reuses `MediaGrid` + `Lightbox`;
adds a combined project header (name, counts, the session it belongs to).

**b) Skills browser (new tab).**
A simple, scrollable list of every skill the agent has — name, one-line
description, and the full instructions on click ("how to edit an image", etc.).
Backed by the same `list_skills` the MCP exposes, so the UI and the agent always
see the identical set. **Users can save their own skills** here (create/edit/
delete), stored under the user data dir and picked up by the agent.

**c) Update button (top of app).** See §5.5.

### 5.4 Project ↔ session model

- Each agent session = **one project**, **auto-named by intent** (the agent calls
  `create_project` with a name derived from what the user is building, e.g.
  "Autumn candle launch").
- The session binds to that project (`bind_session`); every `generate_*` call in
  that session defaults to that `project_id`, so all output lands in one place.
- The project stores its label + the agent session id, so re-opening a project
  can resume the matching agent session (Claude `--resume`; others as supported).
- The user watches assets populate that project in the web tab in real time.

### 5.5 Update mechanism (Hermes-inspired)

From Hermes: a managed install that **updates without disrupting active sessions**,
clean git-checkout layout, single `update` command. Our Update button does:
1. Check remote — show current vs. latest + a short changelog; only enable when behind.
2. **Fast-forward-only** pull (never auto-merge onto a dirty tree; if not FF, stash or warn — students can't resolve conflicts).
3. `npm ci` only if the lockfile changed.
4. `npm run build`.
5. Graceful restart of the server (finish in-flight jobs; models.json + code load at startup).
6. **Rollback**: keep the previous commit; one click to `git reset` back if the update fails.
Refreshes skills, models (e.g. "Seedance 3" appears), MCP tools, and app code together.
(Reference to study during build: nousresearch/hermes-agent `hermes update`.)

## 6. Data model changes

- **Project** gains: `name` (display), `session` (agent session id + agent kind), `created_at`, `cover`. (Config already has `projects[]`; extend to objects or a sidecar.)
- **Skills store:** built-in skills in-repo (`skill/`), user skills under `~/.jenai-studio/skills/` (survive updates, never overwritten by pull).
- Jobs already carry `project_id`, `params.options`, references — no change.

## 7. Agent behavior

- On a request, the agent: reads relevant skills → `create_project`/`bind_session`
  → picks model(s) via `list_models` + skill judgment → `estimate_cost` (states
  it, does not block) → `generate_*` (auto-runs; **no forced yes/no** — user's
  money) → reports results with links; the web project fills live.
- Sets/edits references via `edit_image`/`generate_image` with `input_images`.
- Multi-output ("10 images") = one call with `count` or a small loop.

## 8. Multi-agent support matrix

| Agent | Brain | Tools (MCP) | Skills | In-app chat |
|---|---|---|---|---|
| Claude Code | ✓ their sub | ✓ | `SKILL.md` | possible later |
| Codex | ✓ their sub | ✓ | `AGENTS.md` | possible later |
| Gemini Antigravity (IDE) | ✓ their sub | ✓ if MCP-capable, else curl fallback | `AGENTS.md`/doc | ✗ (IDE — viewer model only) |

MCP + portable skills is the common denominator; the web app is the shared viewer.

## 9. Security posture

Local, single-user tool driving the user's own agent — it already has the powers
we'd "grant". So: allow web search and normal tool use; **block destructive ops**
(no `rm`/mass-delete) via the agent's allowlist/permission config; keep generation
confined to provider APIs. One real residual risk: **web content is untrusted and
the agent has tools** (prompt-injection) — mitigated by the destructive-op block
and by not auto-acting on instructions found in fetched pages. No hard cost gate.

## 10. Skills system

- **Discovery:** `list_skills` (MCP) returns name + description + how-to for every
  skill; the agent always knows its capabilities ("edit an image", "make a set").
- **Browse:** the web Skills tab renders the same list, scrollable, click for detail.
- **Author:** users create/save their own skills in the UI → `~/.jenai-studio/skills/`.
- **Format:** author once; emit `SKILL.md` (Claude) + `AGENTS.md` (others); evaluate agentskills.io as the single source format.
- **Updates:** built-in skills refresh via the Update button; user skills are never touched.

## 11. Open questions

- agentskills.io: adopt as the canonical portable format, or keep our own + generators?
- Does Antigravity support MCP? If not, the curl fallback must be first-class for it.
- Project↔session resume for non-Claude agents (Codex/Antigravity session semantics differ).
- Should the MCP server be in the main Node process or a separate one the app launches?
- Session naming: agent-chosen vs. user-confirmed on first message.

## 12. Milestones

1. **MCP server** (generate/list/estimate/project/skills tools) wrapping the existing API + option schema. Usable immediately from Claude Code / Codex / desktop Claude.
2. **Playbook** — built-in skills as `SKILL.md` + `AGENTS.md` (generate-into-project, edit, make-a-set, image→video).
3. **Projects workspace** — unified images+videos project view, live, lightbox reuse; session binding + auto-naming.
4. **Skills browser** — list/detail + save-your-own.
5. **Update button** — Hermes-style ff-pull + build + restart + rollback.
6. *(Optional, later)* in-app `claude -p` chat tab for Claude/Codex users.

## 13. Success criteria

- A student, in their own agent, says "make me 10 launch images" and watches them
  populate a correctly-named project in the browser, having touched no code.
- The same flow works in Claude Code and Codex (Antigravity via MCP/curl + viewer).
- Adding a new model or skill upstream reaches a student via one Update click.
- The user can add and use their own skill without editing the repo.
