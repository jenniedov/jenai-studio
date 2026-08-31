---
name: jenai-studio-install
description: Install and set up JenAI Studio for someone — a local app for making AI images and videos with your own coding agent. Use when the user says "set up JenAI Studio", "install JenAI Studio", "get me the studio", or asks you to clone and prepare it so they can generate images/videos.
user-invocable: true
---

# JenAI Studio — install & set up

Get a non-coder from nothing to a working, agent-driven studio. Be warm and
concrete; do each step, show the result, and don't move on until it worked. The
whole point: **they never touch npm or MCP config by hand — you do it in one shot.**

## Install (one command after cloning)

1. **Check the tools.** `node --version` (need v18+) and `git --version`. If Node
   is missing, point them to https://nodejs.org (LTS) and stop until it's installed.

2. **Clone and set up.** This is the *only* setup they need:
   ```bash
   git clone https://github.com/jenniedov/jenai-studio.git
   cd jenai-studio
   npm run setup
   ```
   `npm run setup` installs dependencies **and** connects the `jenai-studio` MCP to
   the coding agents on this machine (Claude Code + Codex). No manual `npm install`,
   no hand-editing MCP config.

3. **Don't start a server.** The studio launches itself the first time you generate
   (the MCP boots it). It opens at http://localhost:4317 — the person watches
   results appear there.

## Add a provider key (if they don't have one)

The LLM (your agent) is their own subscription — free. Generation still needs a
provider key:
- **Oxen.ai** (simplest): https://oxen.ai — ~$20 free, email hello@oxen.ai to double to $40.
- **Kie.ai**: https://kie.ai — 80 free credits that never expire, cover every model.

They paste it into the studio's onboarding popup or Settings (keys stay on their
machine). If they're stuck, offer to walk them through it.

## Now generate (through the MCP)

Once the MCP is connected, drive the studio with its tools — **read the `studio`
skill** for the full operating manual. In short:
`create_project` (named for what they're building) → `list_models` /
`get_model_options` → `estimate_cost` (say the price) → `generate_image` /
`generate_video` / `edit_image`. Everything lands in the one project they watch
fill up live. See also `edit-image`, `make-a-set`, `image-to-video`.

If the MCP isn't in your current session yet, open your agent **inside the
jenai-studio folder** — Claude Code auto-detects `.mcp.json`; Codex is already wired
by `npm run setup`.

## If something breaks

Failures come back as friendly error objects (a `code` like `AUTH_MISSING` /
`INSUFFICIENT_CREDITS` plus ready-made `friendly.{en,he}` copy). Read it, explain it
simply, and help fix it — add a key, top up credits, reword a blocked prompt, or
switch provider/model.
```
