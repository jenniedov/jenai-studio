import React, { useState } from 'react';
import { api } from '../lib/api.js';
import { useStudio } from '../lib/studio.jsx';
import { useDialog } from './Dialog.jsx';
import { enableOpenrouterOpenai, OPENROUTER_PRIVACY_URL } from '../lib/consent.js';

export default function SettingsModal({ onClose }) {
  const {
    t, providers, refreshProviders, locale, setLocale, theme, setTheme,
    openrouterOpenaiOk, verifyOpenrouter, disableOpenrouterOpenai,
  } = useStudio();
  const dialog = useDialog();
  const [checking, setChecking] = useState(false);
  const openrouter = providers.find((p) => p.id === 'openrouter');
  const hasOpenrouterKey = Boolean(openrouter?.hasKey);

  const onKeySaved = async (providerId) => {
    if (providerId === 'openrouter' && !openrouterOpenaiOk) {
      await enableOpenrouterOpenai({ t, dialog, verifyOpenrouter });
    }
  };

  const turnOn = async () => { setChecking(true); try { await enableOpenrouterOpenai({ t, dialog, verifyOpenrouter }); } finally { setChecking(false); } };
  const checkNow = async () => { setChecking(true); try { await verifyOpenrouter(); } finally { setChecking(false); } };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-shell" />
        <div className="modal-body">
          <h2>{t('settings.title')}</h2>

          <div className="block-label" style={{ marginTop: 4 }}>{t('settings.keys')}</div>
          {providers.map((p) => <KeyRow key={p.id} t={t} provider={p} onChanged={refreshProviders} onKeySaved={onKeySaved} />)}
          <p style={{ color: 'var(--txt-faint)', fontSize: 13, marginTop: 14, whiteSpace: 'pre-line', lineHeight: 1.5 }}>
            {t('settings.privacy')}
          </p>

          {hasOpenrouterKey && (
            <div className="settings-key-row" style={{ marginTop: 6 }}>
              <div>
                <strong>{t('consent.settingsLabel')}</strong>{' '}
                <span className={`badge ${openrouterOpenaiOk ? 'badge-ok' : 'badge-off'}`}>
                  {checking ? t('consent.checking') : (openrouterOpenaiOk ? t('consent.working') : t('consent.needsSetup'))}
                </span>
                <div style={{ color: 'var(--txt-faint)', fontSize: 12, marginTop: 4 }}>
                  <a className="link" href={OPENROUTER_PRIVACY_URL} target="_blank" rel="noreferrer">{t('consent.settingsHint')} ↗</a>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {openrouterOpenaiOk ? (
                  <button className="btn btn-ghost" disabled={checking} onClick={disableOpenrouterOpenai}>{t('consent.turnOff')}</button>
                ) : (
                  <>
                    <button className="btn btn-ghost" disabled={checking} onClick={checkNow}>{t('consent.check')}</button>
                    <button className="btn btn-accent" disabled={checking} onClick={turnOn}>{t('consent.turnOn')}</button>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="block-label" style={{ marginTop: 20 }}>{t('settings.language')}</div>
          <div className="seg" style={{ width: 'fit-content' }}>
            <button className={locale === 'he' ? 'active' : ''} onClick={() => setLocale('he')}>עברית</button>
            <button className={locale === 'en' ? 'active' : ''} onClick={() => setLocale('en')}>English</button>
          </div>

          <div className="block-label" style={{ marginTop: 20 }}>{t('settings.theme')}</div>
          <div className="seg" style={{ width: 'fit-content' }}>
            <button className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')}>{t('settings.light')}</button>
            <button className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}>{t('settings.dark')}</button>
          </div>

          <div className="modal-actions" style={{ marginTop: 24 }}>
            <button className="btn btn-accent" onClick={onClose}>{t('settings.done')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function KeyRow({ t, provider, onChanged, onKeySaved }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');

  const save = async () => {
    const v = value.trim();
    await api.setKey(provider.id, v);
    setEditing(false); setValue(''); onChanged();
    if (v) await onKeySaved?.(provider.id);
  };
  const remove = async () => { await api.setKey(provider.id, ''); onChanged(); };
  const toggle = async () => { await api.disableProvider(provider.id, !provider.disabled); onChanged(); };

  return (
    <div className={`settings-key-row ${provider.disabled ? 'is-disabled' : ''}`}>
      <div>
        <strong>{provider.label}</strong>{' '}
        {provider.disabled
          ? <span className="badge badge-off">{t('settings.disabled')}</span>
          : provider.hasKey
            ? <span className="badge badge-ok">{t('settings.keySet')} ····{provider.last4}</span>
            : <span className="badge badge-off">{t('settings.noKey')}</span>}
      </div>
      {editing ? (
        <div style={{ display: 'flex', gap: 8, flex: 1, minWidth: 200 }}>
          <input className="input" type="password" value={value} placeholder="sk-..."
            onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
          <button className="btn btn-accent" style={{ flex: '0 0 auto' }} onClick={save}>{t('onboarding.save')}</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => setEditing(true)}>
            {provider.hasKey ? '✎' : '+'} {t('settings.add')}
          </button>
          {provider.hasKey && <button className="btn btn-ghost" onClick={remove}>{t('settings.remove')}</button>}
          <button className={`btn ${provider.disabled ? 'btn-accent' : 'btn-ghost'}`} onClick={toggle}
            title={provider.disabled ? t('settings.enableHint') : t('settings.disableHint')}>
            {provider.disabled ? t('settings.enable') : t('settings.disable')}
          </button>
        </div>
      )}
    </div>
  );
}
