import React, { useState } from 'react';

// Two steps: the friendly explanation, then a single button that copies the
// ready-to-paste hand-off text (prompt + technical details) for a coding agent.
export default function ErrorModal({ t, job, onClose }) {
  const [step, setStep] = useState('explain');
  const [copied, setCopied] = useState(false);

  const locale = document.documentElement.lang === 'en' ? 'en' : 'he';
  const err = job.error || {};
  const friendly = (err.friendly && err.friendly[locale]) || {
    title: t('error.tile'), body: '', action: t('error.tile'), claudePrompt: '',
  };

  // Everything the coding agent needs, in one copy — prompt AND technical details.
  const tech = [
    `provider: ${err.provider || job.provider || ''}`,
    `model: ${err.model || job.model || ''}`,
    `code: ${err.code || ''}`,
    err.status != null ? `status: ${err.status}` : null,
    err.raw != null ? `raw: ${typeof err.raw === 'string' ? err.raw : JSON.stringify(err.raw)}` : null,
  ].filter(Boolean).join('\n');
  const fullCopy = `${friendly.claudePrompt}\n\n--- Technical details ---\n${tech}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fullCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked; nothing else to do */ }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-shell" />
        <div className="modal-body">
          {step === 'explain' ? (
            <>
              <h2>{friendly.title}</h2>
              <p>{friendly.body}</p>
              <div className="modal-actions">
                <button className="btn btn-accent" onClick={() => setStep('copy')}>
                  {friendly.action}
                </button>
                <button className="btn btn-ghost" onClick={onClose}>{t('common.close')}</button>
              </div>
            </>
          ) : (
            <>
              <h2>{friendly.title}</h2>
              <button className="btn btn-accent" style={{ width: '100%', padding: '16px' }} onClick={copy}>
                {copied ? `${t('error.copied')} ✓` : t('error.copyButton')}
              </button>
              <p style={{ margin: '16px 0 0' }}>{t('error.gotoAgent')}</p>
              <div className="modal-actions" style={{ marginTop: 18 }}>
                <button className="btn btn-ghost" onClick={onClose}>{t('common.close')}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
