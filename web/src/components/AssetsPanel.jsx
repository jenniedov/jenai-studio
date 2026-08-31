import React, { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../lib/api.js';
import { useStudio } from '../lib/studio.jsx';
import { useDialog } from './Dialog.jsx';

// Per-project asset library: reusable, taggable files (the person's uploads +
// promoted generations). The agent reads the same set over the MCP and uses an
// asset's URL as an input_image. Here the person can upload, tag, select,
// replace, download, and delete them.
const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = reject;
  r.readAsDataURL(file);
});

export default function AssetsPanel() {
  const { t, currentProject } = useStudio();
  const dialog = useDialog();
  const [assets, setAssets] = useState([]);
  const [selected, setSelected] = useState(null);   // asset_id
  const [draft, setDraft] = useState({ name: '', tags: '' });
  const [busy, setBusy] = useState(false);
  const uploadRef = useRef(null);
  const replaceRef = useRef(null);

  const project = currentProject && currentProject !== 'all' ? currentProject : null;

  const load = useCallback(async () => {
    if (!project) { setAssets([]); return; }
    try { const { assets: a } = await api.assets(project); setAssets(a || []); }
    catch { /* keep what we have */ }
  }, [project]);

  useEffect(() => { load(); }, [load]);
  // Refresh when a generation is promoted to an asset elsewhere (MediaCard).
  useEffect(() => {
    const onAssets = () => load();
    window.addEventListener('jenai:assets', onAssets);
    return () => window.removeEventListener('jenai:assets', onAssets);
  }, [load]);

  const sel = assets.find((a) => a.asset_id === selected) || null;
  const select = (a) => {
    setSelected(a.asset_id);
    setDraft({ name: a.name || '', tags: (a.tags || []).join(', ') });
  };

  const onUpload = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length || !project) return;
    setBusy(true);
    try {
      for (const f of files) {
        const dataUrl = await fileToDataUrl(f);
        await api.addAsset({ project, dataUrl, name: f.name.replace(/\.[^.]+$/, '') });
      }
      await load();
    } catch (err) { await dialog.alert?.({ title: String(err.message || err) }); }
    finally { setBusy(false); }
  };

  const saveMeta = async () => {
    if (!sel) return;
    setBusy(true);
    try {
      await api.updateAsset(sel.asset_id, { name: draft.name, tags: draft.tags });
      await load();
    } finally { setBusy(false); }
  };

  const onReplace = async (e) => {
    const f = (e.target.files || [])[0];
    e.target.value = '';
    if (!f || !sel) return;
    setBusy(true);
    try { await api.replaceAsset(sel.asset_id, await fileToDataUrl(f)); await load(); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    if (!sel) return;
    const ok = await dialog.confirm({ title: t('assets.deleteConfirm'), danger: true, confirmText: t('projects.delete') });
    if (!ok) return;
    setBusy(true);
    try { await api.deleteAsset(sel.asset_id); setSelected(null); await load(); }
    finally { setBusy(false); }
  };

  if (!project) return null;

  return (
    <div className="assets-panel">
      <div className="assets-head">
        <span className="assets-title">{t('assets.title')} {assets.length > 0 && <em>({assets.length})</em>}</span>
        <button className="btn btn-ghost copy-mini" disabled={busy} onClick={() => uploadRef.current?.click()}>
          ⬆ {t('assets.upload')}
        </button>
        <input ref={uploadRef} type="file" accept="image/*,video/*" multiple hidden onChange={onUpload} />
      </div>

      {assets.length === 0 ? (
        <div className="assets-empty">{t('assets.empty')}</div>
      ) : (
        <div className="assets-row">
          {assets.map((a) => (
            <button
              key={a.asset_id}
              className={`asset-card ${selected === a.asset_id ? 'sel' : ''}`}
              onClick={() => select(a)}
              title={a.name || a.prompt || ''}
            >
              <span className="asset-thumb">
                {a.type === 'video'
                  ? (<video src={a.local_url} muted playsInline preload="metadata" />)
                  : (<img src={a.local_url} alt={a.name || ''} loading="lazy" />)}
                <span className={`asset-src ${a.source}`}>{t(`assets.src.${a.source}`)}</span>
              </span>
              <span className="asset-name">{a.name || t('assets.untitled')}</span>
              {a.tags?.length > 0 && (
                <span className="asset-tags">{a.tags.slice(0, 3).map((tg) => <em key={tg}>{tg}</em>)}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {sel && (
        <div className="asset-editor">
          <div className="asset-editor-fields">
            <input
              className="asset-input" value={draft.name} placeholder={t('assets.namePlaceholder')}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
            <input
              className="asset-input" value={draft.tags} placeholder={t('assets.tagsPlaceholder')}
              onChange={(e) => setDraft((d) => ({ ...d, tags: e.target.value }))}
            />
          </div>
          <div className="asset-editor-actions">
            <button className="btn btn-accent copy-mini" disabled={busy} onClick={saveMeta}>{t('assets.save')}</button>
            <button className="btn btn-ghost copy-mini" disabled={busy} onClick={() => replaceRef.current?.click()}>⇄ {t('assets.replace')}</button>
            <a className="btn btn-ghost copy-mini" href={sel.local_url} download={sel.name || undefined}>⬇ {t('assets.download')}</a>
            <button className="btn btn-ghost copy-mini danger" disabled={busy} onClick={remove}>🗑 {t('assets.delete')}</button>
            <input ref={replaceRef} type="file" accept="image/*,video/*" hidden onChange={onReplace} />
          </div>
        </div>
      )}
    </div>
  );
}
