import React, { useState } from 'react';
import { api } from '../lib/api.js';

const SIGNUP = {
  oxen: 'https://oxen.ai',
  kie: 'https://kie.ai',
};

export default function Onboarding({ t, providers, onDone, onSkip }) {
  const [provider, setProvider] = useState(providers[0]?.id || 'oxen');
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!key.trim()) return;
    setSaving(true);
    try {
      await api.setKey(provider, key.trim());
      onDone();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overlay">
      <div className="modal">
        <div className="modal-shell" />
        <div className="modal-body">
          <div className="onb-row">
            <select className="input onb-provider" value={provider} onChange={(e) => setProvider(e.target.value)}>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
            <input
              className="input onb-key"
              type="password"
              value={key}
              placeholder="API key"
              autoFocus
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
            />
          </div>

          <div className="onb-foot">
            <a className="link" href={SIGNUP[provider] || '#'} target="_blank" rel="noreferrer">
              {t('onboarding.getKey')} ↗
            </a>
            <div className="modal-actions" style={{ margin: 0 }}>
              <button className="btn btn-ghost" onClick={onSkip}>{t('onboarding.skip')}</button>
              <button className="btn btn-accent" disabled={!key.trim() || saving} onClick={save}>
                {t('onboarding.save')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
