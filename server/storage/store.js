// Local, on-disk storage. Everything lives under a single data dir on the
// user's machine (default ~/.jenai-studio). No database, no telemetry — just
// JSON files and a folder of generated media.

import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync,
  rmSync, copyFileSync, createWriteStream,
} from 'node:fs';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

const DATA_DIR = process.env.JENAI_DATA_DIR || join(homedir(), '.jenai-studio');
const FILES_DIR = join(DATA_DIR, 'files');
const CONFIG_PATH = join(DATA_DIR, 'config.json');
const HISTORY_PATH = join(DATA_DIR, 'history.json');
const ASSETS_PATH = join(DATA_DIR, 'assets.json');

export function ensureDirs() {
  mkdirSync(FILES_DIR, { recursive: true });
}

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(path, data, secret = false) {
  writeFileSync(path, JSON.stringify(data, null, 2));
  if (secret) {
    try { chmodSync(path, 0o600); } catch { /* best effort on non-POSIX */ }
  }
}

// ---------------------------------------------------------------------------
// Config: API keys + settings. Keys never leave the machine except to the
// chosen provider. This file is chmod 600.
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG = { keys: {}, settings: { locale: null }, projects: ['default'] };

export function getConfig() {
  const cfg = readJson(CONFIG_PATH, null);
  if (!cfg) {
    // Seed keys from env on very first run (file-based override path).
    const seeded = structuredClone(DEFAULT_CONFIG);
    if (process.env.KIE_API_KEY) seeded.keys.kie = process.env.KIE_API_KEY;
    if (process.env.OXEN_API_KEY) seeded.keys.oxen = process.env.OXEN_API_KEY;
    writeJson(CONFIG_PATH, seeded, true);
    return seeded;
  }
  // Fill in any missing top-level fields.
  return { ...DEFAULT_CONFIG, ...cfg, keys: { ...cfg.keys } };
}

export function setKey(provider, key) {
  const cfg = getConfig();
  if (key) cfg.keys[provider] = key;
  else delete cfg.keys[provider];
  writeJson(CONFIG_PATH, cfg, true);
  return maskedKeyStatus();
}

export function getKey(provider) {
  return getConfig().keys[provider] || null;
}

// Never returns the raw key — only whether one exists and its last 4 chars.
export function maskedKeyStatus() {
  const keys = getConfig().keys;
  const status = {};
  for (const [provider, key] of Object.entries(keys)) {
    status[provider] = { hasKey: Boolean(key), last4: key ? key.slice(-4) : null };
  }
  return status;
}

// Providers the user has switched off. A disabled provider is never offered in
// the UI, never chosen by the MCP, and refused by /generate.
export function getDisabledProviders() {
  return getConfig().disabledProviders || [];
}

export function setProviderDisabled(id, disabled) {
  const cfg = getConfig();
  const set = new Set(cfg.disabledProviders || []);
  if (disabled) set.add(id); else set.delete(id);
  cfg.disabledProviders = [...set];
  writeJson(CONFIG_PATH, cfg, true);
  return cfg.disabledProviders;
}

export function isProviderEnabled(id) {
  return !(getConfig().disabledProviders || []).includes(id);
}

export function saveSettings(patch) {
  const cfg = getConfig();
  cfg.settings = { ...cfg.settings, ...patch };
  writeJson(CONFIG_PATH, cfg, true);
  return cfg.settings;
}

