import React from 'react';
import { useAnchoredMenu, availableProviders } from '../lib/studio.jsx';

// Shared model selector. `variant` = 'pill' (Images prompt bar) or 'row' (Videos panel).
export default function ModelPicker({ models, providers, value, onPick, kind, variant = 'pill', placement, t }) {
  const place = placement || (variant === 'pill' ? 'top' : 'bottom');
  const { open, setOpen, anchorRef, menuRef, pos } = useAnchoredMenu(place);
  const current = models.find((m) => m.key === value) || models[0];

  const trigger = variant === 'pill' ? (
    <button ref={anchorRef} className="ctrl model" onClick={() => setOpen((v) => !v)}>
      <span className="mi" />
      <span>{current?.label}</span>
      <span className="chev">▾</span>
    </button>
  ) : (
    <div ref={anchorRef} className="modelrow" onClick={() => setOpen((v) => !v)}>
      <div>
        <div className="lab">{t ? t('videos.model') : 'Model'}</div>
        <div className="val"><span className="mi" style={{ display: 'inline-block' }} /> {current?.label}</div>
      </div>
      <span className="chev">›</span>
    </div>
  );

  return (
    <>
      {trigger}
      {open && (
        <div ref={menuRef} className="modelmenu" style={{ left: pos.left, top: pos.top }}>
          <div className="mm-head">{kind === 'image' ? 'IMAGE MODELS' : 'VIDEO MODELS'}</div>
          {models.map((m, i) => {
            const canServe = availableProviders(m, providers).length > 0;
            return (
              <div
                key={m.key}
                className="mrow"
                onClick={() => { onPick(m.key); setOpen(false); }}
                style={canServe ? undefined : { opacity: 0.55 }}
              >
                <div className="ic" style={{ background: `linear-gradient(135deg, ${GRAD[i % GRAD.length]})` }} />
                <div>
                  <div className="nm">
                    {m.label}
                    {m.tag && <span className={`tag ${m.tag}`}>{m.tag.toUpperCase()}</span>}
                  </div>
                  {m.blurb && <div className="ds">{m.blurb}</div>}
                  {!canServe && <div className="off">{t ? t('prompt.noProvider') : 'no provider'}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

const GRAD = [
  '#E93D82,#F26A1B', '#F26A1B,#F6B300', '#C6208A,#E93D82', '#F6B300,#E8A400',
  '#E93D82,#C6208A', '#F26A1B,#E93D82', '#E8A400,#F26A1B', '#C6208A,#F6B300',
];
