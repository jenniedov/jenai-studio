import React from 'react';
import { useAnchoredMenu } from '../lib/studio.jsx';

// A pill-styled dropdown: shows `value`, opens a small menu of `options`.
// options: [{ value, label }]. icon: optional leading glyph (string).
// renderIcon(value): optional node rendered before the label (trigger + options)
//   — used for the ratio-shaped aspect icons.
export default function PillSelect({ value, options, onChange, placement = 'top', icon, renderIcon, disabled }) {
  const { open, setOpen, anchorRef, menuRef, pos } = useAnchoredMenu(placement);
  const current = options.find((o) => o.value === value);

  return (
    <>
      <button
        ref={anchorRef}
        className="ctrl"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        {renderIcon ? renderIcon(value) : (icon && <span>{icon}</span>)}
        {current?.label ?? value}
        <span className="chev">▾</span>
      </button>
      {open && (
        <div ref={menuRef} className="pillmenu" style={{ left: pos.left, top: pos.top }}>
          {options.map((o) => (
            <button
              key={o.value}
              className={o.value === value ? 'active' : ''}
              onClick={() => { onChange(o.value); setOpen(false); }}
            >
              {renderIcon && (
                <span style={{ display: 'inline-flex', verticalAlign: 'middle', marginInlineEnd: 8 }}>
                  {renderIcon(o.value)}
                </span>
              )}
              {o.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
