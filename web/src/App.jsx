import React, { useEffect, useState, useCallback } from 'react';
import { api } from './lib/api.js';
import { StudioProvider, useStudio } from './lib/studio.jsx';
import TopNav from './components/TopNav.jsx';
import StudioView from './components/StudioView.jsx';
import ProjectsView from './components/ProjectsView.jsx';
import ProjectView from './components/ProjectView.jsx';
import CinemaView from './components/CinemaView.jsx';
import SkillsView from './components/SkillsView.jsx';
import StudioPlaceholder from './components/StudioPlaceholder.jsx';
import Onboarding from './components/Onboarding.jsx';
import SettingsModal from './components/SettingsModal.jsx';

const PLACEHOLDER_TABS = ['lipsync', 'audio', 'clipping', 'vibemotion'];

const ONBOARDED_KEY = 'jenai.onboarded';

export default function App() {
  const [initial, setInitial] = useState(null);

  useEffect(() => {
    (async () => {
      const [config, models, providers, projects, prices] = await Promise.all([
        api.config(), api.models(), api.providers(), api.projects(), api.prices().catch(() => ({ table: {} })),
      ]);
      setInitial({ config, models, providers: providers.providers, projects: projects.projects, prices });
    })();
  }, []);

  if (!initial) return <div style={{ padding: 40, color: 'var(--txt-faint)' }}>…</div>;

  return (
    <StudioProvider initial={initial}>
      <Shell />
    </StudioProvider>
  );
}

function Shell() {
  const { view, providers, refreshProviders } = useStudio();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [onboarding, setOnboarding] = useState(false);

  useEffect(() => {
    const anyKey = providers.some((p) => p.hasKey);
    if (!anyKey && !localStorage.getItem(ONBOARDED_KEY)) setOnboarding(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const closeOnboarding = useCallback(() => {
    localStorage.setItem(ONBOARDED_KEY, '1');
    setOnboarding(false);
    refreshProviders();
  }, [refreshProviders]);

  return (
    <div className="app-root">
      <TopNav onOpenSettings={() => setSettingsOpen(true)} />
      {view === 'projects' && <ProjectsView />}
      {view === 'project' && <ProjectView />}
      {view === 'images' && <StudioView type="image" />}
      {view === 'videos' && <StudioView type="video" />}
      {view === 'cinema' && <CinemaView />}
      {view === 'skills' && <SkillsView />}
      {PLACEHOLDER_TABS.includes(view) && <StudioPlaceholder tab={view} />}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {onboarding && <OnboardingWrap onClose={closeOnboarding} />}
    </div>
  );
}

function OnboardingWrap({ onClose }) {
  const { t, providers } = useStudio();
  return <Onboarding t={t} providers={providers} onDone={onClose} onSkip={onClose} />;
}
