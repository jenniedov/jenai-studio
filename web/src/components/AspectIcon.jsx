import React from 'react';

// A tiny rectangle drawn to the actual proportions of an aspect ratio.
// 16:9 → wide, 9:16 → tall, 1:1 → square, 21:9 → very wide, etc.
export default function AspectIcon({ ratio }) {
  const parts = String(ratio).split(':').map(Number);
  const w = parts[0] || 1;
  const h = parts[1] || 1;
  const MAX = 15;
  let bw; let bh;
  if (w >= h) { bw = MAX; bh = Math.max(5, Math.round((MAX * h) / w)); }
  else { bh = MAX; bw = Math.max(5, Math.round((MAX * w) / h)); }
  return (
    <span style={{ display: 'inline-flex', width: 17, height: 17, alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
      <span style={{ width: bw, height: bh, border: '1.5px solid currentColor', borderRadius: 2, opacity: 0.85 }} />
    </span>
  );
}
