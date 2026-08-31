import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.js';
import { useStudio } from '../lib/studio.jsx';

// A per-project brief: free-text notes (what this project is, brand colors, style,
// how the person likes things). The agent reads it on entry and can update it, so
// it's the studio's own portable per-project memory — visible and editable here.
export default function ProjectBrief() {
  const { t, currentProject } = useStudio();
  const [brief, setBrief] = useState('');
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const project = currentProject && currentProject !== 'all' ? currentProject : null;

  const load = useCallback(async () => {
    if (!project) return;
    try { const { brief: b } = await api.projectBrief(project); setBrief(b || ''); setDraft(b || ''); setOpen(Boolean(b)); }
    catch { /* keep */ }
  }, [project]);

  useEffect(() => { load(); }, [load]);
  // The agent may update the brief while the person watches — refresh on nudge.
  useEffect(() => {
    const on = () => load();
    window.addEventListener('jenai:brief', on);
    return () => window.removeEventListener('jenai:brief', on);
  }, [load]);

  if (!project) return null;
  const dirty = draft !== brief;

  const save = async () => {
    setSaving(true);
    try { const { brief: b } = await api.setProjectBrief(project, draft); setBrief(b || ''); setDraft(b || ''); }
    finally { setSaving(false); }
  };

  return (
    <div className="project-brief">
      <button className="brief-head" onClick={() => setOpen((o) => !o)}>
        <span className={`brief-caret ${open ? 'open' : ''}`}>▸</span>
        <span className="brief-title">{t('brief.title')}</span>
        {!open && brief && <span className="brief-peek">{brief.slice(0, 80)}{brief.length > 80 ? '…' : ''}</span>}
        {!open && !brief && <span className="brief-empty-hint">{t('brief.emptyHint')}</span>}
      </button>
      {open && (
        <div className="brief-body">
          <textarea
            className="brief-textarea"
            value={draft}
            placeholder={t('brief.placeholder')}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
          />
          <div className="brief-actions">
            <span className="brief-note">{t('brief.note')}</span>
            <button className="btn btn-accent copy-mini" disabled={!dirty || saving} onClick={save}>
              {saving ? t('brief.saving') : t('brief.save')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
