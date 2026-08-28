import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

const Ctx = createContext(null);
export const useDialog = () => useContext(Ctx);

// Imperative pretty dialogs that replace window.prompt / window.confirm.
//   const dialog = useDialog();
//   const name = await dialog.prompt({ title, placeholder });   // string | null
//   const ok   = await dialog.confirm({ title, body, danger }); // boolean
export function DialogProvider({ children }) {
  const [state, setState] = useState(null);
  const resolveRef = useRef(null);
  const [value, setValue] = useState('');
  const inputRef = useRef(null);

  const close = useCallback((result) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setState(null);
    setValue('');
  }, []);

  const prompt = useCallback((opts = {}) => new Promise((resolve) => {
    resolveRef.current = resolve;
    setValue(opts.defaultValue || '');
    setState({ kind: 'prompt', ...opts });
  }), []);

  const confirm = useCallback((opts = {}) => new Promise((resolve) => {
    resolveRef.current = resolve;
    setState({ kind: 'confirm', ...opts });
  }), []);

  useEffect(() => {
    if (state?.kind === 'prompt') setTimeout(() => inputRef.current?.focus(), 30);
  }, [state]);

  useEffect(() => {
    if (!state) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') close(state.kind === 'prompt' ? null : false);
      if (e.key === 'Enter' && state.kind === 'prompt') close(value.trim() || null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [state, value, close]);

  const EN = typeof document !== 'undefined' && document.documentElement.lang === 'en';

  return (
    <Ctx.Provider value={{ prompt, confirm }}>
      {children}
      {state && (
        <div className="overlay" onClick={() => close(state.kind === 'prompt' ? null : false)}>
          <div className="modal dialog" onClick={(e) => e.stopPropagation()}>
            <div className={`modal-shell ${state.danger ? 'danger' : ''}`} />
            <div className="modal-body">
              {state.title && <h2>{state.title}</h2>}
              {state.body && <p>{state.body}</p>}
              {state.kind === 'prompt' && (
                <input
                  ref={inputRef} className="input" value={value}
                  placeholder={state.placeholder || ''}
                  onChange={(e) => setValue(e.target.value)}
                  style={{ marginBottom: 8 }}
                />
              )}
              <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => close(state.kind === 'prompt' ? null : false)}>
                  {state.cancelText || (EN ? 'Cancel' : 'ביטול')}
                </button>
                <button
                  className={`btn ${state.danger ? 'btn-danger' : 'btn-accent'}`}
                  disabled={state.kind === 'prompt' && !value.trim()}
                  onClick={() => close(state.kind === 'prompt' ? (value.trim() || null) : true)}
                >
                  {state.confirmText || (EN ? 'OK' : 'אישור')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
