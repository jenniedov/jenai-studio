import React, { useState } from 'react';
import { useStudio } from '../lib/studio.jsx';

// A copy-paste onboarding page for the student's coding agent: connect the MCP,
// then hand it the partner prompt (it reads intent — make a clear brief straight
// away, or run discovery when the student is unsure). The agent starts the studio
// itself, so there's no manual server step. Everything here is language-neutral.
export default function AgentView() {
  const { t } = useStudio();

  const CONNECT = 'npm run setup';
  const CLAUDE = 'claude mcp add jenai-studio -- node server/mcp/index.js';
  const CODEX = '[mcp_servers.jenai-studio]\ncommand = "node"\nargs = ["server/mcp/index.js"]';
  const ANTIGRAVITY = '{\n  "mcpServers": {\n    "jenai-studio": {\n      "command": "node",\n      "args": ["<full path>/server/mcp/index.js"]\n    }\n  }\n}';
  const GENERIC = 'command: node\nargs: ["server/mcp/index.js"]';
  const PROMPT = [
    'You have the "jenai-studio" MCP connected. You are my creative production partner —',
    'help me get to a finished image or video, not just call tools.',
    '',
    'How to work:',
    '1) Read the `creative-director` skill first (call the get_skill tool). It tells you',
    '   how to read my intent and how much to ask.',
    '   - If my request is concrete ("three images of a cat", "a 5s clip of waves"),',
    '     just make it — do NOT interview me. Read the `studio` skill and generate.',
    '   - If I am vague or unsure ("a video but no idea what", "something for my launch"),',
    '     run discovery: ask one structured question at a time (the `asking-the-user`',
    '     skill), propose a concept, then produce it in stages, pausing for my okay.',
    '2) create_project with a short name for what I am building; use it for everything this session.',
    '3) Generate into that project with generate_image / generate_video / edit_image.',
    '   - Call list_models / get_model_options to pick a model and valid options.',
    '   - Call estimate_cost and tell me the price (one line) before a paid batch. Do not block on it.',
    '4) Show me the result links. I watch them appear in the JenAI Studio browser tab.',
    '',
    'You do NOT need to start the studio — it launches on your first tool call.',
    '',
    'Here is what I want (or "help me figure out what to make"): <describe it, e.g.',
    '"10 launch images of a candle brand, warm minimalist" — or just "I want to make a video">',
  ].join('\n');

  const ALL = [
    'JenAI Studio — agent onboarding',
    '',
    'The agent starts the studio itself — you do NOT run any server.',
    '',
    '1) Set up once (installs deps + wires Claude Code + Codex):',
    `   ${CONNECT}`,
    '   Claude Code also auto-detects it: just open `claude` in this repo and approve.',
    `   Manual — Claude Code:  ${CLAUDE}`,
    `   Manual — Codex (~/.codex/config.toml):\n${CODEX.split('\n').map((l) => `     ${l}`).join('\n')}`,
    '   Manual — Antigravity (~/.gemini/config/mcp_config.json): add jenai-studio under "mcpServers".',
    '',
    '2) Give your agent this prompt:',
    '',
    PROMPT,
  ].join('\n');

  return (
    <section className="view agent-view">
      <div className="agent-inner">
        <div className="agent-head">
          <div>
            <h1 className="page-title">{t('agent.heading')}</h1>
            <p className="projects-sub">{t('agent.subtitle')}</p>
          </div>
          <CopyButton text={ALL} t={t} label={t('agent.copyAll')} primary />
        </div>

        <div className="agent-note">✨ {t('agent.note')}</div>

        <Step n="1" title={t('agent.connect')} desc={t('agent.connectDesc')}>
          <CodeBlock text={CONNECT} t={t} />
          <div className="agent-sub">{t('agent.connectManual')}</div>
          <div className="agent-mini">{t('agent.step2claude')}</div>
          <CodeBlock text={CLAUDE} t={t} />
          <div className="agent-mini">{t('agent.step2codex')}</div>
          <CodeBlock text={CODEX} t={t} />
          <div className="agent-mini">{t('agent.step2antigravity')}</div>
          <CodeBlock text={ANTIGRAVITY} t={t} />
          <div className="agent-mini">{t('agent.step2generic')}</div>
          <CodeBlock text={GENERIC} t={t} />
        </Step>

        <Step n="2" title={t('agent.prompt')} desc={t('agent.promptDesc')}>
          <CodeBlock text={PROMPT} t={t} big />
        </Step>

        <div className="agent-foot">{t('agent.toolsdesc')}</div>
      </div>
    </section>
  );
}

function Step({ n, title, desc, children }) {
  return (
    <div className="agent-step">
      <div className="agent-step-head"><span className="agent-step-n">{n}</span><div><strong>{title}</strong><div className="projects-sub">{desc}</div></div></div>
      <div className="agent-step-body">{children}</div>
    </div>
  );
}

function CodeBlock({ text, t, big }) {
  return (
    <div className={`agent-code ${big ? 'big' : ''}`}>
      <pre dir="ltr">{text}</pre>
      <div className="agent-code-bar"><span /><CopyButton text={text} t={t} /></div>
    </div>
  );
}

function CopyButton({ text, t, label, primary }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* clipboard blocked */ }
  };
  return (
    <button className={`btn ${primary ? 'btn-accent' : 'btn-ghost'} copy-mini`} onClick={copy}>
      ⧉ {done ? t('agent.copied') : (label || t('agent.copy'))}
    </button>
  );
}
