import React from 'react';
import { useStudio } from '../lib/studio.jsx';

export default function TopNav({ onOpenSettings }) {
  const { config, t, view, setView, theme, setTheme, locale, setLocale, providers } = useStudio();
  const anyKey = providers.some((p) => p.hasKey);

  return (
    <nav className="nav">
      <div className="brand"><span className="dot" />{config.branding.logoText || config.branding.name}&nbsp;Studio</div>
      <div className="tabs">
        {['projects', 'images', 'videos', 'cinema', 'lipsync', 'audio', 'clipping', 'vibemotion', 'skills'].map((k) => (
          <button key={k} className={`tab ${view === k ? 'active' : ''}`} onClick={() => setView(k)}>{t(`nav.${k}`)}</button>
        ))}
      </div>
      <div className="nav-right">
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
