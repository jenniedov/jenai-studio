# Add a provider

JenAI Studio talks to image/video providers through small **adapters**. Each
adapter is one file that translates the app's universal request into that
provider's API, and normalizes the response back into a job. Adding a provider
is copying one file and filling in four blanks.

## The four things you fill in

Open [`server/adapters/_template.js`](../server/adapters/_template.js) — it's
heavily commented. You edit exactly four spots:

1. **Base URL + auth** — where requests go, and the auth header. Most providers
   use `Authorization: Bearer <key>`. (fal.ai is the exception: `Authorization: Key <key>`.)
2. **Request mapping** — turn the universal request into the provider's body.
3. **Response / poll parsing** — read the output URL(s). Sync providers return
   them immediately; async providers give a job id you poll.
4. **Error mapping** — turn the provider's failure into one taxonomy code.

## Steps

1. Copy the template:
   ```bash
   cp server/adapters/_template.js server/adapters/myprovider.js
   ```
2. Rename the exported object and set `id`, `label`, `signupUrl`.
3. Fill in the four spots (see the two real examples:
   [`oxen.js`](../server/adapters/oxen.js) is sync, [`kie.js`](../server/adapters/kie.js) is async).
4. Register it in [`server/adapters/index.js`](../server/adapters/index.js):
   ```js
   import { myprovider } from './myprovider.js';
   const ADAPTERS = [kie, oxen, myprovider];
   ```
5. Add your provider's slug to the models it supports in
   [`config/models.json`](../config/models.json):
   ```json
   { "key": "nano-banana-2", "providers": { "kie": "…", "myprovider": "the-slug" } }
   ```
6. Add a unit test in `tests/adapters.test.js` (copy an existing block).

## Sync vs async

- **Sync** (Oxen, OpenRouter images): `submit` returns `{ done: true, outputs }`.
  Delete the `poll` method.
- **Async** (Kie, fal, Replicate, OpenRouter video): `submit` returns
  `{ done: false, jobRef }`, and `poll(jobRef, ctx)` reports progress until done.

The engine handles the polling loop, local file download, and persistence — your
adapter only speaks HTTP to the provider.

## Verify the slugs (important)

The provider model slugs in `config/models.json` are the exact ids each provider
uses. Some shipped as best-guess and are worth confirming against the provider's
live model list before a workshop:

- **Kie.ai** has the broadest confirmed coverage of the target models. Check the
  model list at https://kie.ai.
- **Oxen.ai** — verify coverage of the premium models at https://oxen.ai/ai/models.
  A model with no `oxen` slug simply won't offer Oxen in the UI; that's fine.

Only wire a `model → provider` slug after you've confirmed it. A wrong slug shows
up as a friendly `BAD_REQUEST` in the app, not a crash.

## Provider quick-reference (from research)

| Provider | Auth header | Sync/async | Notes |
|---|---|---|---|
| Kie.ai | `Bearer` | async | `createTask` → poll `recordInfo`; envelope `{code,msg}`; max 20 new tasks / 10s |
| Oxen.ai | `Bearer` | sync | `/api/ai/images/generate`, `/videos/generate`; URL in, URL out |
| fal.ai | `Key` (not Bearer!) | async queue | model id in URL path; watch `has_nsfw_concepts` |
| Replicate | `Bearer` | async | `POST /v1/models/{owner}/{name}/predictions`; `Prefer: wait` for near-sync |
| OpenRouter | `Bearer` | image sync (base64), video async | best machine-readable errors via `error.metadata.error_type` |
