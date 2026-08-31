# JenAI Studio

A local, white-labelable GenAI studio for **images and videos** through cheap
bring-your-own-key providers. One Node process, one command, one URL. Your keys
and files stay on your machine — no telemetry, no phone-home.

Built to be installed by non-coders in a live workshop, driven by their own
Claude, with a friendly-error system that keeps a room of 50 people unblocked.

> **עברית:** אפליקציה שרצה על המחשב שלך ומייצרת תמונות וסרטונים עם המפתח שלך.
> ראו את [דף הסדנה בעברית](docs/teaching-handout.he.md).

---

## Quick start

You need **Node 18+** and **Git**.

```bash
git clone https://github.com/jenniedov/jenai-studio.git
cd jenai-studio
npm run setup
```

`npm run setup` installs everything **and** connects the `jenai-studio` MCP to your
coding agents (Claude Code + Codex) — no manual MCP config. You don't need to start
a server: your agent launches the studio itself on the first request (or run
`npm start` to open it yourself at **http://localhost:4317**).

Then just open your agent (Claude Code / Codex) in this folder and tell it what to
create — it generates into a project you watch fill up live. The onboarding popup
asks for a provider key, or grab a free one below.

For hot-reload development instead:

```bash
npm run dev      # Vite UI on :5173, API on :4317
```

## Getting a free key

- **Oxen.ai** — https://oxen.ai. ~$20 free, doubles to $40 by emailing hello@oxen.ai. Simplest API.
- **Kie.ai** — https://kie.ai. 80 free credits that never expire; covers every model.

No card needed for either. Keys are stored on your machine in `~/.jenai-studio/`
(chmod 600) and only ever sent to the provider you chose.

## What's inside

| Piece | Where |
|---|---|
| Single Node server (UI + API + files) | [`server/index.js`](server/index.js) |
| Job engine (submit → poll → download) | [`server/engine.js`](server/engine.js) |
| Provider adapters (Kie async, Oxen sync) | [`server/adapters/`](server/adapters/) |
| Copy-me adapter template | [`server/adapters/_template.js`](server/adapters/_template.js) |
| Friendly-error system (bilingual) | [`server/errors/`](server/errors/) · [docs](docs/errors.md) |
| React UI (EN + HE, full RTL) | [`web/`](web/) |
| Model catalog | [`config/models.json`](config/models.json) |
| White-label config | [`config/branding.json`](config/branding.json) |
| Install & usage skill | [`skill/jenai-studio-install/`](skill/jenai-studio-install/) |

## The universal endpoint

Everything flows through one request. Adapters translate it per provider.

```
POST /api/generate     -> create job(s), returns them immediately
GET  /api/jobs/:id      -> poll one job
GET  /api/jobs          -> history (newest first), ?project= filter
DELETE /api/jobs/:id    -> delete job + its local file
GET  /api/models        -> the catalog
GET  /api/providers     -> configured providers + key status (never the key)
POST /api/keys          -> store a provider key locally
```

Request body (see the [install skill](skill/jenai-studio-install/SKILL.md) for the full shape):

```json
{ "task": "image", "provider": "kie", "model": "nano-banana-pro",
  "prompt": "a red panda barista in Tel Aviv, golden hour",
  "aspect_ratio": "16:9", "num_outputs": 1, "project_id": "default" }
```

Sync providers return a job already `done`; async providers return `queued` and
the server polls the provider for you. The UI and Claude only ever see the **job**
abstraction. Outputs are downloaded to local storage immediately (provider URLs
expire) and served from `/api/files/...`.

## The magic flow (script → many images → video)

The whole point: the user writes a short brief, their Claude expands it into N
prompts and calls `POST /api/generate` for each, and the images stream into the
gallery **live** while they watch — then a video. Because generation goes through
`http://localhost:4317`, the user's Claude and the app share one gallery. See the
[install skill](skill/jenai-studio-install/SKILL.md) Part 3.

## White-labelling

Edit [`config/branding.json`](config/branding.json): name, logo text, colors,
default locale, and which tabs show. No code changes needed.

## Adding a provider

Copy [`server/adapters/_template.js`](server/adapters/_template.js), fill in four
blanks, register it, add slugs to `models.json`. Full walkthrough:
[docs/add-a-provider.md](docs/add-a-provider.md).

> **Note on model slugs:** some provider slugs in `config/models.json` shipped as
> best-guess. Confirm each against the provider's live model list before a
> workshop (Kie.ai has the broadest confirmed coverage). A wrong slug surfaces as
> a friendly `BAD_REQUEST`, never a crash.

## Tests & smoke check

```bash
npm test            # adapter + error-mapping unit tests (no network)
KIE_API_KEY=... npm run smoke     # one real cheap generation, end-to-end
```

The smoke test is also the workshop "is my key working?" check.

## Safety & cost

- Batch cap of 20 per request; a confirm dialog above 8.
- Pre-generation cost estimate from `models.json` unit prices.
- No auto-retry storms — a failure shows a card; retry is a deliberate click.
- Respects `Retry-After` on rate limits.
- Keys local-only, no telemetry.

## License

[Apache-2.0](LICENSE). Original code — no GPL/AGPL forks. See [NOTICE](NOTICE)
for third-party attributions.
