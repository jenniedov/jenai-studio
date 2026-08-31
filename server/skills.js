// Skills store. Built-in skills live in the repo (skill/); user skills live under
// the data dir (~/.jenai-studio/skills/) so they survive git updates and are never
// overwritten. Both the web Skills browser and the MCP list_skills/get_skill read
// through here, so the agent and the UI always see the identical set.

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataDir } from './storage/store.js';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUILTIN_DIR = join(REPO, 'skill');
const userDir = () => join(dataDir(), 'skills');

function parseFrontmatter(md) {
  const m = String(md).match(/^---\n([\s\S]*?)\n---/);
  const out = {};
  if (m) for (const line of m[1].split('\n')) { const i = line.indexOf(':'); if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
  return out;
}
function slug(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

export function listSkills() {
  const out = [];
  for (const [dir, source] of [[BUILTIN_DIR, 'built-in'], [userDir(), 'user']]) {
    if (!existsSync(dir)) continue;
    for (const id of readdirSync(dir)) {
      const p = join(dir, id, 'SKILL.md');
      if (!existsSync(p)) continue;
      const fm = parseFrontmatter(readFileSync(p, 'utf8'));
      out.push({ id, name: fm.name || id, description: fm.description || '', source });
    }
  }
  return out;
}

export function getSkill(id) {
  // User dir wins if a name collides, so a user can shadow a built-in.
  for (const [dir, source] of [[userDir(), 'user'], [BUILTIN_DIR, 'built-in']]) {
    const p = join(dir, id, 'SKILL.md');
    if (existsSync(p)) {
      const md = readFileSync(p, 'utf8');
      const fm = parseFrontmatter(md);
      return { id, name: fm.name || id, description: fm.description || '', source, body: md };
    }
  }
  return null;
}

export function saveUserSkill({ name, description, body }) {
  const id = slug(name);
  if (!id) throw new Error('a name is required');
  const dir = join(userDir(), id);
  mkdirSync(dir, { recursive: true });
  let md = String(body || '').trim();
  if (!/^---\n/.test(md)) {
    md = `---\nname: ${name}\ndescription: ${String(description || '').replace(/\n/g, ' ')}\n---\n\n${md}\n`;
  }
  writeFileSync(join(dir, 'SKILL.md'), md);
  return getSkill(id);
}

export function deleteUserSkill(id) {
  const dir = join(userDir(), id);
  if (!existsSync(join(dir, 'SKILL.md'))) throw new Error('not a user skill (built-in skills cannot be deleted)');
  rmSync(dir, { recursive: true, force: true });
  return { ok: true, id };
}