// Whether OpenAI-on-OpenRouter is actually usable on this account. Set by the
// explicit verify probe AND self-corrected by real generations, so the UI only
// ever shows OpenRouter for GPT Image when it genuinely works.
export function setOpenrouterOpenaiVerified(v) {
  const cfg = getConfig();
  if (cfg.settings?.openrouterOpenaiVerified === !!v) return cfg.settings; // no churn
  cfg.settings = { ...cfg.settings, openrouterOpenaiVerified: !!v };
  writeJson(CONFIG_PATH, cfg, true);
  return cfg.settings;
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export function getProjects() {
  return getConfig().projects || ['default'];
}

// Per-project brief: a free-text note about this project (what it is, brand
// colors, style, how the person likes it) that any agent reads on entry and can
// update. The studio's own portable per-project memory, visible in the UI.
export function getProjectBrief(name) {
  return (getConfig().projectBriefs || {})[name] || '';
}

export function setProjectBrief(name, brief) {
  const cfg = getConfig();
  cfg.projectBriefs = cfg.projectBriefs || {};
  const clean = String(brief == null ? '' : brief);
  if (clean) cfg.projectBriefs[name] = clean; else delete cfg.projectBriefs[name];
  writeJson(CONFIG_PATH, cfg, true);
  return cfg.projectBriefs[name] || '';
}

export function getArchivedProjects() {
  return getConfig().archivedProjects || [];
}

export function addProject(name) {
  const cfg = getConfig();
  const clean = String(name || '').trim();
  if (clean && !cfg.projects.includes(clean)) {
    cfg.projects.push(clean);
    writeJson(CONFIG_PATH, cfg, true);
  }
  return cfg.projects;
}

// Reorder the active projects to the given order (only known names are kept).
export function reorderProjects(order) {
  const cfg = getConfig();
  const known = new Set(cfg.projects);
  const next = order.filter((n) => known.has(n));
  for (const n of cfg.projects) if (!next.includes(n)) next.push(n); // keep any missed
  cfg.projects = next;
  writeJson(CONFIG_PATH, cfg, true);
  return cfg.projects;
}

// Move a project between active and archived.
export function setProjectArchived(name, archived) {
  const cfg = getConfig();
  cfg.archivedProjects = cfg.archivedProjects || [];
  if (archived) {
    cfg.projects = cfg.projects.filter((n) => n !== name);
    if (!cfg.archivedProjects.includes(name)) cfg.archivedProjects.push(name);
  } else {
    cfg.archivedProjects = cfg.archivedProjects.filter((n) => n !== name);
    if (!cfg.projects.includes(name)) cfg.projects.push(name);
  }
  writeJson(CONFIG_PATH, cfg, true);
  return { projects: cfg.projects, archived: cfg.archivedProjects };
}

// Rename a project everywhere: the project list, its jobs, and its assets.
export function renameProject(from, to) {
  const cfg = getConfig();
  const clean = String(to || '').trim();
  if (!clean) throw new Error('new name is empty');
  if (!cfg.projects.includes(from) && !(cfg.archivedProjects || []).includes(from)) throw new Error(`unknown project "${from}"`);
  if (cfg.projects.includes(clean) || (cfg.archivedProjects || []).includes(clean)) throw new Error(`a project named "${clean}" already exists`);
  cfg.projects = cfg.projects.map((n) => (n === from ? clean : n));
  cfg.archivedProjects = (cfg.archivedProjects || []).map((n) => (n === from ? clean : n));
  if (cfg.projectBriefs?.[from] != null) {
    cfg.projectBriefs[clean] = cfg.projectBriefs[from];
    delete cfg.projectBriefs[from];
  }
  writeJson(CONFIG_PATH, cfg, true);
  for (const job of loadJobs()) if (job.project_id === from) job.project_id = clean;
  scheduleWrite();
  for (const a of loadAssets()) if (a.project_id === from) a.project_id = clean;
  writeAssets();
  return { projects: cfg.projects, archived: cfg.archivedProjects };
}

// Delete a project AND every job in it (media + posters removed from disk).
export function deleteProject(name) {
  const cfg = getConfig();
  cfg.projects = (cfg.projects || []).filter((n) => n !== name);
  cfg.archivedProjects = (cfg.archivedProjects || []).filter((n) => n !== name);
  if (cfg.projectBriefs?.[name] != null) delete cfg.projectBriefs[name];
  writeJson(CONFIG_PATH, cfg, true);
  const list = loadJobs();
  let removed = 0;
  const keep = [];
  for (const job of list) {
    if (job.project_id === name) {
      for (const out of job.outputs || []) {
        for (const f of [out.file_name, out.poster_name]) {
          if (f) { try { rmSync(join(FILES_DIR, f), { force: true }); } catch { /* ignore */ } }
        }
      }
      removed++;
    } else keep.push(job);
  }
  jobsCache = keep;
  scheduleWrite();
  // Purge this project's asset library (records + their files on disk).
  const assets = loadAssets();
  const keepAssets = [];
  for (const a of assets) {
    if (a.project_id === name) { try { rmSync(join(FILES_DIR, a.file_name), { force: true }); } catch { /* ignore */ } }
    else keepAssets.push(a);
  }
  assetsCache = keepAssets;
  writeAssets();
  return { projects: cfg.projects, archived: cfg.archivedProjects, removedJobs: removed };
}

// ---------------------------------------------------------------------------
// History (jobs) — kept in memory for fast reads at scale (thousands of jobs);
// the JSON file is the durable backing store, written back debounced so a burst
// of status updates during generation doesn't rewrite a large file each change.
// ---------------------------------------------------------------------------

let jobsCache = null;
let writeTimer = null;

function loadJobs() {
  if (jobsCache) return jobsCache;
  const arr = readJson(HISTORY_PATH, []);
  arr.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  jobsCache = arr;
  return jobsCache;
}

function scheduleWrite() {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    try { writeFileSync(HISTORY_PATH, JSON.stringify(jobsCache, null, 2)); } catch { /* best effort */ }
  }, 400);
}

