import React, { useMemo, useState, useEffect, useRef } from 'react';
import { api } from '../lib/api.js';
import { useStudio, availableProviders, resolveProvider, unitCost, priceFor } from '../lib/studio.jsx';
import ModelPicker from './ModelPicker.jsx';
import PillSelect from './PillSelect.jsx';
import AspectIcon from './AspectIcon.jsx';

// One floating prompt bar for both Image and Video studios. All the per-model
// controls are DATA-DRIVEN from the model's optionSchema (built-ins + custom
// options declared in config/models.json) — nothing about aspect / resolution /
// duration / seed / etc. is hardcoded here. The front end just sends a generic
// `options` bag; the server maps it per provider.
export default function PromptBar({ type }) {
  const {
    t, isRtl, locale, imageModels, videoModels, providers, currentProject, openrouterOpenaiOk, prices,
    imageRefs, setImageRefs, recreate, setRecreate, videoRef, setVideoRef,
  } = useStudio();
  const isVideo = type === 'video';
  const models = isVideo ? videoModels : imageModels;

  // Everything the user sets up persists across reloads (per studio type).
  const SAVE_KEY = `jenai.prompt.v1.${type}`;
  const saved = useMemo(() => {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch { return {}; }
  }, [SAVE_KEY]);

  const [modelKey, setModelKey] = useState(
    () => (saved.modelKey && models.some((m) => m.key === saved.modelKey) ? saved.modelKey : models[0]?.key || ''),
  );
  const model = models.find((m) => m.key === modelKey) || models[0];
  const schema = model?.optionSchema || [];
  const provs = availableProviders(model, providers, openrouterOpenaiOk);

  const [provider, setProvider] = useState(() => saved.provider || resolveProvider(model, providers, openrouterOpenaiOk)?.id || '');
  const [prompt, setPrompt] = useState(() => saved.prompt || '');
  const [count, setCount] = useState(() => saved.count || 1);
  const [refs, setRefs] = useState(() => saved.refs || []);
  const [optionValues, setOptionValues] = useState(() => {
    const base = {};
    for (const o of schema) base[o.key] = o.default;
    return { ...base, ...(saved.options || {}) };
  });
  const [busy, setBusy] = useState(false);
  const [viewRef, setViewRef] = useState(null);
  const fileRef = useRef(null);
  const promptRef = useRef(null);
  const batchCap = 20;

  const setOpt = (k, v) => setOptionValues((o) => ({ ...o, [k]: v }));
  const resolution = optionValues.resolution;
  const duration = optionValues.duration ?? 4;

  // Labels/placeholders: custom options carry a bilingual {en,he}; built-ins use i18n keys.
  const lbl = (o) => (o?.label ? (o.label[locale] || o.label.en || o.key) : (o?.i18n ? t(o.i18n) : o?.key));
  const ph = (o) => (o?.placeholder ? (o.placeholder[locale] || o.placeholder.en || '') : '');
  const numericEnum = (o) => (o.values || []).every((v) => typeof v === 'number');

  // Persist the whole setup whenever any of it changes.
  useEffect(() => {
    const data = {
      modelKey, provider, prompt, count, options: optionValues,
      refs: refs.map((r) => ({ local_url: r.local_url, poster_url: r.poster_url })),
    };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* storage full/blocked */ }
  }, [modelKey, provider, prompt, count, optionValues, refs, SAVE_KEY]);

  // Auto-grow the prompt textarea up to ~4 lines, then it scrolls (CSS max-height).
  useEffect(() => {
    const el = promptRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [prompt]);

  // Cross-view carriers: recreate / retry (from lightbox or an error tile).
  useEffect(() => {
    if (!recreate || recreate.task !== type) return;
    const r = recreate;
    setRecreate(null);
    if (r.prompt != null) setPrompt(r.prompt);
    if (r.model && models.some((m) => m.key === r.model)) setModelKey(r.model);
    // Apply the rest after the model-change effect has reconciled its defaults.
    setTimeout(() => {
      const m = models.find((x) => x.key === (r.model || modelKey));
      const s = m?.optionSchema || [];
      // Prefer the stored generic bag; fall back to legacy top-level params.
      const incoming = { ...(r.options || {}) };
      if (incoming.aspect_ratio == null && r.aspect_ratio) incoming.aspect_ratio = r.aspect_ratio;
      if (incoming.resolution == null && r.resolution) incoming.resolution = r.resolution;
      if (incoming.duration == null && r.duration_seconds) incoming.duration = Number(r.duration_seconds);
      if (incoming.generate_audio == null && r.generate_audio != null) incoming.generate_audio = r.generate_audio;
      setOptionValues((prev) => {
        const next = { ...prev };
        for (const o of s) if (next[o.key] === undefined) next[o.key] = o.default;
        for (const [k, v] of Object.entries(incoming)) if (v != null) next[k] = v;
        return next;
      });
      if (r.num_outputs) setCount(Math.max(1, Math.min(batchCap, Number(r.num_outputs))));
      if (r.input_images?.length) {
        const refsIn = r.input_images.map((i) => ({ local_url: i.url })).filter((x) => x.local_url);
        setRefs(refsIn);
        if (!isVideo) setImageRefs(refsIn);
      }
      const avail = availableProviders(m, providers, openrouterOpenaiOk);
      const pref = (r.preferProvider && avail.find((p) => p.id === r.preferProvider)) || resolveProvider(m, providers, openrouterOpenaiOk);
      if (pref) setProvider(pref.id);
    }, 0);
  }, [recreate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isVideo && videoRef?.local_url) {
      setRefs((r) => (r.some((x) => x.local_url === videoRef.local_url) ? r : [...r, videoRef]));
      if (videoRef.prompt && !prompt) setPrompt(videoRef.prompt);
      setVideoRef(null);
    }
    if (!isVideo && imageRefs.length) setRefs(imageRefs);
  }, [videoRef, imageRefs]); // eslint-disable-line react-hooks/exhaustive-deps

  // On model change, KEEP each option's current value when the new model still
  // supports it (enum contains it), else fall back to its default — so ratio,
  // quality, length, etc. stay as consistent as possible. Provider stays too.
  useEffect(() => {
    if (!model) return;
    const s = model.optionSchema || [];
    setOptionValues((prev) => {
      const next = { ...prev };
      for (const o of s) {
        const cur = prev[o.key];
        if (o.type === 'enum') next[o.key] = (o.values || []).includes(cur) ? cur : o.default;
        else if (cur === undefined) next[o.key] = o.default;
      }
      return next;
    });
    setProvider((p) => {
      const avail = availableProviders(model, providers, openrouterOpenaiOk);
      return (p && avail.some((x) => x.id === p)) ? p : (resolveProvider(model, providers, openrouterOpenaiOk)?.id || '');
    });
  }, [modelKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const money = (n) => (n < 0.1 ? `$${n.toFixed(3)}` : `$${n.toFixed(2)}`);

  const unitPriceFor = (providerId) => {
    const feed = priceFor(prices, modelKey, providerId, resolution);
    if (feed) return { price: feed.price, unit: feed.unit };
    const u = unitCost(model);
    return u == null ? null : { price: u, unit: isVideo ? 'second' : 'image' };
  };
  const unitLabel = (providerId) => {
    const p = unitPriceFor(providerId);
    if (!p) return '';
    return `${money(p.price)}${p.unit === 'second' ? '/s' : '/img'}`;
  };

  // Total: per second × length (video) or per image × count.
  const cost = useMemo(() => {
    const p = unitPriceFor(provider);
    if (!p) return null;
    const total = isVideo ? p.price * Number(duration) : p.price * Number(count);
    return total.toFixed(2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prices, modelKey, provider, resolution, count, duration, isVideo]);

  const MAX_REFS = 10;

  const pushRef = (ref) => {
    setRefs((r) => (r.length >= MAX_REFS || r.some((x) => x.local_url === ref.local_url) ? r : [...r, ref]));
    if (!isVideo) setImageRefs((r) => (r.length >= MAX_REFS || r.some((x) => x.local_url === ref.local_url) ? r : [...r, ref]));
  };

  const addFile = async (file) => {
    if (!file || refs.length >= MAX_REFS) return;
    if (!/^image\/|^video\//.test(file.type)) return;
    const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file); });
    try { const up = await api.upload(dataUrl); pushRef(up); } catch { /* ignore */ }
  };
  const addFiles = async (fileList) => {
    for (const f of Array.from(fileList || [])) { if (refs.length >= MAX_REFS) break; await addFile(f); }
  };
  const onDrop = async (e) => {
    e.preventDefault();
    const payload = e.dataTransfer.getData('application/x-jenai-media');
    if (payload) {
      try { const m = JSON.parse(payload); if (m.local_url) pushRef({ local_url: m.local_url, poster_url: m.poster_url }); } catch { /* ignore */ }
    }
    if (e.dataTransfer.files?.length) await addFiles(e.dataTransfer.files);
  };
  const onPaste = async (e) => {
    const items = e.clipboardData?.items || [];
    const files = [];
    for (const it of items) { if (it.kind === 'file') { const f = it.getAsFile(); if (f) files.push(f); } }
    if (files.length) { e.preventDefault(); await addFiles(files); }
  };

  // Collect the generic options bag from the current schema (omit blanks).
  const buildOptions = () => {
    const out = {};
    for (const o of schema) {
      const v = optionValues[o.key];
      if (v === undefined || v === null || v === '') continue;
      out[o.key] = v;
    }
    return out;
  };

  const fire = async () => {
    setBusy(true);
    try {
      await api.generate({
        task: type,
        mode: refs.length ? (isVideo ? 'image_to_x' : 'reference_to_x') : 'text_to_x',
        provider,
        model: modelKey,
        prompt: prompt.trim(),
        num_outputs: isVideo ? 1 : Number(count),
        input_images: refs.map((r) => ({ role: 'reference', url: absolute(r.local_url) })),
        project_id: currentProject === 'all' ? 'default' : currentProject,
        options: buildOptions(),
      });
      window.dispatchEvent(new Event('jenai:generated'));
    } finally { setBusy(false); }
  };

  const noProvider = provs.length === 0;
  const canGo = !busy && !noProvider && prompt.trim().length > 0;

  // Render one control from a schema entry.
  const renderOption = (o) => {
    const v = optionValues[o.key];
    if (o.ui === 'aspect') {
      return (
        <PillSelect key={o.key} renderIcon={(r) => <AspectIcon ratio={r} />} value={v}
          options={(o.values || []).map((a) => ({ value: a, label: a }))}
          onChange={(nv) => setOpt(o.key, nv)} />
      );
    }
    if (o.ui === 'pill') {
      return (
        <PillSelect key={o.key} icon={o.icon} value={v}
          options={(o.values || []).map((x) => ({ value: x, label: o.suffix ? `${x}${o.suffix}` : String(x) }))}
          onChange={(nv) => setOpt(o.key, numericEnum(o) ? Number(nv) : nv)} />
      );
    }
    if (o.ui === 'toggle') {
      const on = v !== false;
      if (o.key === 'generate_audio') {
        return (
          <button key={o.key} className={`ctrl ${on ? 'ctrl-on' : ''}`} onClick={() => setOpt(o.key, !on)}>
            🔊 {on ? t('videos.audioOn') : t('videos.audioOff')}
          </button>
        );
      }
      return (
        <button key={o.key} className={`ctrl ${on ? 'ctrl-on' : ''}`} onClick={() => setOpt(o.key, !on)}>
          {lbl(o)} {on ? '✓' : '✗'}
        </button>
      );
    }
    if (o.ui === 'number') {
      return (
        <input key={o.key} className="ctrl ctrl-num" type="number" step={o.step || 1}
          title={lbl(o)} placeholder={ph(o) || lbl(o)} value={v ?? ''}
          onChange={(e) => { const raw = e.target.value; setOpt(o.key, raw === '' ? undefined : (o.type === 'int' ? parseInt(raw, 10) : Number(raw))); }} />
      );
    }
    if (o.ui === 'text') {
      return (
        <input key={o.key} className="ctrl ctrl-text" type="text" dir="auto"
          title={lbl(o)} placeholder={ph(o) || lbl(o)} value={v ?? ''}
          onChange={(e) => setOpt(o.key, e.target.value)} />
      );
    }
    return null;
  };

  // Publish the prompt bar's live height so the gallery can pad its bottom by
  // exactly that much — otherwise a tall bar (lots of text/refs) hides the last row.
  const barRef = useRef(null);
  useEffect(() => {
    const el = barRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const set = () => document.documentElement.style.setProperty('--promptbar-h', `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => { ro.disconnect(); };
  }, []);

  return (
    <>
      <div className="promptbar" ref={barRef} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
        <div className="refrow">
          {refs.map((r, i) => (
            <div className="refthumb" key={r.local_url} onClick={() => setViewRef(r)} title="">
              <img src={r.poster_url || r.local_url} alt="" />
              {r.poster_url && <span className="refplay">▶</span>}
              <span className="x" onClick={(e) => { e.stopPropagation(); setRefs((x) => x.filter((_, j) => j !== i)); if (!isVideo) setImageRefs((x) => x.filter((_, j) => j !== i)); }}>×</span>
            </div>
          ))}
          {refs.length < MAX_REFS && <div className="refadd" onClick={() => fileRef.current?.click()} title="עד 10 רפרנסים">＋</div>}
          <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        </div>

        <textarea
          ref={promptRef}
          className="promptinput" value={prompt} dir={prompt ? 'auto' : (isRtl ? 'rtl' : 'ltr')} rows={1}
          placeholder={isVideo ? t('videos.promptShort') : t('prompt.placeholder')}
          onPaste={onPaste}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && canGo) { e.preventDefault(); fire(); } }}
        />

        <div className="ctrlrow">
          <ModelPicker models={models} providers={providers} value={modelKey} onPick={setModelKey} kind={type} variant="pill" t={t} />
          {provs.length > 0 && (
            <PillSelect icon="⚑" value={provider}
              options={provs.map((p) => {
                const price = unitLabel(p.id);
                const base = p.hasKey ? p.label : `${p.label} · ${t('prompt.noKey')}`;
                return { value: p.id, label: price ? `${base} · ${price}` : base };
              })}
              onChange={setProvider} />
          )}
          {provs.length === 0 && (() => {
            // No usable provider — say WHY, so the disabled button isn't a mystery.
            const slugIds = Object.keys(model?.providers || {});
            const info = slugIds.map((id) => providers.find((p) => p.id === id)).filter(Boolean);
            const disabled = info.filter((p) => p.disabled).map((p) => p.label);
            const needKey = info.filter((p) => !p.disabled && !p.hasKey).map((p) => p.label);
            let msg;
            if (info.length === 0) msg = t('prompt.noProviderNone');
            else if (disabled.length && !info.some((p) => !p.disabled)) msg = t('prompt.noProviderDisabled').replace('{p}', disabled.join(' / '));
            else if (needKey.length) msg = t('prompt.noProviderNoKey').replace('{p}', needKey.join(' / '));
            else msg = t('prompt.noProvider');
            return <span className="noprov-hint" title={msg}>⚠ {msg}</span>;
          })()}
          {schema.map(renderOption)}
          {!isVideo && (
            <div className="stepper">
              <button onClick={() => setCount((c) => Math.max(1, c - 1))}>−</button>
              <span className="val">{count}<small>/{batchCap}</small></span>
              <button onClick={() => setCount((c) => Math.min(batchCap, c + 1))}>＋</button>
            </div>
          )}
          <button className="generate" disabled={!canGo} onClick={fire}>
            {t('prompt.generate')}{cost && <span className="cost">✦ ${cost}</span>}
          </button>
        </div>
      </div>

      {viewRef && (
        <div className="ref-viewer" onClick={() => setViewRef(null)}>
          <div className="ref-viewer-inner" onClick={(e) => e.stopPropagation()}>
            {viewRef.poster_url
              ? <video src={viewRef.local_url} controls autoPlay loop playsInline />
              : <img src={viewRef.local_url} alt="" />}
          </div>
        </div>
      )}
    </>
  );
}

function absolute(url) {
  if (/^https?:/.test(url)) return url;
  return `${window.location.origin}${url}`;
}
