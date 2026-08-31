import React, { useState } from 'react';
import { useStudio } from '../lib/studio.jsx';

// The Agent tab: TWO paste blocks.
// Step 1 — one-time setup: paste into a Claude Code / Codex / Antigravity session;
//          the agent installs + wires the MCP and says when it's done.
// Step 2 — the everyday prompt: paste into EVERY new session to start creating.
// Manual per-agent config stays tucked in an "advanced" disclosure.
export default function AgentView() {
  const { t } = useStudio();

  const SETUP = [
    'Set up JenAI Studio for me (one-time setup).',
    '',
    'In the jenai-studio folder, run:  npm run setup',
    'It installs the dependencies and connects the "jenai-studio" MCP tools to',
    'Claude Code, Codex, and Antigravity. If anything fails, fix it and re-run.',
    'Do NOT start any server — the studio launches itself later, on demand.',
    '',
    'When it finishes successfully, tell me clearly:',
    '"Setup is done ✅ — open a NEW session and paste the second prompt from the',
    'Agent tab to start creating."',
  ].join('\n');

  const SESSION = [
    'You have the "jenai-studio" MCP tools. Be my creative production partner —',
    'help me get to a finished image or video, not just call tools.',
    '',
    '- Read the `creative-director` skill first (get_skill) — it tells you how to',
    '  read my intent and how much to ask.',
    '- If I ask for something concrete ("three images of a cat"), just make it.',
    '- If I am vague ("a video but no idea what"), ask me ONE simple question at a',
    '  time, propose a concept, then produce it — pausing for my okay.',
    '- Put everything in a project I can watch in the JenAI Studio browser tab,',
    '  and show me the result links.',
    '- You do NOT need to start the studio — it launches on your first tool call.',
    '',
    'Now ask me what I want to create.',
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

        <div className="agent-step2">
          <div className="agent-step2-head">
            <span className="agent-step-n">1</span>
            <div>
              <strong>{t('agent.setupTitle')}</strong>
              <div className="projects-sub">{t('agent.setupDesc')}</div>
            </div>
          </div>
          <div className="agent-code big hero">
            <pre dir="ltr">{SETUP}</pre>
            <div className="agent-code-bar">
              <span className="agent-code-hint">{t('agent.pasteHint')}</span>
              <CopyButton text={SETUP} t={t} label={t('agent.copySetup')} primary big />
            </div>
          </div>
        </div>

        <div className="agent-step2">
          <div className="agent-step2-head">
            <span className="agent-step-n">2</span>
            <div>
              <strong>{t('agent.sessionTitle')}</strong>
              <div className="projects-sub">{t('agent.sessionDesc')}</div>
            </div>
          </div>
          <div className="agent-code big hero">
            <pre dir="ltr">{SESSION}</pre>
            <div className="agent-code-bar">
              <span className="agent-code-hint">{t('agent.pasteHint')}</span>
              <CopyButton text={SESSION} t={t} label={t('agent.copySession')} primary big />
            </div>
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
