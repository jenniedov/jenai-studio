import React, { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../lib/api.js';
import { useStudio } from '../lib/studio.jsx';
import { useDialog } from './Dialog.jsx';

const PAGE = 40; // items per page — keeps the DOM light at thousands of jobs

// A scrollable, paginated media grid. Loads pages on scroll (never the whole
// history), lazy-loads images, and shows video POSTERS — a real <video> is only
// mounted on hover, so a project with thousands of clips stays responsive.
export default function MediaGrid({ type, onOpen, onError, onSaveAsset, listRef }) {
  const { t, currentProject, retryJob } = useStudio();
  const dialog = useDialog();
  const [jobs, setJobs] = useState([]);      // ordered newest-first
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const mapRef = useRef(new Map());          // id -> job, the source of truth
  const sentinelRef = useRef(null);
  const loadedRef = useRef(0);

  const rebuild = useCallback(() => {
    const arr = [...mapRef.current.values()].sort(
      (a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0),
    );
    setJobs(arr);
    // Share the grid's current order with the parent so the Lightbox can step
    // through it with the arrow keys (done items only — the openable ones).
    if (listRef) listRef.current = arr.filter((j) => j.status === 'done');
  }, [listRef]);

  // Reset when project/type changes.
  useEffect(() => {
    mapRef.current = new Map();
    loadedRef.current = 0;
    setJobs([]);
    loadPage(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject, type]);

  const loadPage = useCallback(async (offset, replace = false) => {
    if (loading) return;
    setLoading(true);
    try {
      const { jobs: page, total: tot } = await api.jobs({ project: currentProject, type, limit: PAGE, offset });
      setTotal(tot);
      if (replace) mapRef.current = new Map();
      for (const j of page) mapRef.current.set(j.job_id, j);
      loadedRef.current = Math.max(loadedRef.current, offset + page.length);
      rebuild();
    } catch { /* keep what we have */ } finally { setLoading(false); }
  }, [currentProject, type, loading, rebuild]);

  // Live updates: poll just page 0 (newest) and merge — running/new jobs are
  // always newest, so this catches every active change without refetching all.
  useEffect(() => {
    const poll = async () => {
      try {
        const { jobs: page, total: tot } = await api.jobs({ project: currentProject, type, limit: PAGE, offset: 0 });
        setTotal(tot);
        let changed = false;
        for (const j of page) {
          const prev = mapRef.current.get(j.job_id);
          if (!prev || prev.status !== j.status) changed = true;
          mapRef.current.set(j.job_id, j);
        }
        if (changed) rebuild();
      } catch { /* ignore */ }
    };
    const id = setInterval(poll, 2000);
    const onGen = () => poll();
    window.addEventListener('jenai:generated', onGen);
    return () => { clearInterval(id); window.removeEventListener('jenai:generated', onGen); };
  }, [currentProject, type, rebuild]);

  // Infinite scroll.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && loadedRef.current < total && !loading) {
        loadPage(loadedRef.current);
      }
    }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [total, loading, loadPage]);

  const remove = async (e, id, skipConfirm = false) => {
    e.stopPropagation();
    if (!skipConfirm) {
      const ok = await dialog.confirm({ title: t('gallery.deleteConfirm'), danger: true, confirmText: t('projects.delete') });
      if (!ok) return;
    }
    await api.deleteJob(id);
    mapRef.current.delete(id);
    rebuild();
  };

  if (jobs.length === 0 && !loading) {
    return <div className="empty">{t('gallery.empty')}</div>;
  }

  return (
    <>
      <div className={`media-grid ${type || 'all'}`}>
        {jobs.map((job) => (
          <MediaCard key={job.job_id} job={job} t={t} onOpen={onOpen} onError={onError} onDelete={remove} onRetry={retryJob} onSaveAsset={onSaveAsset} />
        ))}
      </div>
      <div ref={sentinelRef} style={{ height: 1 }} />
      {loading && <div className="grid-loading">{t('status.running')}…</div>}
    </>
  );
}

function MediaCard({ job, t, onOpen, onError, onDelete, onRetry, onSaveAsset }) {
  const [saved, setSaved] = useState(false);
  const [hover, setHover] = useState(false);
  const out = job.outputs?.[0];
  const isVideo = job.task === 'video';

  if (job.status === 'error') {
    return (
      // Clicking anywhere on the tile opens the error details (same as "more info").
      <div className={`gcard errored ${isVideo ? 'wide' : ''}`} onClick={() => onError(job)} title={t('error.more')}>
        <button className="card-x" title={t('projects.delete')} onClick={(e) => onDelete(e, job.job_id, true)}>×</button>
        <div className="center">
          <span className="err-label">{t('error.tile')}</span>
          <div className="err-actions">
            <button className="err-retry" onClick={(e) => { e.stopPropagation(); onRetry(job); }}>↻ {t('error.retry')}</button>
            <button className="err-more" onClick={(e) => { e.stopPropagation(); onError(job); }}>{t('error.more')}</button>
          </div>
        </div>
      </div>
    );
  }
  if (job.status === 'queued' || job.status === 'running') {
    return (
      <div className={`gcard loading ${isVideo ? 'wide' : ''}`}>
        <div className="center"><div className="spinner" /><span>{t(`status.${job.status}`)}</span></div>
      </div>
    );
  }

  const onDragStart = (e) => {
    e.dataTransfer.setData('application/x-jenai-media', JSON.stringify({
      local_url: out?.local_url, poster_url: out?.poster_url, type: out?.type,
    }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div
      className={`gcard ${isVideo ? 'wide' : ''}`}
      draggable
      onDragStart={onDragStart}
      onClick={() => onOpen(job)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {isVideo ? (
        // Poster image by default; mount a real <video> only while hovered.
        hover
          ? (
            <video
              className="thumb" src={out?.local_url} muted loop playsInline autoPlay preload="none"
              poster={out?.poster_url || undefined}
            />
          )
          : (out?.poster_url
            ? <img className="thumb" src={out.poster_url} alt={job.prompt || ''} loading="lazy" />
            : <div className="thumb video-fallback">▶</div>)
      ) : (
        <img className="thumb" src={out?.local_url} alt={job.prompt || ''} loading="lazy" />
      )}
      {isVideo && <span className="dur-badge">▶</span>}
      {onSaveAsset && (
        <button
          className={`card-save ${saved ? 'done' : ''}`}
          title={t('assets.saveAsset')}
          onClick={(e) => { e.stopPropagation(); onSaveAsset(job); setSaved(true); setTimeout(() => setSaved(false), 1600); }}
        >{saved ? `✓ ${t('assets.saved')}` : `★ ${t('assets.saveAsset')}`}</button>
      )}
      <span className="tile-meta">{job.model_label || job.model}</span>
      {job.prompt && <div className="cap">{job.prompt}</div>}
      <div className="tile-bar">
        <button onClick={(e) => onDelete(e, job.job_id)}>{t('gallery.delete')}</button>
      </div>
    </div>
  );
}
