import React, { useState } from 'react';
import { useStudio } from '../lib/studio.jsx';

// A copy-paste onboarding page for the student's coding agent: how to connect to
// the jenai-studio MCP and how to drive it. Everything here is language-neutral
// code the student hands to Claude Code / Codex / any MCP agent.
export default function AgentView() {
  const { t } = useStudio();
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4317';

  const RUN = 'npm start';
  const CLAUDE = 'claude mcp add jenai-studio -- node server/mcp/index.js';
  const CODEX = '[mcp_servers.jenai-studio]\ncommand = "node"\nargs = ["server/mcp/index.js"]';
  const GENERIC = 'command: node\nargs: ["server/mcp/index.js"]';
  const PROMPT = [
    'You have the "jenai-studio" MCP connected — use it to create images and videos for me.',
    '',
    'How to work:',
    '1) Read the `studio` skill first (call the get_skill tool). It is your operating manual.',
    '2) create_project with a short name for what I am building; use it for everything this session.',
    '3) Generate into that project with generate_image / generate_video / edit_image.',
    '   - Call list_models / get_model_options to pick a model and valid options.',
    '   - Call estimate_cost and tell me the price (one line). Do not block on it.',
    '4) Show me the result links. I watch them appear in the JenAI Studio browser tab.',
    '',
    'Now, here is what I want you to make: <describe it — e.g. "10 launch images of a candle brand, warm minimalist">',
  ].join('\n');

  const ALL = [
    `JenAI Studio — agent onboarding`,
    ``,
    `1) Start the studio (keep it running): ${RUN}   → ${origin}`,
    ``,
    `2) Connect the MCP:`,
    `   Claude Code (run in the repo folder):`,
    `     ${CLAUDE}`,
    `   or just open \`claude\` in the repo — .mcp.json registers it automatically.`,
    ``,
    `   Codex (~/.codex/config.toml):`,
    CODEX.split('\n').map((l) => `     ${l}`).join('\n'),
    ``,
    `   Any MCP client:`,
    GENERIC.split('\n').map((l) => `     ${l}`).join('\n'),
    ``,
    `3) Give your agent this prompt:`,
    ``,
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

        <Step n="1" title={t('agent.step1')} desc={t('agent.step1desc')}>
          <CodeBlock text={RUN} t={t} note={origin} />
        </Step>

        <Step n="2" title={t('agent.step2')} desc={t('agent.step2desc')}>
          <div className="agent-sub">{t('agent.step2claude')}</div>
          <CodeBlock text={CLAUDE} t={t} />
          <div className="agent-sub">{t('agent.step2codex')}</div>
          <CodeBlock text={CODEX} t={t} />
          <div className="agent-sub">{t('agent.step2generic')}</div>
          <CodeBlock text={GENERIC} t={t} />
        </Step>

        <Step n="3" title={t('agent.step3')} desc={t('agent.step3desc')}>
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

function CodeBlock({ text, t, note, big }) {
  return (
    <div className={`agent-code ${big ? 'big' : ''}`}>
      <pre dir="ltr">{text}</pre>
      <div className="agent-code-bar">
        {note && <a className="link" href={note} target="_blank" rel="noreferrer">{note} ↗</a>}
        <CopyButton text={text} t={t} />
      </div>
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
