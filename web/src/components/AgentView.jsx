import React, { useState } from 'react';
import { useStudio } from '../lib/studio.jsx';

// The Agent tab, kept dead simple: one instruction, one thing to paste, one big
// copy button. The paste is self-contained — it tells the agent to set the MCP
// up itself (npm run setup wires Claude Code, Codex and Antigravity) and then be
// the person's creative partner — so students never touch NPM/MCP config. The
// per-agent manual config lives in an "advanced" disclosure, out of the way.
export default function AgentView() {
  const { t } = useStudio();

  // The one block a student pastes into a fresh Claude Code / Codex / Antigravity
  // session. Self-contained: set up, then act as the creative partner.
  const PROMPT = [
    'Set up the JenAI Studio agent, then help me create.',
    '',
    "Setup (do this first, once): in the jenai-studio folder run  npm run setup",
    '— it installs everything and connects the "jenai-studio" tools to Claude Code,',
    'Codex, and Antigravity. Then reconnect this session so the tools load. You do',
    'NOT run any server — the studio launches itself on your first tool call.',
    '',
    'Then be my creative production partner (not just a tool caller):',
    '- Read the `creative-director` skill first (get_skill) — it tells you how to',
    '  read my intent and how much to ask.',
    '- If I ask for something concrete ("three images of a cat"), just make it.',
    '- If I am vague ("a video but no idea what"), ask me ONE simple question at a',
    '  time, propose a concept, then produce it — pausing for my okay.',
    '- Put everything in a project I can watch in the JenAI Studio browser tab, and',
    '  show me the result links.',
    '',
    'When you are set up, ask me what I want to create.',
  ].join('\n');

  // Advanced: manual per-agent wiring, for anyone who would rather not run setup.
  const CLAUDE = 'claude mcp add jenai-studio -- node server/mcp/index.js';
  const CODEX = '[mcp_servers.jenai-studio]\ncommand = "node"\nargs = ["server/mcp/index.js"]';
  const ANTIGRAVITY = '{\n  "mcpServers": {\n    "jenai-studio": {\n      "command": "node",\n      "args": ["<full path>/server/mcp/index.js"]\n    }\n  }\n}';

  return (
    <section className="view agent-view">
      <div className="agent-inner agent-simple">
        <h1 className="page-title">{t('agent.heading')}</h1>
        <p className="agent-instruction">{t('agent.subtitle')}</p>

        <div className="agent-code big hero">
          <pre dir="ltr">{PROMPT}</pre>
          <div className="agent-code-bar">
            <span className="agent-code-hint">{t('agent.pasteHint')}</span>
            <CopyButton text={PROMPT} t={t} label={t('agent.copyPrompt')} primary big />
          </div>
        </div>

        <details className="agent-advanced">
          <summary>{t('agent.advanced')}</summary>
          <p className="agent-mini">{t('agent.advancedDesc')}</p>
          <div className="agent-mini">Claude Code</div>
          <CodeBlock text={CLAUDE} t={t} />
          <div className="agent-mini">Codex — ~/.codex/config.toml</div>
          <CodeBlock text={CODEX} t={t} />
          <div className="agent-mini">Antigravity — ~/.gemini/config/mcp_config.json</div>
          <CodeBlock text={ANTIGRAVITY} t={t} />
        </details>
      </div>
    </section>
  );
}

function CodeBlock({ text, t }) {
  return (
    <div className="agent-code">
      <pre dir="ltr">{text}</pre>
      <div className="agent-code-bar"><span /><CopyButton text={text} t={t} /></div>
    </div>
  );
}

function CopyButton({ text, t, label, primary, big }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* clipboard blocked */ }
  };
  return (
    <button className={`btn ${primary ? 'btn-accent' : 'btn-ghost'} copy-mini ${big ? 'copy-big' : ''}`} onClick={copy}>
      ⧉ {done ? t('agent.copied') : (label || t('agent.copy'))}
    </button>
  );
}
