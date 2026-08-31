import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { api } from './api.js';
import { makeT, isRtl } from './i18n.js';

const Ctx = createContext(null);
export const useStudio = () => useContext(Ctx);

const LOCALE_KEY = 'jenai.locale';
const THEME_KEY = 'jenai.theme';
const VIEW_KEY = 'jenai.view';
const PROJECT_KEY = 'jenai.project';

// Does this model route to OpenAI on OpenRouter? Those endpoints only work when
// the account's OpenRouter data policy allows them (a per-account setting we
// can't set from here) — so we only surface them once verified to actually work.
export function needsOpenrouterDataSharing(model) {
  return /^openai\//.test(model?.providers?.openrouter || '');
}

// Providers that have a slug for this model. `openrouterOpenaiOk` gates the
// OpenAI-on-OpenRouter models: until verified working on this account, OpenRouter
// is hidden for them (they still run on Kie/Oxen), so the UI never claims a
// provider works when it doesn't.
export function availableProviders(model, providers, openrouterOpenaiOk = true) {
  if (!model) return [];
  const slugs = model.providers || {};
  return providers.filter((p) => {
    if (p.disabled) return false; // switched off by the user
    if (!slugs[p.id]) return false;
    if (p.id === 'openrouter' && needsOpenrouterDataSharing(model) && !openrouterOpenaiOk) return false;
    return true;
  });
}

// Best provider for a model: prefer one with a key, else first that can serve it.
export function resolveProvider(model, providers, openrouterOpenaiOk = true) {
  const avail = availableProviders(model, providers, openrouterOpenaiOk);
  return avail.find((p) => p.hasKey) || avail[0] || null;
}

export function unitCost(model) {
  return model?.priceUsd != null ? model.priceUsd : null;
}

// Match a selected resolution to the best feed variant row, else the cheapest.
function matchVariant(rows, resolution) {
  if (!rows?.length) return null;
  const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');
  const r = norm(resolution);
  if (r) {
    const exact = rows.find((x) => norm(x.variant) === r);
    if (exact) return exact;
    const token = rows.find((x) => norm(x.variant).split('-').includes(r));
    if (token) return token;
  }
  return rows.reduce((a, b) => (b.price < a.price ? b : a));
}

// Real price for (model, provider, resolution) from the jenai.house feed, or
// null if the feed doesn't cover it (caller falls back to the rough config price).
// unit is 'image' (price per image) or 'second' (price per second of video).
export function priceFor(prices, modelKey, providerId, resolution) {
  const entry = prices?.[modelKey];
  if (!entry) return null;
  const row = matchVariant(entry.providers?.[providerId], resolution);
  if (!row) return null;
  return {
    unit: entry.unit,
    price: row.price,
    isTemporary: row.isTemporary,
    temporaryNote: row.temporaryNote,
    activeDeal: row.activeDeal,
  };
}

