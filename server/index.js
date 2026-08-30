// JenAI Studio — single Node process. Serves the built React UI, the /api/*
// routes, the adapter layer, and the local generated files. One port, one
// command, one URL.

import express from 'express';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  ensureDirs, getConfig, getKey, setKey, maskedKeyStatus, saveSettings, setOpenrouterOpenaiVerified,
  getProjects, getArchivedProjects, addProject, reorderProjects, setProjectArchived, deleteProject,
  getJobs, getJob, deleteJob, filesDir, dataDir,
  saveUpload, flushJobs, backfillPosters,
} from './storage/store.js';
import { listAdapters } from './adapters/index.js';
import { probeOpenaiEligibility } from './adapters/openrouter.js';
import { refreshFeed, priceTable, feedMeta } from './feed/prices.js';
import { optionSchema } from './options.js';
import {
  createJobs, processJob, estimateCost, publicJob, BATCH_CAP,
} from './engine.js';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const PORT = Number(process.env.PORT) || 4317;

ensureDirs();

const modelsRaw = JSON.parse(readFileSync(join(ROOT, 'config', 'models.json'), 'utf8'));
// Attach each model's computed option schema (built-ins + custom) so the front
// end renders its controls from config, never from hardcoded assumptions.
const models = { ...modelsRaw, models: modelsRaw.models.map((m) => ({ ...m, optionSchema: optionSchema(m) })) };
const branding = JSON.parse(readFileSync(join(ROOT, 'config', 'branding.json'), 'utf8'));
const legalHe = readFileSync(join(ROOT, 'config', 'legal.he.md'), 'utf8');

const app = express();
app.use(express.json({ limit: '25mb' }));

// --- API -------------------------------------------------------------------

const api = express.Router();

api.get('/health', (_req, res) => res.json({ ok: true, name: branding.name, port: PORT }));

api.get('/config', (_req, res) => {
  const cfg = getConfig();
  res.json({ branding, settings: cfg.settings, legal: { he: legalHe }, batchCap: BATCH_CAP });
});

api.get('/models', (_req, res) => res.json(models));

// Configured providers + whether a key exists (never the key itself).
api.get('/providers', (_req, res) => {
  const status = maskedKeyStatus();
  const providers = listAdapters().map((p) => ({
    ...p,
    hasKey: Boolean(status[p.id]?.hasKey),
    last4: status[p.id]?.last4 || null,
  }));
  res.json({ providers });
});

api.post('/keys', (req, res) => {
  const { provider, key } = req.body || {};
  if (!provider) return res.status(400).json({ error: 'provider is required' });
  const status = setKey(provider, key);
  res.json({ ok: true, providers: status });
});

api.get('/projects', (_req, res) => res.json({ projects: getProjects(), archived: getArchivedProjects() }));
api.post('/projects', (req, res) => res.json({ projects: addProject(req.body?.name) }));
api.post('/projects/order', (req, res) => res.json({ projects: reorderProjects(req.body?.projects || []) }));
api.post('/projects/archive', (req, res) => res.json(setProjectArchived(req.body?.name, !!req.body?.archived)));
api.delete('/projects/:name', (req, res) => res.json(deleteProject(req.params.name)));

api.post('/settings', (req, res) => res.json({ settings: saveSettings(req.body || {}) }));

// Real per-provider prices from the jenai.house feed (cached, refreshed daily).
api.get('/prices', (_req, res) => res.json({ ...feedMeta(), table: priceTable() }));
api.post('/prices/refresh', async (_req, res) => {
  const r = await refreshFeed({ force: true });
  res.json({ ...r, ...feedMeta(), table: priceTable() });
});