// Flush pending writes synchronously (call on shutdown).
export function flushJobs() {
  if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
  if (jobsCache) { try { writeFileSync(HISTORY_PATH, JSON.stringify(jobsCache, null, 2)); } catch { /* ignore */ } }
}

// Paginated read. Returns { jobs, total } — never the whole history unless asked.
export function getJobs(projectId, opts = {}) {
  const { type, limit, offset } = opts;
  let list = loadJobs();
  if (projectId && projectId !== 'all') list = list.filter((j) => j.project_id === projectId);
  if (type) list = list.filter((j) => j.task === type);
  const total = list.length;
  const start = Number(offset) || 0;
  const jobs = limit != null ? list.slice(start, start + Number(limit)) : list.slice(start);
  return { jobs, total };
}

export function getJob(id) {
  return loadJobs().find((j) => j.job_id === id) || null;
}

export function putJob(job) {
  const list = loadJobs();
  const i = list.findIndex((j) => j.job_id === job.job_id);
  if (i >= 0) list[i] = job;      // status update in place
  else list.unshift(job);         // new job is newest → front
  scheduleWrite();
  return job;
}

export function deleteJob(id) {
  const list = loadJobs();
  const job = list.find((j) => j.job_id === id);
  if (!job) return false;
  // Delete the media AND its poster thumbnail on disk — no orphans.
  for (const out of job.outputs || []) {
    for (const name of [out.file_name, out.poster_name]) {
      if (name) { try { rmSync(join(FILES_DIR, name), { force: true }); } catch { /* ignore */ } }
    }
  }
  jobsCache = list.filter((j) => j.job_id !== id);
  scheduleWrite();
  return true;
}

// Generate a poster (first frame) for a video so galleries show a light image
// instead of mounting hundreds of <video> elements. Async so it never blocks
// the event loop. Returns the poster filename or null if ffmpeg isn't available.
export function makeVideoPoster(videoFileName) {
  const poster = `${videoFileName.replace(/\.[^.]+$/, '')}.poster.jpg`;
  return new Promise((resolve) => {
    try {
      const p = spawn('ffmpeg', [
        '-y', '-ss', '0.5', '-i', join(FILES_DIR, videoFileName),
        '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '4', join(FILES_DIR, poster),
      ], { stdio: 'ignore' });
      const to = setTimeout(() => { try { p.kill('SIGKILL'); } catch { /* */ } resolve(null); }, 25000);
      p.on('exit', (code) => { clearTimeout(to); resolve(code === 0 && existsSync(join(FILES_DIR, poster)) ? poster : null); });
      p.on('error', () => { clearTimeout(to); resolve(null); });
    } catch { resolve(null); }
  });
}

// Backfill posters for existing/imported videos that don't have one yet. Runs
// once at startup, one at a time so it never stalls the server.
export async function backfillPosters() {
  const list = loadJobs();
  let changed = 0;
  for (const job of list) {
    if (job.task !== 'video' || job.status !== 'done') continue;
    const out = job.outputs?.[0];
    if (!out || out.poster_name || !out.file_name) continue;
    if (!existsSync(join(FILES_DIR, out.file_name))) continue;
    const poster = await makeVideoPoster(out.file_name);
    if (poster) { out.poster_name = poster; out.poster_url = `/api/files/${poster}`; changed++; scheduleWrite(); }
  }
  return changed;
}

// ---------------------------------------------------------------------------
// Assets — a per-project library of reusable files: images/videos the person
// uploads, plus generations they (or the agent) promote. Each asset has tags so
// an agent can find the right reference later and pass its URL as an input_image.
// Asset files are COPIED into the files folder under an `asset_` name so their
// lifecycle is independent of the job that produced them.
// ---------------------------------------------------------------------------

