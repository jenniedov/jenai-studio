// Cinematic "look" catalogue for the Cinema studio. Each category is a list of
// { label, token } — the token is the phrase appended to the prompt. Composing
// a look turns a plain scene into a shot with a camera body, lens, stop, film
// stock, lighting and grade. (Our own structure; film terms are standard.)

export const LOOKS = {
  camera: [
    { label: 'None', token: '' },
    { label: '8K Digital Cine', token: 'shot on a modular 8K digital cinema camera' },
    { label: 'Full-Frame Cine', token: 'shot on a full-frame digital cinema camera' },
    { label: '70mm Film', token: 'shot on a 70mm large-format film camera' },
    { label: 'Super 35 Digital', token: 'shot on a Super 35 studio digital camera' },
    { label: '16mm Film', token: 'shot on a classic 16mm film camera' },
    { label: 'Handheld DSLR', token: 'shot handheld on a DSLR' },
    { label: '2000s Camcorder', token: 'shot on an early-2000s consumer camcorder' },
  ],
  lens: [
    { label: 'None', token: '' },
    { label: 'Anamorphic', token: 'anamorphic lens with oval bokeh' },
    { label: 'Vintage Prime', token: 'vintage cinema prime lens' },
    { label: '70s Cine Prime', token: '1970s cinema prime lens' },
    { label: 'Modern Prime', token: 'crisp modern prime lens' },
    { label: 'Macro', token: 'extreme macro lens' },
    { label: 'Tilt-Shift', token: 'tilt-shift lens' },
    { label: 'Swirl Bokeh', token: 'swirl-bokeh portrait lens' },
    { label: 'Halation Diffusion', token: 'halation diffusion filter' },
  ],
  focal: [
    { label: '—', token: '' },
    { label: '14mm', token: '14mm ultra-wide perspective' },
    { label: '24mm', token: '24mm wide-angle perspective' },
    { label: '35mm', token: '35mm natural cinematic perspective' },
    { label: '50mm', token: '50mm standard perspective' },
    { label: '85mm', token: '85mm portrait perspective' },
    { label: '135mm', token: '135mm long-lens compression' },
  ],
  aperture: [
    { label: '—', token: '' },
    { label: 'f/1.4', token: 'f/1.4, shallow depth of field with creamy bokeh' },
    { label: 'f/2', token: 'f/2, shallow depth of field' },
    { label: 'f/4', token: 'f/4, balanced depth of field' },
    { label: 'f/8', token: 'f/8, mostly deep focus' },
    { label: 'f/11', token: 'f/11, deep focus, sharp front to back' },
  ],
  stock: [
    { label: 'None', token: '' },
    { label: 'Vision3 500T', token: 'Kodak Vision3 500T film grain' },
    { label: 'Portra 400', token: 'Kodak Portra 400 film grain' },
    { label: 'Gold 200', token: 'Kodak Gold 200 warm film grain' },
    { label: 'CineStill 800T', token: 'CineStill 800T grain with halation' },
    { label: 'HP5 B&W', token: 'Ilford HP5 black-and-white grain' },
    { label: 'Home Video', token: 'early-2000s home-video compression and digital noise' },
  ],
  lighting: [
    { label: 'None', token: '' },
    { label: 'Golden Hour', token: 'low golden-hour sun with warm rim light' },
    { label: 'Blue Hour', token: 'cold blue pre-dawn light' },
    { label: 'Window Shaft', token: 'a single warm window shaft, the rest falling to near-black' },
    { label: 'Soft Overcast', token: 'soft flat overcast daylight' },
    { label: 'Practical Lamp', token: 'a dim warm practical lamp as the only source' },
    { label: 'Screen Glow', token: 'cool screen glow lighting the face from below' },
    { label: 'Harsh Midday', token: 'harsh overhead midday sun with hard shadows' },
  ],
  grade: [
    { label: 'None', token: '' },
    { label: 'Cool Desaturated', token: 'desaturated cool grade, teal-grey shadows, low contrast' },
    { label: 'Warm Faded', token: 'warm faded grade with lifted blacks' },
    { label: 'Natural Muted', token: 'muted natural colour, low contrast' },
    { label: 'High Contrast', token: 'high-contrast grade with deep blacks' },
    { label: 'Bleach Bypass', token: 'bleach-bypass look, desaturated with crushed blacks' },
  ],
};

export const LOOK_CATEGORIES = [
  ['camera', 'Camera'], ['lens', 'Lens'], ['focal', 'Focal'], ['aperture', 'Aperture'],
  ['stock', 'Stock'], ['lighting', 'Lighting'], ['grade', 'Grade'],
];

export const DEFAULT_LOOK = {
  camera: 'None', lens: 'None', focal: '—', aperture: '—', stock: 'None', lighting: 'None', grade: 'None',
};

// Turn a selection into the phrase appended to the prompt.
export function lookSuffix(sel = {}) {
  const parts = [];
  for (const [key] of LOOK_CATEGORIES) {
    const opt = LOOKS[key]?.find((o) => o.label === sel[key]);
    if (opt?.token) parts.push(opt.token);
  }
  return parts.join(', ');
}

// Compose the final prompt (unchanged if nothing is selected).
export function applyLook(prompt, sel) {
  const suffix = lookSuffix(sel);
  if (!suffix) return prompt;
  const base = (prompt || '').trim().replace(/[.\s]+$/, '');
  return `${base}. ${suffix}.`;
}
