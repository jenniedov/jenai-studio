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
import { optionSchemaFor } from '../options.js';

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
  catch {
    healthy = false; // re-check (and relaunch if needed) on the next call
    throw new Error(`Studio not reachable at ${BASE}.`);
  }
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

// How long a generate_* tool call is allowed to wait for results before it
// hands back job ids for polling. Kept well under any MCP client's request
// timeout (Claude Code/Codex close the tool call after ~60s) — the studio keeps
// processing the jobs in the background regardless, so returning early loses
// nothing. Override with JENAI_MCP_WAIT_MS.
const WAIT_MS = Number(process.env.JENAI_MCP_WAIT_MS || 25000);

// Submit generation and return the job ids immediately (does NOT wait for them).
async function submitGeneration({ task, project, model, provider, prompt, options, input_images, count }) {
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
  return jobs.map((j) => j.job_id);
}

// Poll a set of job ids until they all settle (done/error) OR the time budget
// runs out. Never longer than budgetMs, so the tool call can't outlive the
// client timeout. Returns the latest job objects (some may still be running).
async function collectJobs(ids, { budgetMs }) {
  const start = Date.now();
  const byId = new Map(ids.map((id) => [id, { job_id: id, status: 'queued' }]));
  for (;;) {
    let pending = false;
    for (const id of ids) {
      const cur = byId.get(id);
      if (cur.status === 'done' || cur.status === 'error') continue;
      try {
        const j = await api(`/jobs/${id}`);
        byId.set(id, j);
        if (j.status !== 'done' && j.status !== 'error') pending = true;
      } catch { pending = true; }
    }
    if (!pending) break;
    if (Date.now() - start > budgetMs) break;
    await sleep(2500);
  }
  return ids.map((id) => byId.get(id));
}

// Submit, wait briefly, then return whatever's ready + job ids for the rest.
async function generateAndReport(args, { task, budgetMs = WAIT_MS, inlineImages = true }) {
  const ids = await submitGeneration({ task, ...args });
  const jobs = await collectJobs(ids, { budgetMs });
  return resultContent(jobs, { inlineImages });
}

// Human approval gate for VIDEO. Video costs real money and takes minutes, so we
// never start one without an explicit yes from the person. Two layers:
//   1) MCP elicitation — a true prompt to the human via the client UI. Used when
//      the client supports it; the agent can't answer on the person's behalf.
//   2) Fallback confirm token — for clients without elicitation, the first call
//      refuses to submit and tells the agent to ASK the person and only re-call
//      with confirm:true after a real yes.
// Returns { ok:true } to proceed, or { blocked:<mcp response> } to stop.
async function gateVideo(a) {
  let costLine = '';
  try {
    const { cost } = await post('/estimate', { model: a.model, num_outputs: 1 });
    if (cost != null) costLine = ` Estimated cost ≈ $${cost}.`;
  } catch { /* estimate is best-effort */ }
  const dur = a.options?.duration ?? a.options?.duration_seconds;
  const summary = `Generate a video in project "${a.project}" with ${a.model}`
    + (dur ? `, ${dur}s` : '') + `.${costLine}`
    + `\nPrompt: “${String(a.prompt || '').slice(0, 200)}”`;

  // 1) True human gate via elicitation, when the client supports it.
  const caps = server.server.getClientCapabilities?.();
  if (caps?.elicitation) {
    try {
      const r = await server.server.elicitInput({
        message: `🎬 Video generation costs money and takes minutes.\n${summary}\n\nDo you want me to generate this video?`,
        requestedSchema: {
          type: 'object',
          properties: {
            proceed: { type: 'boolean', title: 'Generate this video?', description: 'Yes starts the render and charges your provider.' },
          },
          required: ['proceed'],
        },
      });
      if (r.action === 'accept' && r.content?.proceed === true) return { ok: true };
      const why = r.action === 'accept' ? 'you chose not to proceed' : `you ${r.action}ed`;
      return { blocked: text(`🛑 Video not generated — ${why}. Nothing was charged.`) };
    } catch (e) {
      log(`elicitation unavailable, falling back to confirm token: ${e.message}`);
    }
  }

  // 2) Fallback: explicit confirm token. Never submit without a real yes.
  if (a.confirm === true) return { ok: true };
  return { blocked: text(
    `🎬 STOP — do not generate yet. Video is expensive and takes minutes.\n`
    + `${summary}\n\n`
    + `Ask the PERSON, in their language, exactly: "Do you want me to generate this video?" `
    + `Only after they explicitly say yes, call generate_video again with the same arguments plus confirm: true. `
    + `Never pass confirm: true unless the person actually approved.`) };
}

