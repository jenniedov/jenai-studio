import React, { useState } from 'react';
import { useStudio } from '../lib/studio.jsx';
import { api } from '../lib/api.js';
import MediaGrid from './MediaGrid.jsx';
import AssetsPanel from './AssetsPanel.jsx';
import Lightbox from './Lightbox.jsx';
import ErrorModal from './ErrorModal.jsx';

// A single project's workspace: images AND videos together, live-updating, with
// the same lightbox behavior as the studios. This is where the agent's output
// lands and the person watches it populate.
export default function ProjectView() {
  const { t, currentProject, setView } = useStudio();
  const [open, setOpen] = useState(null);
  const [errJob, setErrJob] = useState(null);
  const openJob = (job) => { localStorage.setItem('jenai.lastViewed', job.job_id); setOpen(job); };
  const name = currentProject === 'all' ? t('gallery.all') : currentProject;

  // Promote a finished generation into this project's asset library, then nudge
  // the AssetsPanel to refresh.
  const saveAsset = async (job) => {
    if (currentProject === 'all') return;
    try {
      await api.addAsset({ project: currentProject, job_id: job.job_id });
      window.dispatchEvent(new CustomEvent('jenai:assets'));
    } catch { /* ignore */ }
  };

  return (
    <section className="view studio project-workspace">
      <div className="gallery-toolbar">
        <button className="btn btn-ghost back-btn" onClick={() => setView('projects')}>← {t('projects.title')}</button>
        <span className="title">{name}</span>
      </div>
      {currentProject !== 'all' && <AssetsPanel />}
      <div className="gallery-scroll">
        {/* No `type` → the grid shows images and videos together for this project. */}
        <MediaGrid onOpen={openJob} onError={setErrJob} onSaveAsset={currentProject !== 'all' ? saveAsset : undefined} />
      </div>
      {open && <Lightbox job={open} onClose={() => setOpen(null)} />}
      {errJob && <ErrorModal t={t} job={errJob} onClose={() => setErrJob(null)} />}
    </section>
  );
}