let assetsCache = null;
function loadAssets() {
  if (assetsCache) return assetsCache;
  assetsCache = readJson(ASSETS_PATH, []);
  return assetsCache;
}
function writeAssets() {
  try { writeFileSync(ASSETS_PATH, JSON.stringify(assetsCache || [], null, 2)); } catch { /* best effort */ }
}

function normTags(tags) {
  const arr = Array.isArray(tags) ? tags : (tags == null ? [] : String(tags).split(','));
  return [...new Set(arr.map((t) => String(t).trim()).filter(Boolean))];
}

function typeOfName(name) {
  const ext = (String(name).match(/\.[a-z0-9]+$/i)?.[0] || '').toLowerCase();
  return ['.mp4', '.webm', '.mov'].includes(ext) ? 'video' : 'image';
}

// Write a base64 data URL to a new asset_ file. Returns { file_name, type }.
function writeDataUrlAsset(dataUrl) {
  const m = String(dataUrl).match(/^data:(image|video)\/([a-z0-9.+-]+);base64,(.*)$/i);
  if (!m) throw new Error('expected a base64 data URL');
  const kind = m[1].toLowerCase();
  const sub = m[2].toLowerCase();
  const ext = sub.includes('png') ? '.png' : sub.includes('webp') ? '.webp' : sub.includes('gif') ? '.gif'
    : sub.includes('mp4') ? '.mp4' : sub.includes('webm') ? '.webm' : kind === 'video' ? '.mp4' : '.jpg';
  const file_name = `asset_${randomUUID()}${ext}`;
  writeFileSync(join(FILES_DIR, file_name), Buffer.from(m[3], 'base64'));
  return { file_name, type: kind === 'video' ? 'video' : 'image' };
}

// Copy an existing files/ entry into a new asset_ file. Returns { file_name, type }.
function copyToAsset(srcName) {
  const ext = (String(srcName).match(/\.[a-z0-9]+$/i)?.[0] || '.png').toLowerCase();
  const file_name = `asset_${randomUUID()}${ext}`;
  copyFileSync(join(FILES_DIR, srcName), join(FILES_DIR, file_name));
  return { file_name, type: typeOfName(file_name) };
}

function pushAsset(a) {
  loadAssets().unshift(a);
  writeAssets();
  return a;
}

function baseAsset({ project, file_name, type, source, name, tags, prompt, from_job_id }) {
  return {
    asset_id: randomUUID(),
    project_id: project || 'default',
    file_name,
    type,
    source,                 // 'upload' | 'generated'
    name: name || '',
    tags: normTags(tags),
    prompt: prompt || '',
    from_job_id: from_job_id || null,
    created_at: new Date().toISOString(),
    local_url: `/api/files/${file_name}`,
  };
}

// Newest-first, optionally scoped to one project ('all' or falsy → every project).
export function getAssets(projectId) {
  const list = loadAssets();
  const arr = projectId && projectId !== 'all' ? list.filter((a) => a.project_id === projectId) : list.slice();
  arr.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  return arr;
}

export function addAssetFromUpload({ project, dataUrl, name, tags }) {
  const { file_name, type } = writeDataUrlAsset(dataUrl);
  return pushAsset(baseAsset({ project, file_name, type, source: 'upload', name, tags }));
}

export function addAssetFromJob({ project, job_id, name, tags }) {
  const job = getJob(job_id);
  if (!job) throw new Error(`unknown job ${job_id}`);
  const out = job.outputs?.[0];
  if (!out?.file_name) throw new Error('that job has no output file to save');
  const { file_name, type } = copyToAsset(out.file_name);
  return pushAsset(baseAsset({
    project: project || job.project_id, file_name, type, source: 'generated',
    name, tags, prompt: job.prompt, from_job_id: job_id,
  }));
}