// Turn finished jobs into MCP content: a text summary, inline image previews,
// and a JSON block so the agent has structured references.
function resultContent(jobs, { inlineImages = true } = {}) {
  const content = [];
  const lines = [];
  const structured = [];
  // Candidates are NUMBERED (1., 2., …) in result order — matching the inline
  // previews — so a person can say "the second one" and the agent can map that
  // number straight to its job_id (same index in the JSON block).
  const num = (i) => (jobs.length > 1 ? `${i + 1}. ` : '');
  jobs.forEach((j, i) => {
    const out = j.outputs?.[0] || {};
    const url = abs(out.local_url);
    structured.push({ n: i + 1, job_id: j.job_id, status: j.status, model: j.model, provider: j.provider, project_id: j.project_id, type: out.type, url, error: j.error?.code });
    if (j.status === 'done') {
      lines.push(`${num(i)}✓ ${j.model_label || j.model} · ${j.provider} → ${url}`);
      if (inlineImages && out.type === 'image' && out.file_name) {
        try { content.push({ type: 'image', data: readFileSync(join(FILES_DIR, out.file_name)).toString('base64'), mimeType: mimeOf(out.file_name) }); } catch { /* skip preview */ }
      }
    } else if (j.status === 'error') {
      lines.push(`${num(i)}✗ ${j.model_label || j.model} · ${j.provider}: ${j.error?.friendly?.en?.body || j.error?.code || 'failed'}`);
    } else if (j.status === 'unknown' || j.status === 'timeout') {
      lines.push(`${num(i)}⚠ lost contact while waiting for job ${j.job_id} — it may well have FINISHED. Check get_job({job_id:"${j.job_id}"}) or list_assets before regenerating (regenerating costs money).`);
    } else {
      lines.push(`${num(i)}⏳ still ${j.status} — job ${j.job_id}`);
    }
  });
  // Anything not settled: tell the agent to poll rather than resubmit. This is
  // the normal path for videos (minutes) and heavy image batches — the studio
  // keeps working; the tool call just returned early to stay under the client
  // timeout.
  const pending = jobs.filter((j) => j.status !== 'done' && j.status !== 'error');
  if (pending.length) {
    const idList = pending.map((j) => j.job_id);
    // Poll cadence scales to how fast the job can actually change: images settle
    // in seconds, video in minutes. check_jobs only reads local studio state (no
    // upstream calls), so a tight 5s image loop is cheap; a 30s video loop avoids
    // burning agent turns on a state that won't have moved.
    const anyVideo = pending.some((j) => j.task === 'video');
    const every = anyVideo ? '~30s' : '~5s';
    const eta = anyVideo ? 'video can take up to ~15 min' : 'images usually finish in ~1–2 min';
    content.push({ type: 'text', text:
      `⏳ ${pending.length} still generating — this is normal (${eta}). `
      + `The studio keeps working in the background; nothing is lost. Do NOT resubmit (it costs money). `
      + `Wait, then call check_jobs({ job_ids: ${JSON.stringify(idList)} }) — repeat every ${every} until they're done. `
      + `They also appear live in the JenAI Studio browser tab.` });
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
  description: 'Get the full option schema for one model — every option it accepts, its type, allowed values, and default. Some models expose fewer options on a given provider (e.g. OpenAI image models on OpenRouter accept only 1:1/3:2/2:3 and no resolution), so pass `provider` to get the exact schema for that route.',
  inputSchema: { model: z.string(), provider: z.string().optional().describe('kie | oxen | openrouter — narrows the schema to what that provider accepts') },
}, async ({ model, provider }) => {
  const { models } = await api('/models');
  const m = models.find((x) => x.key === model);
  if (!m) throw new Error(`unknown model "${model}"`);
  const schema = provider ? optionSchemaFor(m, provider) : (m.optionSchema || []);
  return text({ model: m.key, type: m.type, provider: provider || null, providers: Object.keys(m.providers || {}), optionSchema: schema });
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
  description: 'Create a project named the way the PERSON would say it, in THEIR language — short and natural (e.g. "פאודה", "Autumn candles"), never an English marketing title for a non-English speaker. Use its name as the `project` for every generation in this session, so all output lands in one place.',
  inputSchema: { name: z.string() },
}, async ({ name }) => { const r = await post('/projects', { name }); return text({ created: name, projects: r.projects }); });

