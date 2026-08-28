// Local, on-disk storage. Everything lives under a single data dir on the
// user's machine (default ~/.jenai-studio). No database, no telemetry — just
// JSON files and a folder of generated media.

import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync,
  rmSync, createWriteStream,
} from 'node:fs';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

const DATA_DIR = process.env.JENAI_DATA_DIR || join(homedir(), '.jenai-studio');
const FILES_DIR = join(DATA_DIR, 'files');
const CONFIG_PATH = join(DATA_DIR, 'config.json');
const HISTORY_PATH = join(DATA_DIR, 'history.json');

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

export function saveSettings(patch) {
  const cfg = getConfig();
  cfg.settings = { ...cfg.settings, ...patch };
  writeJson(CONFIG_PATH, cfg, true);
  return cfg.settings;
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export function getProjects() {
  return getConfig().projects || ['default'];
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

// Delete a project AND every job in it (media + posters removed from disk).
export function deleteProject(name) {
  const cfg = getConfig();
  cfg.projects = (cfg.projects || []).filter((n) => n !== name);
  cfg.archivedProjects = (cfg.archivedProjects || []).filter((n) => n !== name);
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

export { DATA_DIR };
