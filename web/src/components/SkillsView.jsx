import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.js';
import { useStudio } from '../lib/studio.jsx';
import { useDialog } from './Dialog.jsx';

// Browse every skill the agent can use (built-in + your own), and save your own.
// The list is the same one the MCP list_skills exposes, so the agent and this view
// always match.
export default function SkillsView() {
  const { t } = useStudio();
  const dialog = useDialog();
  const [skills, setSkills] = useState([]);
  const [sel, setSel] = useState(null);       // full selected skill
  const [editing, setEditing] = useState(null); // { name, description, body }

  const load = useCallback(async () => { const r = await api.skills(); setSkills(r.skills || []); }, []);
  useEffect(() => { load(); }, [load]);

  const openSkill = async (s) => { setEditing(null); setSel(await api.skill(s.id)); };
  const newSkill = () => { setSel(null); setEditing({ name: '', description: '', body: '' }); };
  const editSkill = () => setEditing({ name: sel.name, description: sel.description, body: stripFrontmatter(sel.body) });

  const save = async () => {
    if (!editing.name.trim()) return;
    const saved = await api.saveSkill(editing);
    setEditing(null); await load(); setSel(saved);
  };
  const remove = async () => {
    const ok = await dialog.confirm({ title: t('skills.deleteTitle'), body: t('skills.deleteBody', { name: sel.name }), danger: true, confirmText: t('projects.delete') });
    if (!ok) return;
    await api.deleteSkill(sel.id); setSel(null); await load();
  };

  return (
    <section className="view skills-view">
      <aside className="skills-list">
        <div className="skills-list-head">
          <h1 className="page-title">{t('nav.skills')}</h1>
          <button className="btn btn-accent" onClick={newSkill}>{t('skills.new')}</button>
        </div>
        <p className="projects-sub">{t('skills.subtitle')}</p>
        {skills.map((s) => (
          <button key={`${s.source}:${s.id}`} className={`skill-row ${sel?.id === s.id ? 'active' : ''}`} onClick={() => openSkill(s)}>
            <div className="skill-row-top">
              <strong>{s.name}</strong>
              <span className={`badge ${s.source === 'user' ? 'badge-ok' : 'badge-off'}`}>{s.source === 'user' ? t('skills.mine') : t('skills.builtin')}</span>
            </div>
            <div className="skill-row-desc">{s.description}</div>
          </button>
        ))}
      </aside>

      <div className="skills-detail">
        {editing ? (
          <div className="skill-editor">
            <input className="input" placeholder={t('skills.namePh')} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            <input className="input" placeholder={t('skills.descPh')} value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            <textarea className="v-prompt skill-body" dir="auto" placeholder={t('skills.bodyPh')} value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} />
            <div className="btn-row">
              <button className="btn btn-accent" onClick={save} disabled={!editing.name.trim()}>{t('onboarding.save')}</button>
              <button className="btn btn-ghost" onClick={() => setEditing(null)}>{t('common.cancel')}</button>
            </div>
          </div>
        ) : sel ? (
          <div className="skill-detail">
            <div className="skill-detail-head">
              <div>
                <h2>{sel.name}</h2>
                <div className="projects-sub">{sel.description}</div>
              </div>
              {sel.source === 'user' && (
                <div className="btn-row">
                  <button className="btn btn-ghost" onClick={editSkill}>✎ {t('skills.edit')}</button>
                  <button className="btn btn-ghost" onClick={remove}>{t('projects.delete')}</button>
                </div>
              )}
            </div>
            <pre className="skill-md">{sel.body}</pre>
          </div>
        ) : (
          <div className="empty">{t('skills.pick')}</div>
        )}
      </div>
    </section>
  );
}

function stripFrontmatter(md) {
  return String(md || '').replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
}