server.registerTool('rename_project', {
  title: 'Rename project',
  description: 'Rename a project everywhere (its jobs and assets follow). Use when the person wants a different name — e.g. to fix a name into their own language.',
  inputSchema: { from: z.string(), to: z.string() },
}, async ({ from, to }) => { const r = await post('/projects/rename', { from, to }); return text({ renamed: { from, to }, projects: r.projects }); });

server.registerTool('get_project_brief', {
  title: 'Get project brief',
  description: 'Read a project\'s brief — a free-text note about what it is, the brand, the style, and how the person likes things. READ THIS when you start working in a project, and follow it. Empty means none set yet.',
  inputSchema: { project: z.string() },
}, async ({ project }) => { const r = await api(`/projects/brief?project=${encodeURIComponent(project)}`); return text({ project, brief: r.brief }); });

server.registerTool('set_project_brief', {
  title: 'Set project brief',
  description: 'Set/replace a project\'s brief (free text — this REPLACES the whole brief). Use it to remember durable, project-specific things the person tells you (brand colors, aspect ratio, tone, "always keep this character"). Read the current brief first if you only mean to add to it.',
  inputSchema: { project: z.string(), brief: z.string() },
}, async ({ project, brief }) => { const r = await post('/projects/brief', { project, brief }); return text({ project, brief: r.brief }); });

const genSchema = {
  project: z.string().describe('project name to save into (create_project first)'),
  model: z.string(), provider: z.string().optional().describe('kie | oxen | openrouter; omit to auto-pick'),
  prompt: z.string(),
  options: z.record(z.any()).optional().describe('generic options bag, e.g. { aspect_ratio: "16:9", resolution: "2K", seed: 42 } — see get_model_options'),
  input_images: z.array(z.string()).optional().describe('reference images: local file paths, /api/files URLs, or public URLs'),
};

server.registerTool('generate_image', {
  title: 'Generate image(s)',
  description: 'Generate one or more images into a project. Submits and waits briefly; if they finish fast you get links + inline previews, otherwise you get job ids to poll with check_jobs every ~5s (images settle in seconds; the studio keeps working — never resubmit). Set count for a batch.',
  inputSchema: { ...genSchema, count: z.number().optional().describe('how many (1–20)') },
}, async (a) => generateAndReport(a, { task: 'image' }));

server.registerTool('generate_video', {
  title: 'Generate video',
  description: 'Generate a video into a project. ALWAYS ask the person for approval first — video costs real money. This tool enforces it: it will not start until the person confirms (via a prompt to them, or, on clients without that, until you re-call with confirm:true after they say yes). Video takes minutes (up to ~15), so once approved it returns a job id almost immediately — then poll check_jobs every ~30s until done. NEVER resubmit while it is running. Options like duration/generate_audio come from get_model_options.',
  inputSchema: { ...genSchema, confirm: z.boolean().optional().describe('set true ONLY after the person has explicitly approved generating this video (cost gate)') },
}, async (a) => {
  const gate = await gateVideo(a);
  if (!gate.ok) return gate.blocked;
  return generateAndReport(a, { task: 'video', budgetMs: Math.min(WAIT_MS, 8000), inlineImages: false });
});

server.registerTool('edit_image', {
  title: 'Edit image',
  description: 'Edit/restyle an existing image by using it as a reference (reference-to-image). Give the image path/URL and a prompt describing the change. Submits and waits briefly; poll check_jobs if it is not done yet.',
  inputSchema: { project: z.string(), model: z.string(), provider: z.string().optional(), image: z.string(), prompt: z.string(), options: z.record(z.any()).optional() },
}, async ({ image, ...a }) => generateAndReport({ input_images: [image], ...a }, { task: 'image' }));

server.registerTool('get_job', {
  title: 'Get job', description: 'Get the status/result of one generation job.', inputSchema: { job_id: z.string() },
}, async ({ job_id }) => text(await api(`/jobs/${job_id}`)));

server.registerTool('check_jobs', {
  title: 'Check jobs',
  description: 'Check the current status of one or more generation jobs WITHOUT waiting — returns immediately with links + inline previews for the finished ones. Use this to poll jobs that generate_image / generate_video handed back as still-running. Repeat every ~5s for images, ~30s for video, until all are done. Never resubmit a job that is still running.',
  inputSchema: { job_ids: z.array(z.string()) },
}, async ({ job_ids }) => {
  const jobs = [];
  for (const id of job_ids) { try { jobs.push(await api(`/jobs/${id}`)); } catch { jobs.push({ job_id: id, status: 'unknown' }); } }
  return resultContent(jobs, { inlineImages: true });
});

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