// Verify whether OpenAI-on-OpenRouter actually works on this account (the data
// policy is a per-account setting we can't see any other way). Persists the
// result so the UI only shows OpenRouter for GPT Image when it truly works.
api.post('/providers/openrouter/verify', async (_req, res) => {
  const key = getKey('openrouter');
  if (!key) return res.json({ eligible: false, reason: 'no_key', settings: getConfig().settings });
  const r = await probeOpenaiEligibility(key);
  // Only change the stored flag on a definite yes/no — leave it untouched when
  // the probe is inconclusive (transient error), so a hiccup never lies.
  const settings = typeof r.eligible === 'boolean'
    ? setOpenrouterOpenaiVerified(r.eligible)
    : getConfig().settings;
  res.json({ eligible: r.eligible, reason: r.reason, settings });
});

// Pre-generation cost estimate.
api.post('/estimate', (req, res) => {
  const { model, num_outputs } = req.body || {};
  res.json({ cost: estimateCost(model, Number(num_outputs) || 1), batchCap: BATCH_CAP });
});

// The universal generate endpoint. Creates jobs immediately, processes in the
// background, and returns the queued jobs so the UI/Claude can poll them.
api.post('/generate', (req, res) => {
  const body = req.body || {};
  if (!body.task || !body.model || !body.provider) {
    return res.status(400).json({ error: 'task, model and provider are required' });
  }
  if (!body.prompt && !(body.input_images?.length)) {
    return res.status(400).json({ error: 'a prompt or an input image is required' });
  }
  let created;
  try {
    created = createJobs(body);
  } catch (bad) {
    return res.status(bad.httpStatus || 400).json({ error: bad.message || 'bad request', detail: bad.error || null });
  }
  // Fire-and-forget processing; each job updates its own status.
  for (const job of created.jobs) {
    processJob(job.job_id).catch(() => { /* engine already records failures */ });
  }
  res.json({ jobs: created.jobs.map(publicJob) });
});

api.get('/jobs', (req, res) => {
  const { project, type, limit, offset } = req.query;
  const { jobs, total } = getJobs(project, {
    type: type || undefined,
    limit: limit != null ? Number(limit) : undefined,
    offset: offset != null ? Number(offset) : 0,
  });
  res.json({ jobs: jobs.map(publicJob), total });
});

api.get('/jobs/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'not found' });
  res.json(publicJob(job));
});

api.delete('/jobs/:id', (req, res) => {
  const ok = deleteJob(req.params.id);
  if (!ok) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

// Upload a reference image (base64 data URL) → returns a local URL usable as
// an input_image for image_to_x / reference_to_x generation.
api.post('/upload', (req, res) => {
  try {
    const name = saveUpload(req.body?.dataUrl || '');
    res.json({ local_url: `/api/files/${name}`, file_name: name });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

// Serve generated media from the local files folder.
api.use('/files', express.static(filesDir(), { fallthrough: false }));

app.use('/api', api);

// --- Static UI -------------------------------------------------------------

const dist = join(ROOT, 'web', 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  // SPA fallback for client-side routes.
  app.get('*', (_req, res) => res.sendFile(join(dist, 'index.html')));
} else {
  app.get('*', (_req, res) => res.status(200).send(
    '<h1>JenAI Studio</h1><p>The UI is not built yet. Run <code>npm run build</code>, '
    + 'or <code>npm run dev</code> for hot-reload development.</p>',
  ));
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { flushJobs(); process.exit(0); });
}
process.on('exit', flushJobs);

app.listen(PORT, () => {
  // Backfill posters for any videos generated before thumbnails existed.
  backfillPosters().then((n) => { if (n) console.log(`  ✦ generated ${n} video thumbnail(s)`); });
  // Pull the price feed if the cache is stale (at most once a day).
  refreshFeed().then((r) => { if (r.reason === 'refreshed') console.log(`  ✦ price feed updated (${r.asOf})`); });
  console.log('');
  console.log(`  ✦ ${branding.name} is running`);
  console.log(`  ✦ open   http://localhost:${PORT}`);
  console.log(`  ✦ data   ${dataDir()}`);
  console.log('');
});
