#!/usr/bin/env node
// Wire the jenai-studio MCP into the coding agents on this machine, so nobody has
// to hand-edit configs. Idempotent. Run: npm run connect
//
// - Claude Code: `claude mcp add` (though opening `claude` in this repo already
//   auto-detects .mcp.json — this just makes it available from anywhere).
// - Codex: appends an [mcp_servers.jenai-studio] block to ~/.codex/config.toml.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const MCP = join(REPO, 'server', 'mcp', 'index.js');
const done = [];

// --- Claude Code ---
try {
  execFileSync('claude', ['mcp', 'add', 'jenai-studio', '--', 'node', MCP], { stdio: 'ignore' });
  done.push('Claude Code (claude mcp add)');
} catch {
  // claude not installed, or the server is already registered — both fine.
}

// --- Codex (~/.codex/config.toml) ---
try {
  const cfg = join(homedir(), '.codex', 'config.toml');
  const toml = existsSync(cfg) ? readFileSync(cfg, 'utf8') : '';
  if (/\[mcp_servers\.jenai-studio\]/.test(toml)) {
    done.push('Codex (already configured)');
  } else {
    mkdirSync(dirname(cfg), { recursive: true });
    writeFileSync(cfg, `${toml}\n[mcp_servers.jenai-studio]\ncommand = "node"\nargs = ["${MCP}"]\n`);
    done.push('Codex (~/.codex/config.toml)');
  }
} catch { /* leave Codex to manual setup if the write fails */ }

if (done.length) {
  console.log(`✓ Connected the jenai-studio MCP: ${done.join(', ')}`);
} else {
  console.log('No supported agent CLI was wired automatically.');
  console.log('Claude Code: just open `claude` in this repo and approve the MCP (it reads .mcp.json).');
  console.log('Otherwise see the Agent tab in the studio for manual steps.');
}
console.log('\nYou do NOT need to start the studio — the agent starts it for you on the first request.');
console.log('Now just tell your agent what to create.');
