import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useStudio } from '../lib/studio.jsx';
import { useDialog } from './Dialog.jsx';

export default function TopNav({ onOpenSettings }) {
  const { config, t, view, setView, theme, setTheme, locale, setLocale, providers } = useStudio();
  const dialog = useDialog();
  const anyKey = providers.some((p) => p.hasKey);
  const [upd, setUpd] = useState(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => { api.updateCheck().then(setUpd).catch(() => {}); }, []);

  const waitForHealthThenReload = async () => {
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      try { const res = await fetch('/api/health', { cache: 'no-store' }); if (res.ok) { window.location.reload(); return; } } catch { /* still down */ }
    }
    window.location.reload();
  };

  const runUpdate = async () => {
    if (updating) return;
    if (!upd?.available) {
      await dialog.confirm({ title: t('update.upToDate'), body: t('update.current', { sha: upd?.current || '—' }), confirmText: t('common.close'), cancelText: t('common.close') });
      return;
    }
    const ok = await dialog.confirm({
      title: t('update.title'),
      body: `${t('update.body', { n: upd.behind })}\n\n${(upd.changelog || []).slice(0, 8).join('\n')}`,
      confirmText: t('update.apply'), cancelText: t('common.cancel'),
    });
    if (!ok) return;
    setUpdating(true);
    try {
      const r = await api.updateApply();
      if (r.ok && r.applied) { await waitForHealthThenReload(); return; }
      setUpdating(false);
    } catch (e) {
      setUpdating(false);
      await dialog.confirm({ title: t('update.failed'), body: String(e.data?.error || e.message || e), confirmText: t('common.close'), cancelText: t('common.close') });
    }
  };

  return (
    <nav className="nav">
      <div className="brand"><span className="dot" />{config.branding.logoText || config.branding.name}&nbsp;Studio</div>
      <div className="tabs">
        {['projects', 'images', 'videos', 'cinema', 'lipsync', 'audio', 'clipping', 'vibemotion', 'skills'].map((k) => (
          <button key={k} className={`tab ${view === k ? 'active' : ''}`} onClick={() => setView(k)}>{t(`nav.${k}`)}</button>
        ))}
      </div>
      <div className="nav-right">
        <button className="chip-btn" onClick={runUpdate} disabled={updating} title={upd?.available ? t('update.available') : t('update.upToDate')}>
          {updating ? <>⟳ {t('update.updating')}</> : <><span className={upd?.available ? 'dotok' : ''} /> ⟳ {t('nav.update')}</>}
        </button>
        <button className="chip-btn" onClick={() => setLocale(locale === 'he' ? 'en' : 'he')}>
          {locale === 'he' ? 'EN' : 'עב'}
        </button>
        <button className="chip-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? '☾' : '☀'} {t('nav.theme')}
        </button>
        <button className="chip-btn" onClick={onOpenSettings}>
          <span className={anyKey ? 'dotok' : 'dotoff'} /> {t('nav.keys')}
        </button>
        <button className="avatar" onClick={onOpenSettings} title={t('nav.settings')} />
      </div>
    </nav>
  );
}
