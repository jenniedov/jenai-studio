import React, { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import { useStudio } from '../lib/studio.jsx';

// Detail drawer for a finished generation. Image/video on the left stage,
// info + actions on the right. Close via ×, backdrop, or Esc.
export default function Lightbox({ job, onClose }) {
  const { t, turnToVideo, setImageRefs, setVideoRef, setRecreate, setView } = useStudio();
  const [tab, setTab] = useState('info');
  const [copied, setCopied] = useState(false);
  const [imgCopied, setImgCopied] = useState(false);
  const out = job.outputs?.[0];

  const copyImage = async () => {
    if (!out?.local_url) return;
    try {
      const blob = await (await fetch(out.local_url)).blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      setImgCopied(true);
      setTimeout(() => setImgCopied(false), 1600);
    } catch { /* clipboard image write unsupported/blocked */ }
  };

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(job.prompt || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked */ }
  };

  const asReference = () => {
    if (!out?.local_url) return;
    if (job.task === 'video') {
      // Use the video as a reference in the video prompt bar.
      setVideoRef({ local_url: out.local_url, poster_url: out.poster_url });
      setView('videos');
    } else {
      setImageRefs((refs) => (refs.some((r) => r.local_url === out.local_url) ? refs : [...refs, { local_url: out.local_url }]));
      setView('images');
    }
    onClose();
  };

  const recreate = () => {
    setRecreate({ task: job.task, prompt: job.prompt, model: job.model });
    setView(job.task === 'video' ? 'videos' : 'images');
    onClose();
  };

  const created = job.created_at ? new Date(job.created_at).toLocaleString() : '—';

  return (
    <div className="lightbox open">
      <div className="lb-backdrop" onClick={onClose} />
      {/* Clicking the stage (around the media) closes; clicking the media itself does not. */}
      <div className="lb-stage" onClick={onClose}>
        <div className="lb-media" onClick={(e) => e.stopPropagation()}>
          {out?.type === 'video'
            ? <video src={out.local_url} controls autoPlay loop />
            : <img src={out?.local_url} alt={job.prompt || ''} />}
        </div>
      </div>
      <aside className="lb-panel">
        <button className="lb-close" onClick={onClose}>×</button>
        <div className="lb-user">
          <div className="avatar" />
          <div>
            <div className="nm">jennie</div>
            <div className="role">{t('lightbox.author')}</div>
          </div>
        </div>
        <div className="lb-tabs">
          <button className={tab === 'info' ? 'active' : ''} onClick={() => setTab('info')}>{t('lightbox.info')}</button>
          <button className={tab === 'edit' ? 'active' : ''} onClick={() => setTab('edit')}>{t('lightbox.edit')}</button>
          <button className={tab === 'comments' ? 'active' : ''} onClick={() => setTab('comments')}>{t('lightbox.comments')}</button>
        </div>
        <div className="lb-scroll">
          <div className="block-label">
            {t('lightbox.prompt')}
            <button className="copybtn" onClick={copyPrompt}>⧉ {copied ? t('lightbox.copied') : t('lightbox.copy')}</button>
          </div>
          <div className="prompt-text">{job.prompt || '—'}</div>
          <div className="block-label">{t('lightbox.details')}</div>
          <div className="details">
            <dl>
              <dt>{t('lightbox.model')}</dt><dd>{job.model_label || job.model}</dd>
              <dt>{t('lightbox.provider')}</dt><dd>{job.provider}</dd>
              <dt>{t('lightbox.type')}</dt><dd>{out?.type === 'video' ? t('common.video') : t('common.image')}</dd>
              <dt>{t('lightbox.created')}</dt><dd>{created}</dd>
            </dl>
          </div>
        </div>
        <div className="lb-actions">
          {job.task === 'image' && (
            <button className="btn-primary" onClick={() => { turnToVideo(job); onClose(); }}>
              🎬 {t('lightbox.turnToVideo')}
            </button>
          )}
          <div className="btn-row">
            <button className="btn-sec" onClick={recreate}>↻ {t('lightbox.recreate')}</button>
            <button className="btn-sec" onClick={asReference}>⧉ {t('lightbox.reference')}</button>
          </div>
          <div className="btn-icons">
            <a className="btn-sec" href={out?.local_url} download>⬇ {t('lightbox.download')}</a>
            {out?.type !== 'video' && (
              <button className="btn-sec" onClick={copyImage}>
                ⧉ {imgCopied ? t('lightbox.imageCopied') : t('lightbox.copyImage')}
              </button>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
