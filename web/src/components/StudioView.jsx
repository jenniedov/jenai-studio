import React, { useState, useRef } from 'react';
import { api } from '../lib/api.js';
import { useStudio } from '../lib/studio.jsx';
import { useDialog } from './Dialog.jsx';
import MediaGrid from './MediaGrid.jsx';
import PromptBar from './PromptBar.jsx';
import Lightbox from './Lightbox.jsx';
import ErrorModal from './ErrorModal.jsx';

// One layout for both Image and Video studios: a project toolbar, a scrollable
// media grid, and a floating prompt bar.
export default function StudioView({ type }) {
  const { t, projects, setProjects, currentProject, setCurrentProject } = useStudio();
  const dialog = useDialog();
  const [open, setOpen] = useState(null);
  const listRef = useRef([]); // grid order, for ←/→ navigation in the lightbox
  const [errJob, setErrJob] = useState(null);

  const newProject = async () => {
    const name = await dialog.prompt({ title: t('projects.newTitle'), placeholder: t('projects.namePlaceholder'), confirmText: t('projects.add') });
    if (!name) return;
    const { projects: next } = await api.addProject(name);
    setProjects(next);
    setCurrentProject(name);
  };

  const openJob = (job) => { localStorage.setItem('jenai.lastViewed', job.job_id); setOpen(job); };

  return (
    <section className="view studio">
      <div className="gallery-toolbar">
        <span className="title">{type === 'video' ? t('nav.videos') : t('nav.images')}</span>
        <div className="seg">
          <button className={currentProject === 'all' ? 'active' : ''} onClick={() => setCurrentProject('all')}>{t('gallery.all')}</button>
          {projects.map((p) => (
            <button key={p} className={currentProject === p ? 'active' : ''} onClick={() => setCurrentProject(p)}>{p}</button>
          ))}
          <button onClick={newProject}>{t('gallery.newProject')}</button>
        </div>
      </div>

      <div className="gallery-scroll">
        <MediaGrid type={type} onOpen={openJob} onError={setErrJob} listRef={listRef} />
      </div>

      <PromptBar type={type} />

      {open && <Lightbox job={open} onClose={() => setOpen(null)} listRef={listRef} onNavigate={openJob} />}
      {errJob && <ErrorModal t={t} job={errJob} onClose={() => setErrJob(null)} />}
    </section>
  );
}
