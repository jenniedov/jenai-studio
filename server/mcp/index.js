#!/usr/bin/env node
// JenAI Studio MCP server — the "hands" any agent (Claude Code, Codex, …) uses to
// generate images/videos into projects. It is a thin wrapper over the running
// Studio HTTP API (default http://localhost:4317), so the app must be running.
//
// Register with Claude Code via the repo's .mcp.json, or: claude mcp add.
// Stdout is the JSON-RPC channel — only ever log to stderr.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = process.env.PORT || 4317;
const BASE = `http://localhost:${PORT}`;
const API = `${BASE}/api`;
const DATA_DIR = process.env.JENAI_DATA_DIR || join(homedir(), '.jenai-studio');
const FILES_DIR = join(DATA_DIR, 'files');
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const log = (...a) => process.stderr.write(`[jenai-mcp] ${a.join(' ')}\n`);

// ---- studio auto-start -----------------------------------------------------
// The agent shouldn't have to start the studio — if it isn't running, we launch
// it (detached, so it outlives this session and the person can watch results in
// the browser) and wait for it to be healthy. First call may take ~15s to boot.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let healthy = false;
let starting = null;
async function healthOk() { try { return (await fetch(`${API}/health`)).ok; } catch { return false; } }
async function ensureStudio() {
  if (healthy) return;
  if (await healthOk()) { healthy = true; return; }
  if (!starting) starting = (async () => {
    log('studio not running — starting it (npm start)…');
    try { spawn('npm', ['start'], { cwd: REPO, detached: true, stdio: 'ignore', env: process.env }).unref(); }
    catch (e) { starting = null; throw new Error(`could not start the studio: ${e.message}`); }
    for (let i = 0; i < 120; i++) { if (await healthOk()) { healthy = true; log('studio is up'); return; } await sleep(1000); }
    starting = null;
    throw new Error('started the studio but it did not become healthy in time.');
  })();
  return starting;
}

// ---- HTTP helpers ----------------------------------------------------------
async function api(path, opts) {
  await ensureStudio();
  let res;
  try { res = await fetch(`${API}${path}`, opts); }
  catch { throw new Error(`Studio not reachable at ${BASE}.`); }
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(typeof data === 'object' ? (data.error || JSON.stringify(data)) : String(data));
  return data;
}
const post = (path, body) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

