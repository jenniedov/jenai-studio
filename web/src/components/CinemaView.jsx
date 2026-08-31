import React, { useState, useMemo, useEffect, useRef } from 'react';
import { api } from '../lib/api.js';
import { useStudio, availableProviders, resolveProvider, unitCost } from '../lib/studio.jsx';
import { LOOKS, LOOK_CATEGORIES, DEFAULT_LOOK, applyLook } from '../lib/cinema.js';
import ModelPicker from './ModelPicker.jsx';
import PillSelect from './PillSelect.jsx';
import AspectIcon from './AspectIcon.jsx';
import MediaGrid from './MediaGrid.jsx';
import Lightbox from './Lightbox.jsx';
import ErrorModal from './ErrorModal.jsx';

const CINE_ASPECTS = ['16:9', '21:9', '9:16', '1:1', '4:5'];

// Cinema = image generation with a film-crew look panel. The camera / lens /
// stop / stock / lighting / grade selections are composed onto the prompt
// before it's sent, so the same scene renders with different cinematic looks.
export default function CinemaView() {
  const { t, imageModels, providers, currentProject } = useStudio();
  const [modelKey, setModelKey] = useState(imageModels[0]?.key || '');
  const model = imageModels.find((m) => m.key === modelKey) || imageModels[0];
  const provs = availableProviders(model, providers);
  const [provider, setProvider] = useState(() => resolveProvider(model, providers)?.id || '');
  const [prompt, setPrompt] = useState('');
  const [aspect, setAspect] = useState('16:9');
  const [resolution, setResolution] = useState(model?.resolutions?.[0] || '');
  const [look, setLook] = useState({ ...DEFAULT_LOOK });
  const [showLook, setShowLook] = useState(true);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null);
  const listRef = useRef([]); // grid order, for ←/→ navigation in the lightbox
  const [errJob, setErrJob] = useState(null);
  const promptRef = useRef(null);

  useEffect(() => {
    const el = promptRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [prompt]);

  useEffect(() => {
    if (!model) return;
    setResolution(model.resolutions?.[0] || '');
    setProvider(resolveProvider(model, providers)?.id || '');
    if (!model.aspectRatios?.includes(aspect)) setAspect(model.aspectRatios?.includes('16:9') ? '16:9' : (model.aspectRatios?.[0] || '16:9'));
  }, [modelKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const aspects = useMemo(() => CINE_ASPECTS.filter((a) => (model?.aspectRatios || CINE_ASPECTS).includes(a)) || CINE_ASPECTS, [model]);
  const composed = applyLook(prompt, look);
  const lookActive = composed !== prompt.trim() && composed !== prompt;
  const cost = model?.priceUsd != null ? model.priceUsd.toFixed(2) : null;

  const fire = async () => {
    setBusy(true);
    try {
      await api.generate({
        task: 'image', mode: 'text_to_x', provider, model: modelKey,
        prompt: applyLook(prompt, look).trim(),
        aspect_ratio: aspect, resolution: resolution || undefined, num_outputs: 1,
        project_id: currentProject === 'all' ? 'default' : currentProject,
      });
      window.dispatchEvent(new Event('jenai:generated'));
    } finally { setBusy(false); }
  };

  const noProvider = provs.length === 0;
  const canGo = !busy && !noProvider && prompt.trim().length > 0;

  return (
    <section className="view studio">
      <div className="gallery-toolbar">
        <span className="title">🎬 {t('nav.cinema')}</span>
      </div>

      <div className="gallery-scroll">
        <MediaGrid type="image" onOpen={setOpen} onError={setErrJob} listRef={listRef} />
      </div>

      <div className="promptbar cinema-bar">
        {showLook && (
          <div className="look-panel">
            {LOOK_CATEGORIES.map(([key, label]) => (
              <div className="look-col" key={key}>
                <label>{label}</label>
                <PillSelect
                  placement="top"
                  value={look[key]}
                  options={LOOKS[key].map((o) => ({ value: o.label, label: o.label }))}
                  onChange={(v) => setLook((l) => ({ ...l, [key]: v }))}
                />
              </div>
            ))}
          </div>
        )}
        <textarea
          ref={promptRef}
          className="promptinput" value={prompt} dir="auto" rows={1}
          placeholder={t('cinema.placeholder')}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && canGo) { e.preventDefault(); fire(); } }}
        />
        {lookActive && <div className="composed-preview" title={composed}>{composed}</div>}
        <div className="ctrlrow">
          <button className={`ctrl ${showLook ? 'ctrl-on' : ''}`} onClick={() => setShowLook((s) => !s)}>🎬 {t('cinema.look')}</button>
          <ModelPicker models={imageModels} providers={providers} value={modelKey} onPick={setModelKey} kind="image" variant="pill" t={t} />
          {provs.length > 1 && (
            <PillSelect icon="⚑" value={provider}
              options={provs.map((p) => ({ value: p.id, label: p.hasKey ? p.label : `${p.label} · ${t('prompt.noKey')}` }))}
              onChange={setProvider} />
          )}
          <PillSelect renderIcon={(r) => <AspectIcon ratio={r} />} value={aspect}
            options={aspects.map((a) => ({ value: a, label: a }))} onChange={setAspect} />
          {model?.resolutions?.length > 0 && (
            <PillSelect icon="◈" value={resolution}
              options={model.resolutions.map((r) => ({ value: r, label: r }))} onChange={setResolution} />
          )}
          <button className="generate" disabled={!canGo} onClick={fire}>
            {t('prompt.generate')}{cost && <span className="cost">✦ ${cost}</span>}
          </button>
        </div>
      </div>

      {open && <Lightbox job={open} onClose={() => setOpen(null)} listRef={listRef} onNavigate={setOpen} />}
      {errJob && <ErrorModal t={t} job={errJob} onClose={() => setErrJob(null)} />}
    </section>
  );
}
