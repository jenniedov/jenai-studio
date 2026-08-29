import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { api } from './api.js';
import { makeT, isRtl } from './i18n.js';

const Ctx = createContext(null);
export const useStudio = () => useContext(Ctx);

const LOCALE_KEY = 'jenai.locale';
const THEME_KEY = 'jenai.theme';

// Does this model route to OpenAI on OpenRouter? Those endpoints only work when
// the user has opted into OpenRouter's data-sharing policy (a per-account setting).
export function needsOpenrouterDataSharing(model) {
  return /^openai\//.test(model?.providers?.openrouter || '');
}

// Providers that have a slug for this model. `openrouterDataSharing` gates the
// OpenAI-on-OpenRouter models: without consent, OpenRouter is hidden for them
// (they still run on Kie/Oxen), so users never hit the data-policy error.
export function availableProviders(model, providers, openrouterDataSharing = true) {
  if (!model) return [];
  const slugs = model.providers || {};
  return providers.filter((p) => {
    if (!slugs[p.id]) return false;
    if (p.id === 'openrouter' && needsOpenrouterDataSharing(model) && !openrouterDataSharing) return false;
    return true;
  });
}

// Best provider for a model: prefer one with a key, else first that can serve it.
export function resolveProvider(model, providers, openrouterDataSharing = true) {
  const avail = availableProviders(model, providers, openrouterDataSharing);
  return avail.find((p) => p.hasKey) || avail[0] || null;
}

export function unitCost(model) {
  return model?.priceUsd != null ? model.priceUsd : null;
}

export function StudioProvider({ initial, children }) {
  const [config] = useState(initial.config);
  const [models] = useState(initial.models);
  const [providers, setProviders] = useState(initial.providers);
  const [projects, setProjects] = useState(initial.projects);
  const [settings, setSettings] = useState(initial.config.settings || {});

  // OpenRouter data-sharing consent (per install). true = opted in so OpenAI
  // models are offered; anything else = hidden. Persisted server-side so it's
  // global across the app and survives reloads.
  const openrouterConsent = settings.openrouterDataSharing === true;
  const setOpenrouterConsent = useCallback(async (v) => {
    const r = await api.saveSettings({ openrouterDataSharing: !!v });
    setSettings(r.settings || {});
  }, []);

  const [locale, setLocale] = useState(
    () => localStorage.getItem(LOCALE_KEY) || initial.config.branding.defaultLocale || 'he',
  );
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || 'light');
  const [view, setView] = useState('images');
  const [currentProject, setCurrentProject] = useState('all');

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
    settings, openrouterConsent, setOpenrouterConsent,
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
