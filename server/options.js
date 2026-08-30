// The option schema layer. The front end sends a single, provider-agnostic
// request with a generic `options` bag; this module is the deterministic middle
// layer that (a) declares what options each model supports and (b) maps each
// option to the right provider field. Adding a new option is then config-only
// (models.json) — no front-end or adapter changes.
//
// Built-in options (aspect_ratio / resolution / duration / generate_audio) are
// DERIVED from the model's existing fields so we don't have to spell them out on
// every model. Custom, model-specific options (e.g. FLUX seed, Kling
// negative_prompt) are declared in a model's `options` array with a per-provider
// `map`, and applied generically by applyCustomOptions().

const PREF_ASPECT = { image: ['1:1', '16:9', '4:3'], video: ['16:9', '9:16', '1:1'] };

// The full, ordered option schema for a model — what the UI renders and the
// mapper reads. Built-ins first, then the model's custom options.
export function optionSchema(model) {
  if (!model) return [];
  const isVideo = model.type === 'video';
  const out = [];

  if (model.aspectRatios?.length) {
    const pref = (PREF_ASPECT[model.type] || PREF_ASPECT.image).find((r) => model.aspectRatios.includes(r));
    out.push({ key: 'aspect_ratio', type: 'enum', ui: 'aspect', values: model.aspectRatios, default: pref || model.aspectRatios[0], i18n: 'prompt.aspect' });
  }
  if (model.resolutions?.length) {
    out.push({ key: 'resolution', type: 'enum', ui: 'pill', icon: '◈', values: model.resolutions, default: model.resolutions[0], i18n: 'prompt.resolution' });
  }
  if (isVideo && model.durations?.length) {
    out.push({ key: 'duration', type: 'enum', ui: 'pill', icon: '◷', suffix: 's', values: model.durations, default: model.durations[0], i18n: 'prompt.duration' });
  }
  if (isVideo && model.audio) {
    out.push({ key: 'generate_audio', type: 'bool', ui: 'toggle', default: true, i18n: 'prompt.audio' });
  }
  for (const c of model.options || []) out.push(c);
  return out;
}

// The built-in keys the adapters already understand as top-level req fields.
const BUILTIN = new Set(['aspect_ratio', 'resolution', 'duration', 'generate_audio']);

// Normalize an incoming request's options: prefer req.options, fold in any
// legacy top-level fields, and mirror the built-ins back onto req so existing
// adapter code (which reads req.aspect_ratio etc.) keeps working unchanged.
export function normalizeOptions(req) {
  const opt = (req.options && typeof req.options === 'object') ? { ...req.options } : {};
  if (opt.aspect_ratio == null && req.aspect_ratio != null) opt.aspect_ratio = req.aspect_ratio;
  if (opt.resolution == null && req.resolution != null) opt.resolution = req.resolution;
  if (opt.duration == null && req.duration_seconds != null) opt.duration = req.duration_seconds;
  if (opt.generate_audio == null && req.generate_audio != null) opt.generate_audio = req.generate_audio;
  req.options = opt;
  req.aspect_ratio = opt.aspect_ratio;
  req.resolution = opt.resolution;
  req.duration_seconds = opt.duration;
  req.generate_audio = opt.generate_audio;
  return opt;
}

function coerce(v, type) {
  if (type === 'int') { const n = parseInt(v, 10); return Number.isFinite(n) ? n : undefined; }
  if (type === 'number') { const n = Number(v); return Number.isFinite(n) ? n : undefined; }
  if (type === 'bool') return Boolean(v);
  return v;
}

function setPath(obj, path, val) {
  const parts = String(path).split('.');
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) { o[parts[i]] = o[parts[i]] || {}; o = o[parts[i]]; }
  o[parts[parts.length - 1]] = val;
}

// Apply a model's CUSTOM options onto a provider payload, using each option's
// per-provider `map`. Built-ins are handled by the adapters themselves. This is
// what makes a new option in models.json flow to the provider with no code edit.
export function applyCustomOptions(payload, model, providerId, options = {}) {
  for (const c of model?.options || []) {
    if (BUILTIN.has(c.key)) continue;
    const field = c.map?.[providerId];
    if (!field) continue;
    const raw = options[c.key];
    if (raw === undefined || raw === null || raw === '') continue;
    const val = coerce(raw, c.type);
    if (val === undefined) continue;
    setPath(payload, field, val);
  }
  return payload;
}