function mimeOf(name) {
  const e = String(name).toLowerCase().split('.').pop();
  return { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', webm: 'video/webm' }[e] || 'application/octet-stream';
}
const abs = (u) => (u && u.startsWith('/api/') ? `${BASE}${u}` : u);

async function waitJob(id, { timeoutMs = 300000, intervalMs = 2500 } = {}) {
  const start = Date.now();
  for (;;) {
    const job = await api(`/jobs/${id}`);
    if (job.status === 'done' || job.status === 'error') return job;
    if (Date.now() - start > timeoutMs) return { ...job, status: 'timeout' };
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

// Accept a reference as a local file path, an /api/files URL, or a public URL.
async function toRef(x) {
  const s = typeof x === 'string' ? x : (x?.url || x?.path);
  if (!s) return null;
  if (/^https?:/.test(s)) return { role: 'reference', url: s };
  if (s.startsWith('/api/files/')) return { role: 'reference', url: `${BASE}${s}` };
  if (existsSync(s)) {
    const buf = readFileSync(s);
    const up = await post('/upload', { dataUrl: `data:${mimeOf(s)};base64,${buf.toString('base64')}` });
    return { role: 'reference', url: `${BASE}${up.local_url}` };
  }
  return { role: 'reference', url: s };
}

async function runGeneration({ task, project, model, provider, prompt, options, input_images, count }) {
  const refs = [];
  for (const x of input_images || []) { const r = await toRef(x); if (r) refs.push(r); }
  const body = {
    task, provider, model, prompt,
    mode: refs.length ? (task === 'video' ? 'image_to_x' : 'reference_to_x') : 'text_to_x',
    num_outputs: task === 'video' ? 1 : Math.max(1, Math.min(20, Number(count) || 1)),
    input_images: refs,
    project_id: project || 'default',
    options: options || {},
  };
  const { jobs } = await post('/generate', body);
  const done = [];
  for (const j of jobs) done.push(await waitJob(j.job_id));
  return done;
}

// Turn finished jobs into MCP content: a text summary, inline image previews,
// and a JSON block so the agent has structured references.
function resultContent(jobs, { inlineImages = true } = {}) {
  const content = [];
  const lines = [];
  const structured = [];
  for (const j of jobs) {
    const out = j.outputs?.[0] || {};
    const url = abs(out.local_url);
    structured.push({ job_id: j.job_id, status: j.status, model: j.model, provider: j.provider, project_id: j.project_id, type: out.type, url, error: j.error?.code });
    if (j.status === 'done') {
      lines.push(`✓ ${j.model_label || j.model} · ${j.provider} → ${url}`);
      if (inlineImages && out.type === 'image' && out.file_name) {
        try { content.push({ type: 'image', data: readFileSync(join(FILES_DIR, out.file_name)).toString('base64'), mimeType: mimeOf(out.file_name) }); } catch { /* skip preview */ }
      }
    } else if (j.status === 'error') {
      lines.push(`✗ ${j.model_label || j.model} · ${j.provider}: ${j.error?.friendly?.en?.body || j.error?.code || 'failed'}`);
    } else {
      lines.push(`… ${j.model} still ${j.status}`);
    }
  }
  content.unshift({ type: 'text', text: lines.join('\n') || 'No results.' });
  content.push({ type: 'text', text: '```json\n' + JSON.stringify({ results: structured }, null, 2) + '\n```' });
  return { content };
}

// ---- skills (built-in + user) ----------------------------------------------
function parseFrontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  const out = {};
  if (m) for (const line of m[1].split('\n')) { const i = line.indexOf(':'); if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
  return out;
}
function readSkills() {
  const bases = [{ dir: join(REPO, 'skill'), source: 'built-in' }, { dir: join(DATA_DIR, 'skills'), source: 'user' }];
  const out = [];
  for (const { dir, source } of bases) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      const p = join(dir, name, 'SKILL.md');
      if (!existsSync(p)) continue;
      const md = readFileSync(p, 'utf8');
      const fm = parseFrontmatter(md);
      out.push({ name: fm.name || name, description: fm.description || '', source, body: md });
    }
  }
  return out;
}

// Small price matcher mirroring the web client (feed variant vs. resolution).
function priceFor(table, model, provider, resolution) {
  const e = table?.[model]; if (!e) return null;
  const rows = e.providers?.[provider]; if (!rows?.length) return null;
  const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');
  const r = norm(resolution);
  const hit = (r && (rows.find((x) => norm(x.variant) === r) || rows.find((x) => norm(x.variant).split('-').includes(r))))
    || rows.reduce((a, b) => (b.price < a.price ? b : a));
  return { unit: e.unit, price: hit.price };
}

// ---- MCP server ------------------------------------------------------------
const server = new McpServer({ name: 'jenai-studio', version: '0.1.0' });
const text = (s) => ({ content: [{ type: 'text', text: typeof s === 'string' ? s : JSON.stringify(s, null, 2) }] });

server.registerTool('list_models', {
  title: 'List models',
  description: 'List available image/video models with their capabilities (aspect ratios, resolutions, providers, and per-model option schema). Call this before generating so you know what each model accepts.',
  inputSchema: { type: z.enum(['image', 'video']).optional().describe('filter to image or video models') },
}, async ({ type }) => {
  const { models } = await api('/models');
  const list = models.filter((m) => !type || m.type === type).map((m) => ({
    key: m.key, label: m.label, type: m.type, tag: m.tag, blurb: m.blurb,
    providers: Object.keys(m.providers || {}), priceUsd: m.priceUsd,
    options: (m.optionSchema || []).map((o) => ({ key: o.key, type: o.type, values: o.values, default: o.default })),
  }));
  return text({ models: list });
});

server.registerTool('get_model_options', {
  title: 'Get model options',
  description: 'Get the full option schema for one model — every option it accepts, its type, allowed values, and default.',
  inputSchema: { model: z.string() },
}, async ({ model }) => {
  const { models } = await api('/models');
  const m = models.find((x) => x.key === model);
  if (!m) throw new Error(`unknown model "${model}"`);
  return text({ model: m.key, type: m.type, providers: Object.keys(m.providers || {}), optionSchema: m.optionSchema || [] });
});

server.registerTool('estimate_cost', {
  title: 'Estimate cost',
  description: 'Estimate the cost of a generation from the live jenai.house price feed. Video is priced per second × length; images per image × count.',
  inputSchema: {
    model: z.string(), provider: z.string(),
    resolution: z.string().optional(), duration: z.number().optional(), count: z.number().optional(),
  },
}, async ({ model, provider, resolution, duration, count }) => {
  const { table } = await api('/prices');
  const p = priceFor(table, model, provider, resolution);
  if (!p) return text({ model, provider, note: 'no feed price for this combination' });
  const total = p.unit === 'second' ? p.price * (duration || 4) : p.price * (count || 1);
  return text({ model, provider, unit: p.unit, unitPrice: p.price, total: Number(total.toFixed(4)) });
});

server.registerTool('list_projects', {
  title: 'List projects', description: 'List the studio projects (each is a folder that groups a session\'s images and videos).', inputSchema: {},
}, async () => text(await api('/projects')));

server.registerTool('create_project', {
  title: 'Create project',
  description: 'Create a project named for what the user is building (e.g. "Autumn candle launch"). Use its name as the `project` for every generation in this session, so all output lands in one place.',
  inputSchema: { name: z.string() },
}, async ({ name }) => { const r = await post('/projects', { name }); return text({ created: name, projects: r.projects }); });

const genSchema = {
  project: z.string().describe('project name to save into (create_project first)'),
  model: z.string(), provider: z.string().optional().describe('kie | oxen | openrouter; omit to auto-pick'),
  prompt: z.string(),
  options: z.record(z.any()).optional().describe('generic options bag, e.g. { aspect_ratio: "16:9", resolution: "2K", seed: 42 } — see get_model_options'),
  input_images: z.array(z.string()).optional().describe('reference images: local file paths, /api/files URLs, or public URLs'),
};

server.registerTool('generate_image', {
  title: 'Generate image(s)',
  description: 'Generate one or more images into a project and wait for them. Returns links + inline previews. Set count for a batch.',
  inputSchema: { ...genSchema, count: z.number().optional().describe('how many (1–20)') },
}, async (a) => resultContent(await runGeneration({ task: 'image', ...a })));

server.registerTool('generate_video', {
  title: 'Generate video',
  description: 'Generate a video into a project and wait for it. Options like duration/generate_audio come from get_model_options.',
  inputSchema: genSchema,
}, async (a) => resultContent(await runGeneration({ task: 'video', ...a }), { inlineImages: false }));

server.registerTool('edit_image', {
  title: 'Edit image',
  description: 'Edit/restyle an existing image by using it as a reference (reference-to-image). Give the image path/URL and a prompt describing the change.',
  inputSchema: { project: z.string(), model: z.string(), provider: z.string().optional(), image: z.string(), prompt: z.string(), options: z.record(z.any()).optional() },
}, async ({ image, ...a }) => resultContent(await runGeneration({ task: 'image', input_images: [image], ...a })));

server.registerTool('get_job', {
  title: 'Get job', description: 'Get the status/result of one generation job.', inputSchema: { job_id: z.string() },
}, async ({ job_id }) => text(await api(`/jobs/${job_id}`)));

server.registerTool('list_assets', {
  title: 'List assets', description: 'List the images/videos already in a project.',
  inputSchema: { project: z.string(), type: z.enum(['image', 'video']).optional() },
}, async ({ project, type }) => {
  const q = new URLSearchParams({ project }); if (type) q.set('type', type);
  const { jobs } = await api(`/jobs?${q}`);
  return text({ assets: jobs.filter((j) => j.status === 'done').map((j) => ({ job_id: j.job_id, type: j.outputs?.[0]?.type, model: j.model, prompt: j.prompt, url: abs(j.outputs?.[0]?.local_url) })) });
});

server.registerTool('list_project_assets', {
  title: 'List project assets',
  description: 'List a project\'s ASSET LIBRARY — the reusable, tagged files (people\'s uploads + promoted generations). Read the tags to find the right reference, then pass its `url` in `input_images` on generate_image / generate_video / edit_image. This is different from list_assets (which lists everything you generated).',
  inputSchema: { project: z.string() },
}, async ({ project }) => {
  const { assets } = await api(`/assets?project=${encodeURIComponent(project)}`);
  return text({ assets: (assets || []).map((a) => ({ asset_id: a.asset_id, name: a.name, type: a.type, tags: a.tags, source: a.source, prompt: a.prompt, url: abs(a.local_url) })) });
});

server.registerTool('save_asset', {
  title: 'Save as asset',
  description: 'Promote something into a project\'s reusable asset library so you (or the person) can use it later as a reference. Pass a `job_id` from a generation you just made, or a result `url`. Always add descriptive `tags` (e.g. ["character","hero","front-view"]) and a short `name` so it can be found later.',
  inputSchema: { project: z.string(), job_id: z.string().optional(), url: z.string().optional(), name: z.string().optional(), tags: z.array(z.string()).optional() },
}, async ({ project, job_id, url, name, tags }) => {
  const body = { project, name, tags };
  if (job_id) body.job_id = job_id; else if (url) body.url = url;
  else throw new Error('give a job_id or a url to save as an asset');
  const { asset } = await post('/assets', body);
  return text({ saved: { asset_id: asset.asset_id, name: asset.name, tags: asset.tags, url: abs(asset.local_url) } });
});

server.registerTool('tag_asset', {
  title: 'Tag / rename asset',
  description: 'Set the tags (and optionally the name) on an existing asset so it is easy to find later. Tags REPLACE the current tags — include the ones you want to keep. Get asset_ids from list_project_assets.',
  inputSchema: { asset_id: z.string(), tags: z.array(z.string()).optional(), name: z.string().optional() },
}, async ({ asset_id, tags, name }) => {
  const { asset } = await api(`/assets/${asset_id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tags, name }) });
  return text({ asset: { asset_id: asset.asset_id, name: asset.name, tags: asset.tags } });
});

server.registerTool('list_skills', {
  title: 'List skills', description: 'List the studio skills available to you (how to edit an image, make a set, etc.). Read a skill with get_skill before doing that kind of task.', inputSchema: {},
}, async () => text({ skills: readSkills().map(({ name, description, source }) => ({ name, description, source })) }));

server.registerTool('get_skill', {
  title: 'Get skill', description: 'Read the full instructions for one skill by name.', inputSchema: { name: z.string() },
}, async ({ name }) => {
  const s = readSkills().find((x) => x.name === name);
  if (!s) throw new Error(`unknown skill "${name}"`);
  return text(s.body);
});

const transport = new StdioServerTransport();
await server.connect(transport);
log(`ready · API ${BASE} · repo ${REPO}`);