// Promote by URL: a local /api/files/<name> (copied) or a public http(s) URL
// (downloaded first). Used by agents that have a result URL but not a job id.
export async function addAssetFromUrl({ project, url, name, tags }) {
  const local = String(url).match(/\/api\/files\/([^/?#]+)$/);
  let file_name; let type;
  if (local && existsSync(join(FILES_DIR, local[1]))) {
    ({ file_name, type } = copyToAsset(local[1]));
  } else if (/^https?:/i.test(url)) {
    const guessed = typeOfName(url);
    const dl = await downloadToFiles(url, guessed);
    file_name = dl; type = typeOfName(dl);
  } else {
    throw new Error('url must be a /api/files link or a public http(s) URL');
  }
  return pushAsset(baseAsset({ project, file_name, type, source: 'generated', name, tags }));
}

export function updateAsset(id, patch = {}) {
  const a = loadAssets().find((x) => x.asset_id === id);
  if (!a) throw new Error('unknown asset');
  if (patch.name != null) a.name = String(patch.name);
  if (patch.tags != null) a.tags = normTags(patch.tags);
  if (patch.project != null) a.project_id = String(patch.project);
  writeAssets();
  return a;
}

export function replaceAssetFile(id, dataUrl) {
  const a = loadAssets().find((x) => x.asset_id === id);
  if (!a) throw new Error('unknown asset');
  const { file_name, type } = writeDataUrlAsset(dataUrl);
  try { rmSync(join(FILES_DIR, a.file_name), { force: true }); } catch { /* ignore */ }
  a.file_name = file_name; a.type = type; a.local_url = `/api/files/${file_name}`;
  writeAssets();
  return a;
}

export function deleteAsset(id) {
  const list = loadAssets();
  const a = list.find((x) => x.asset_id === id);
  if (!a) return false;
  try { rmSync(join(FILES_DIR, a.file_name), { force: true }); } catch { /* ignore */ }
  assetsCache = list.filter((x) => x.asset_id !== id);
  writeAssets();
  return true;
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export function filesDir() {
  return FILES_DIR;
}

export function dataDir() {
  return DATA_DIR;
}

// Download a remote provider URL to the local files folder before its link
// expires, and return the stored file name. `headers` is passed to fetch for
// providers whose output URLs require auth (e.g. Oxen's hub.oxen.ai files).
export async function downloadToFiles(url, type, headers) {
  const ext = pickExt(url, type);
  const name = `${randomUUID()}${ext}`;
  const res = await fetch(url, headers ? { headers } : undefined);
  if (!res.ok) throw new Error(`download failed ${res.status}`);
  await new Promise((resolve, reject) => {
    const ws = createWriteStream(join(FILES_DIR, name));
    Readable.fromWeb(res.body).pipe(ws);
    ws.on('finish', resolve);
    ws.on('error', reject);
  });
  return name;
}

// Persist a base64 payload (e.g. OpenRouter image responses) to a local file.
export function saveBase64ToFiles(b64, type) {
  const ext = type === 'video' ? '.mp4' : '.png';
  const name = `${randomUUID()}${ext}`;
  writeFileSync(join(FILES_DIR, name), Buffer.from(b64, 'base64'));
  return name;
}

// Save an uploaded reference image (data URL or base64) and return its name.
export function saveUpload(dataUrl) {
  const m = String(dataUrl).match(/^data:(image|video)\/([a-z0-9.+-]+);base64,(.*)$/i);
  if (!m) throw new Error('expected a base64 data URL');
  const ext = m[2].includes('png') ? '.png' : m[2].includes('webp') ? '.webp'
    : m[2].includes('mp4') ? '.mp4' : '.jpg';
  const name = `ref_${randomUUID()}${ext}`;
  writeFileSync(join(FILES_DIR, name), Buffer.from(m[3], 'base64'));
  return name;
}

function pickExt(url, type) {
  const m = String(url).split('?')[0].match(/\.(png|jpe?g|webp|gif|mp4|webm|mov)$/i);
  if (m) return m[0].toLowerCase();
  return type === 'video' ? '.mp4' : '.png';
}

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.mp4': 'video/mp4', '.webm': 'video/webm',
};

// Turn a local reference URL (/api/files/<name>, possibly with a localhost host)
// into a base64 data URL by reading the file off disk. External providers can't
// fetch our localhost URLs, so references must be inlined. Non-local URLs (real
// public http(s)) and anything already a data: URL pass through unchanged.
export function localFileToDataUrl(url) {
  if (!url || /^data:/i.test(url)) return url;
  const m = String(url).match(/\/api\/files\/([^/?#]+)$/);
  if (!m) return url;
  const name = m[1];
  const path = join(FILES_DIR, name);
  if (!existsSync(path)) return url;
  const ext = (name.match(/\.[a-z0-9]+$/i)?.[0] || '.png').toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  const b64 = readFileSync(path).toString('base64');
  return `data:${mime};base64,${b64}`;
}

export { DATA_DIR };
