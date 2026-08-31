#!/usr/bin/env node
// One-shot setup after cloning: install dependencies and wire the MCP into the
// coding agents on this machine. A student (or the agent that cloned the repo)
// runs `npm run setup` once — nothing else. They never touch npm/MCP by hand.
//
// It does NOT start the studio — the agent launches it on the first request.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, args) => execFileSync(cmd, args, { cwd: REPO, stdio: 'inherit' });

console.log('\n▶ Installing dependencies…');
run('npm', ['install', '--no-audit', '--no-fund']);

console.log('\n▶ Connecting the MCP to your agents (Claude Code, Codex)…');
run('node', [join(REPO, 'scripts', 'connect.mjs')]);

// Report provider-key status (never prints the keys themselves).
let providers = [];
try {
  const cfg = JSON.parse(readFileSync(join(homedir(), '.jenai-studio', 'config.json'), 'utf8'));
  providers = Object.keys(cfg.keys || {}).filter((k) => ['kie', 'oxen', 'openrouter'].includes(k));
} catch { /* no config yet */ }

console.log('\n✓ Setup complete — you did not have to touch npm or MCP config.');
if (providers.length) {
  console.log(`  Provider keys found: ${providers.join(', ')}.`);
} else {
  console.log('  No provider API key yet — add one when the studio opens (Settings),');
  console.log('  or grab a free one: Oxen (oxen.ai) or Kie (kie.ai).');
}
console.log('  You do NOT need to start the studio — your agent launches it on the first request.');
console.log('  Now just open your agent in this folder and tell it what to create.\n');
