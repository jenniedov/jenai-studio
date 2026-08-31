// Self-update, Hermes-style. Checks the git remote, and on demand does a
// fast-forward-only pull → npm ci (only if the lockfile changed) → build →
// graceful restart, with a rollback to the previous commit. It never force-merges
// onto a dirty tree (a student can't resolve conflicts) and never touches the user
// data dir (~/.jenai-studio), so keys and user skills are safe.

import { execFileSync, spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BRANCH = process.env.JENAI_UPDATE_BRANCH || 'main';
let preUpdateSha = null; // for rollback

function git(args, opts = {}) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', timeout: 60000, ...opts }).trim();
}
function has(cmd, args) { try { execFileSync(cmd, args, { cwd: ROOT, stdio: 'ignore', timeout: 120000 }); return true; } catch { return false; } }

// Where does this checkout stand vs. the remote branch?
export function updateStatus() {
  let hasRemote = true;
  try { git(['remote', 'get-url', 'origin']); } catch { hasRemote = false; }
  if (!hasRemote) return { available: false, reason: 'no-remote', upToDate: true, current: safe(() => git(['rev-parse', '--short', 'HEAD'])) };
  try { git(['fetch', '--quiet', 'origin', BRANCH]); } catch { /* offline — report from cache */ }
  const current = safe(() => git(['rev-parse', 'HEAD']));
  const latest = safe(() => git(['rev-parse', `origin/${BRANCH}`]));
  const behind = Number(safe(() => git(['rev-list', '--count', `HEAD..origin/${BRANCH}`])) || 0);
  const ahead = Number(safe(() => git(['rev-list', '--count', `origin/${BRANCH}..HEAD`])) || 0);
  const dirty = Boolean(safe(() => git(['status', '--porcelain'])));
  const changelog = (safe(() => git(['log', '--pretty=%h %s', `HEAD..origin/${BRANCH}`])) || '')
    .split('\n').filter(Boolean).slice(0, 30);
  return {
    available: behind > 0, upToDate: behind === 0, behind, ahead, dirty,
    current: current?.slice(0, 7), latest: latest?.slice(0, 7), changelog,
    // A clean fast-forward is only possible if we haven't diverged.
    ffPossible: behind > 0 && ahead === 0 && !dirty, branch: BRANCH,
  };
}

// Pull (ff-only), reinstall deps if the lockfile changed, rebuild. Returns a
// summary; the caller schedules the restart. Throws with a clear message on any
// unsafe condition so nothing is half-applied silently.
export function applyUpdate() {
  const s = updateStatus();
  if (!s.available) return { applied: false, reason: s.reason || 'up-to-date', ...s };
  if (s.dirty) throw new Error('This copy has local changes — commit or discard them first (update refuses to overwrite your edits).');
  if (!s.ffPossible) throw new Error('Cannot fast-forward (the local branch has diverged). Resolve manually.');

  const from = git(['rev-parse', 'HEAD']);
  preUpdateSha = from;
  git(['pull', '--ff-only', 'origin', BRANCH], { timeout: 120000 });
  const to = git(['rev-parse', 'HEAD']);

  const changed = git(['diff', '--name-only', `${from}`, `${to}`]).split('\n');
  const steps = [];
  if (changed.includes('package-lock.json') || changed.includes('package.json')) {
    if (!has('npm', ['ci', '--no-audit', '--no-fund'])) throw new Error('npm ci failed — rolling back recommended.');
    steps.push('npm ci');
  }
  if (!has('npm', ['run', 'build'])) throw new Error('build failed — rolling back recommended.');
  steps.push('build');
  return { applied: true, from: from.slice(0, 7), to: to.slice(0, 7), steps, changelog: s.changelog };
}

// Roll back to the commit we were on before the last update, and rebuild.
export function rollbackUpdate() {
  if (!preUpdateSha) throw new Error('nothing to roll back to.');
  git(['reset', '--hard', preUpdateSha]);
  has('npm', ['run', 'build']);
  const at = git(['rev-parse', '--short', 'HEAD']);
  return { rolledBackTo: at };
}

// Best-effort graceful restart: launch a fresh server after this one exits, so
// the port is free. The new process runs detached (survives this one exiting).
export function scheduleRestart(delayMs = 600) {
  setTimeout(() => {
    try {
      spawn('sh', ['-c', `sleep 1; cd "${ROOT}" && exec node server/index.js`], { detached: true, stdio: 'ignore' }).unref();
    } catch { /* if this fails, the user restarts manually */ }
    process.exit(0);
  }, delayMs);
}

function safe(fn) { try { return fn(); } catch { return null; } }
