import React, { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../lib/api.js';
import { useStudio, useAnchoredMenu } from '../lib/studio.jsx';
import { useDialog } from './Dialog.jsx';

// Projects are folders shared across images and videos. Reorder by drag, and
// use the ⋯ menu on a card to archive or delete (delete also removes the files).
export default function ProjectsView() {
  const { t, setProjects: setStudioProjects, setCurrentProject, setView } = useStudio();
  const dialog = useDialog();
  const [projects, setProjects] = useState([]);
  const [archived, setArchived] = useState([]);
  const [counts, setCounts] = useState({});
  const dragIndex = useRef(null);
  const [dragOver, setDragOver] = useState(null);

  const loadCounts = useCallback(async (names) => {
    const out = {};
    await Promise.all(names.map(async (p) => {
      const [img, vid] = await Promise.all([
        api.jobs({ project: p, type: 'image', limit: 1 }),
        api.jobs({ project: p, type: 'video', limit: 1 }),
      ]);
      out[p] = {
        images: img.total, videos: vid.total,
        cover: img.jobs?.[0]?.outputs?.[0]?.local_url || vid.jobs?.[0]?.outputs?.[0]?.poster_url || null,
      };
    }));
    setCounts(out);
  }, []);

  const load = useCallback(async () => {
    const { projects: p, archived: a } = await api.projects();
    setProjects(p); setArchived(a || []); setStudioProjects(p);
    loadCounts([...p, ...(a || [])]);
  }, [loadCounts, setStudioProjects]);

  useEffect(() => { load(); }, [load]);

  const addProject = async () => {
    const name = await dialog.prompt({ title: t('projects.newTitle'), placeholder: t('projects.namePlaceholder'), confirmText: t('projects.add') });
    if (!name) return;
    const { projects: next } = await api.addProject(name);
    setProjects(next); setStudioProjects(next); loadCounts(next);
  };

  const openProject = (p) => { setCurrentProject(p); setView('project'); };

  const archiveProject = async (name, isArchived) => {
    const r = await api.archiveProject(name, !isArchived);
    setProjects(r.projects); setArchived(r.archived); setStudioProjects(r.projects);
  };

  const deleteProject = async (name) => {
    const ok = await dialog.confirm({
      title: t('projects.deleteTitle'),
      body: t('projects.deleteBody', { name }),
      danger: true,
      confirmText: t('projects.deleteConfirm'),
    });
    if (!ok) return;
    const r = await api.deleteProject(name);
    setProjects(r.projects); setArchived(r.archived); setStudioProjects(r.projects);
    loadCounts([...r.projects, ...r.archived]);
  };

  // Drag reorder within the active list.
  const onDrop = async (i) => {
    const from = dragIndex.current;
    dragIndex.current = null; setDragOver(null);
    if (from == null || from === i) return;
    const next = [...projects];
    const [moved] = next.splice(from, 1);
    next.splice(i, 0, moved);
    setProjects(next); setStudioProjects(next);
    await api.reorderProjects(next);
  };

  return (
    <section className="view projects-view">
      <div className="projects-head">
        <div>
          <h1 className="page-title">{t('projects.title')}</h1>
          <p className="projects-sub">{t('projects.subtitle')}</p>
        </div>
        <button className="btn btn-accent" onClick={addProject}>{t('projects.newTitle')}</button>
      </div>

      <div className="project-grid">
        {projects.map((p, i) => (
          <ProjectCard
            key={p} name={p} counts={counts[p]} t={t}
            draggable dragOver={dragOver === i}
            onOpen={() => openProject(p)}
            onArchive={() => archiveProject(p, false)}
            onDelete={() => deleteProject(p)}
            onDragStart={() => { dragIndex.current = i; }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(i); }}
            onDropCard={() => onDrop(i)}
          />
        ))}
      </div>

      {archived.length > 0 && (
        <>
          <h2 className="archived-title">{t('projects.archived')}</h2>
          <div className="project-grid">
            {archived.map((p) => (
              <ProjectCard
                key={p} name={p} counts={counts[p]} t={t} archived
                onOpen={() => openProject(p)}
                onArchive={() => archiveProject(p, true)}
                onDelete={() => deleteProject(p)}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function ProjectCard({ name, counts, t, archived, draggable, dragOver, onOpen, onArchive, onDelete, onDragStart, onDragOver, onDropCard }) {
  const { open, setOpen, anchorRef, menuRef, pos } = useAnchoredMenu('bottom');
  const c = counts || {};
  return (
    <div
      className={`project-card ${dragOver ? 'drag-over' : ''} ${archived ? 'is-archived' : ''}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDropCard}
      onClick={onOpen}
    >
      <div className="project-cover">
        {c.cover ? <img src={c.cover} alt={name} loading="lazy" /> : <div className="project-cover-empty">{name[0]?.toUpperCase()}</div>}
        <button
          ref={anchorRef} className="project-menu-btn"
          onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        >⋯</button>
      </div>
      <div className="project-info">
        <strong>{name}</strong>
        <span className="project-meta">{t('projects.imagesN', { n: c.images ?? 0 })} · {t('projects.videosN', { n: c.videos ?? 0 })}</span>
      </div>
      {open && (
        <div ref={menuRef} className="pillmenu" style={{ left: pos.left, top: pos.top }} onClick={(e) => e.stopPropagation()}>
          <button onClick={() => { setOpen(false); onArchive(); }}>{archived ? t('projects.unarchive') : t('projects.archive')}</button>
          <button className="menu-danger" onClick={() => { setOpen(false); onDelete(); }}>{t('projects.delete')}</button>
        </div>
      )}
    </div>
  );
}
