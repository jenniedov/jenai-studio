import React, { useMemo, useState, useEffect, useRef } from 'react';
import { api } from '../lib/api.js';
import { useStudio, availableProviders, resolveProvider, unitCost } from '../lib/studio.jsx';
import ModelPicker from './ModelPicker.jsx';
import PillSelect from './PillSelect.jsx';
import AspectIcon from './AspectIcon.jsx';

// One floating prompt bar for both Image and Video studios (matches the
// reference gen-studio, where both use the same bar + grid).
export default function PromptBar({ type }) {
  const {
    t, isRtl, imageModels, videoModels, providers, currentProject,
    imageRefs, setImageRefs, recreate, setRecreate, videoRef, setVideoRef,
  } = useStudio();
  const isVideo = type === 'video';
  const models = isVideo ? videoModels : imageModels;

  // Everything the user sets up persists across reloads (per studio type), so
  // reopening the app restores the prompt, refs, model, ratio, quality, etc.
  const SAVE_KEY = `jenai.prompt.v1.${type}`;
  const saved = useMemo(() => {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch { return {}; }
  }, [SAVE_KEY]);

  // Prefer a sensible default ratio rather than whatever the list starts with.
  const defaultAspect = (m) => {
    const a = m?.aspectRatios || [];
    if (!a.length) return '1:1';
    const pref = isVideo ? ['16:9', '9:16', '1:1'] : ['1:1', '16:9', '4:3'];
    return pref.find((r) => a.includes(r)) || a[0];
  };

  const [modelKey, setModelKey] = useState(
    () => (saved.modelKey && models.some((m) => m.key === saved.modelKey) ? saved.modelKey : models[0]?.key || ''),
  );
  const model = models.find((m) => m.key === modelKey) || models[0];
  const provs = availableProviders(model, providers);

  const [provider, setProvider] = useState(() => saved.provider || resolveProvider(model, providers)?.id || '');
  const [prompt, setPrompt] = useState(() => saved.prompt || '');
  const [aspect, setAspect] = useState(() => saved.aspect || defaultAspect(model));
  const [resolution, setResolution] = useState(() => saved.resolution ?? (model?.resolutions?.[0] || ''));
  const [count, setCount] = useState(() => saved.count || 1);
  const [duration, setDuration] = useState(() => saved.duration || model?.durations?.[0] || 4);
  const [audio, setAudio] = useState(() => (saved.audio != null ? saved.audio : true));
  const [refs, setRefs] = useState(() => saved.refs || []);
  const [busy, setBusy] = useState(false);
  const [viewRef, setViewRef] = useState(null);   // reference being previewed full-size
  const fileRef = useRef(null);
  const promptRef = useRef(null);
  const batchCap = 20;

  // Persist the whole setup whenever any of it changes.
  useEffect(() => {
    const data = {
      modelKey, provider, prompt, aspect, resolution, count, duration, audio,
      refs: refs.map((r) => ({ local_url: r.local_url, poster_url: r.poster_url })),
    };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* storage full/blocked */ }
  }, [modelKey, provider, prompt, aspect, resolution, count, duration, audio, refs, SAVE_KEY]);

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
      if (r.aspect_ratio) setAspect(r.aspect_ratio);
      if (r.resolution) setResolution(r.resolution);
      if (r.num_outputs) setCount(Math.max(1, Math.min(batchCap, Number(r.num_outputs))));
      if (isVideo && r.duration_seconds) setDuration(Number(r.duration_seconds));
      if (isVideo && r.generate_audio != null) setAudio(r.generate_audio);
      if (r.input_images?.length) {
        const refsIn = r.input_images.map((i) => ({ local_url: i.url })).filter((x) => x.local_url);
        setRefs(refsIn);
        if (!isVideo) setImageRefs(refsIn);
      }
      const m = models.find((x) => x.key === (r.model || modelKey));
      const avail = availableProviders(m, providers);
      const pref = (r.preferProvider && avail.find((p) => p.id === r.preferProvider)) || resolveProvider(m, providers);
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

  // On model change, KEEP the current ratio / resolution / length / provider when
  // the new model still supports them — only fall back to a default otherwise.
  // This keeps the setup as consistent as possible while switching models.
  useEffect(() => {
    if (!model) return;
    setAspect((a) => (model.aspectRatios?.includes(a) ? a : defaultAspect(model)));
    setResolution((r) => (model.resolutions?.includes(r) ? r : (model.resolutions?.[0] || '')));
    setDuration((d) => (model.durations?.includes(d) ? d : (model.durations?.[0] || 4)));
    setProvider((p) => {
      const avail = availableProviders(model, providers);
      return (p && avail.some((x) => x.id === p)) ? p : (resolveProvider(model, providers)?.id || '');
    });
  }, [modelKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const cost = useMemo(() => {
    const u = unitCost(model);
    if (u == null) return null;
    return (u * (isVideo ? 1 : count)).toFixed(2);
  }, [model, count, isVideo]);

  const MAX_REFS = 10;

  const pushRef = (ref) => {
    setRefs((r) => (r.length >= MAX_REFS || r.some((x) => x.local_url === ref.local_url) ? r : [...r, ref]));
    if (!isVideo) setImageRefs((r) => (r.length >= MAX_REFS || r.some((x) => x.local_url === ref.local_url) ? r : [...r, ref]));
  };

  // Upload a File/Blob (from picker, drop, or paste) and add it as a reference.
  const addFile = async (file) => {
    if (!file || refs.length >= MAX_REFS) return;
    if (!/^image\/|^video\//.test(file.type)) return;
    const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file); });
    try { const up = await api.upload(dataUrl); pushRef(up); } catch { /* ignore */ }
  };

  const addFiles = async (fileList) => {
    for (const f of Array.from(fileList || [])) { if (refs.length >= MAX_REFS) break; await addFile(f); }
  };

  // Drop handler: accepts a dragged gallery item (already on the server) or OS files.
  const onDrop = async (e) => {
    e.preventDefault();
    const payload = e.dataTransfer.getData('application/x-jenai-media');
    if (payload) {
      try { const m = JSON.parse(payload); if (m.local_url) pushRef({ local_url: m.local_url, poster_url: m.poster_url }); } catch { /* ignore */ }
    }
    if (e.dataTransfer.files?.length) await addFiles(e.dataTransfer.files);
  };

  // Paste handler: pull image/video files out of the clipboard.
  const onPaste = async (e) => {
    const items = e.clipboardData?.items || [];
    const files = [];
    for (const it of items) { if (it.kind === 'file') { const f = it.getAsFile(); if (f) files.push(f); } }
    if (files.length) { e.preventDefault(); await addFiles(files); }
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
        aspect_ratio: aspect,
        resolution: resolution || undefined,
        num_outputs: isVideo ? 1 : Number(count),
        duration_seconds: isVideo ? Number(duration) : undefined,
        generate_audio: isVideo ? audio : undefined,
        input_images: refs.map((r) => ({ role: 'reference', url: absolute(r.local_url) })),
        project_id: currentProject === 'all' ? 'default' : currentProject,
      });
      // Keep the whole setup in place so it's easy to tweak and regenerate.
      window.dispatchEvent(new Event('jenai:generated'));
    } finally { setBusy(false); }
  };

  const noProvider = provs.length === 0;
  const canGo = !busy && !noProvider && prompt.trim().length > 0;

  return (
    <>
      <div className="promptbar" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
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
          {provs.length > 1 && (
            <PillSelect icon="⚑" value={provider}
              options={provs.map((p) => ({ value: p.id, label: p.hasKey ? p.label : `${p.label} · ${t('prompt.noKey')}` }))}
              onChange={setProvider} />
          )}
          {model?.aspectRatios?.length > 0 && (
            <PillSelect renderIcon={(r) => <AspectIcon ratio={r} />} value={aspect}
              options={model.aspectRatios.map((a) => ({ value: a, label: a }))} onChange={setAspect} />
          )}
          {model?.resolutions?.length > 0 && (
            <PillSelect icon="◈" value={resolution}
              options={model.resolutions.map((r) => ({ value: r, label: r }))} onChange={setResolution} />
          )}
          {isVideo && model?.durations?.length > 0 && (
            <PillSelect icon="◷" value={duration}
              options={model.durations.map((d) => ({ value: d, label: `${d}s` }))} onChange={(v) => setDuration(Number(v))} />
          )}
          {isVideo && model?.audio && (
            <button className={`ctrl ${audio ? 'ctrl-on' : ''}`} onClick={() => setAudio((a) => !a)}>
              🔊 {audio ? t('videos.audioOn') : t('videos.audioOff')}
            </button>
          )}
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
        // Full-size preview of a reference; click anywhere outside the media to close.
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
