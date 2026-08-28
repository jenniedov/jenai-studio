import React from 'react';
import { useStudio } from '../lib/studio.jsx';

// Clean scaffold for studios that aren't wired to a generator yet. Honest about
// what each will do and whether our current providers (Oxen/OpenRouter) can back it.
const INFO = {
  audio: { icon: '🎵', ready: true },
  cinema: { icon: '🎬', ready: false },
  lipsync: { icon: '👄', ready: false },
  clipping: { icon: '✂️', ready: false },
  vibemotion: { icon: '🌀', ready: true },
};

export default function StudioPlaceholder({ tab }) {
  const { t } = useStudio();
  const info = INFO[tab] || {};
  return (
    <section className="view placeholder-view">
      <div className="placeholder-card">
        <div className="placeholder-icon">{info.icon}</div>
        <h1>{t(`studios.${tab}.title`)}</h1>
        <p>{t(`studios.${tab}.desc`)}</p>
        <span className={`placeholder-badge ${info.ready ? 'soon' : 'blocked'}`}>
          {t(`studios.${tab}.status`)}
        </span>
      </div>
    </section>
  );
}