export function StudioProvider({ initial, children }) {
  const [config] = useState(initial.config);
  const [models] = useState(initial.models);
  const [providers, setProviders] = useState(initial.providers);
  const [projects, setProjects] = useState(initial.projects);
  const [settings, setSettings] = useState(initial.config.settings || {});
  const [prices, setPrices] = useState(initial.prices?.table || {});
  const pricesAsOf = initial.prices?.asOf || null;

  // Whether OpenAI-on-OpenRouter is actually usable on this account. This is the
  // real, verified state (not a mere checkbox), so the UI can be truthful.
  const openrouterOpenaiOk = settings.openrouterOpenaiVerified === true;
  // Ask the server to probe the account and refresh the flag from the truth.
  const verifyOpenrouter = useCallback(async () => {
    const r = await api.verifyOpenrouter();
    if (r.settings) setSettings(r.settings);
    return r;
  }, []);
  // Manually turn it off (hide the models) without touching the OpenRouter account.
  const disableOpenrouterOpenai = useCallback(async () => {
    const r = await api.saveSettings({ openrouterOpenaiVerified: false });
    setSettings(r.settings || {});
  }, []);

  const [locale, setLocale] = useState(
    () => localStorage.getItem(LOCALE_KEY) || initial.config.branding.defaultLocale || 'he',
  );
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || 'light');
  // Restore the tab + project the person was on, so a refresh stays put.
  const [view, setView] = useState(() => localStorage.getItem(VIEW_KEY) || 'images');
  const [currentProject, setCurrentProject] = useState(() => localStorage.getItem(PROJECT_KEY) || 'all');

  // Cross-view carriers.
  const [imageRefs, setImageRefs] = useState([]);        // [{local_url}]
  const [videoRef, setVideoRef] = useState(null);        // {local_url} from "Turn to video"
  const [recreate, setRecreate] = useState(null);        // {prompt, model, task}

  const t = makeT(locale);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = isRtl(locale) ? 'rtl' : 'ltr';
    localStorage.setItem(LOCALE_KEY, locale);
  }, [locale]);

  useEffect(() => {
    if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  // Persist tab + project so a page refresh returns to where you were.
  useEffect(() => { localStorage.setItem(VIEW_KEY, view); }, [view]);
  useEffect(() => { localStorage.setItem(PROJECT_KEY, currentProject); }, [currentProject]);

  const refreshProviders = useCallback(async () => {
    setProviders((await api.providers()).providers);
  }, []);

  const imageModels = models.models.filter((m) => m.type === 'image');
  const videoModels = models.models.filter((m) => m.type === 'video');

  // Turn an image into a video: carry its URL as a reference and switch tabs.
  const turnToVideo = useCallback((job) => {
    const out = job.outputs?.[0];
    if (out?.local_url) setVideoRef({ local_url: out.local_url, prompt: job.prompt });
    setView('videos');
  }, []);

  // Retry a failed job: reload the FULL setup (model, aspect, resolution,
  // duration/audio, references) into the prompt bar and switch to OpenRouter
  // (which has credits). The prompt bar's recreate effect applies it.
  const retryJob = useCallback((job) => {
    const p = job.params || {};
    setRecreate({
      task: job.task, prompt: job.prompt, model: job.model, preferProvider: 'openrouter',
      aspect_ratio: p.aspect_ratio, resolution: p.resolution, num_outputs: p.num_outputs,
      duration_seconds: p.duration_seconds, generate_audio: p.generate_audio,
      input_images: p.input_images || [],
    });
    setView(job.task === 'video' ? 'videos' : 'images');
  }, []);

  const value = {
    config, models, imageModels, videoModels,
    settings, openrouterOpenaiOk, verifyOpenrouter, disableOpenrouterOpenai,
    prices, pricesAsOf,
    providers, refreshProviders,
    projects, setProjects,
    locale, setLocale, t, isRtl: isRtl(locale),
    theme, setTheme,
    view, setView,
    currentProject, setCurrentProject,
    imageRefs, setImageRefs,
    videoRef, setVideoRef,
    recreate, setRecreate,
    turnToVideo, retryJob,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// Position a fixed menu near an anchor element, closing on outside-click / Esc.
export function useAnchoredMenu(placement = 'bottom') {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);
  const menuRef = useRef(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  useEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const a = anchorRef.current?.getBoundingClientRect();
      const m = menuRef.current;
      if (!a || !m) return;
      const mw = m.offsetWidth;
      const mh = m.offsetHeight;
      let left = a.left;
      if (document.documentElement.dir === 'rtl') left = a.right - mw;
      left = Math.max(12, Math.min(left, window.innerWidth - mw - 12));
      let top = placement === 'top' ? a.top - mh - 8 : a.bottom + 8;
      top = Math.max(60, Math.min(top, window.innerHeight - mh - 12));
      setPos({ left, top });
    };
    place();
    const onDoc = (e) => {
      if (!menuRef.current?.contains(e.target) && !anchorRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, placement]);

  return { open, setOpen, anchorRef, menuRef, pos };
}
