// Turn on OpenAI-on-OpenRouter models. These need OpenRouter's per-account data
// policy (Zero Data Retention → OpenAI = OFF), which we can't set for the user.
// So we explain it, open the exact settings page, then VERIFY against their key
// — the app only shows those models once they truly work. Shared by onboarding
// + settings.
export const OPENROUTER_PRIVACY_URL = 'https://openrouter.ai/settings/privacy';

// Show the explainer, open the settings page, then verify. Reports the result
// honestly. Returns the verify result ({ eligible, reason }) or {cancelled}.
export async function enableOpenrouterOpenai({ t, dialog, verifyOpenrouter }) {
  const go = await dialog.confirm({
    title: t('consent.title'),
    body: t('consent.body'),
    confirmText: t('consent.yes'),
    cancelText: t('consent.no'),
  });
  if (!go) return { cancelled: true };
  try { window.open(OPENROUTER_PRIVACY_URL, '_blank', 'noopener'); } catch { /* popup blocked */ }
  const r = await verifyOpenrouter();
  const body = r.eligible === true ? { title: t('consent.workingTitle'), body: t('consent.workingBody') }
    : r.eligible === false ? { title: t('consent.needsSetup'), body: t('consent.failHint') }
    : { title: t('consent.needsSetup'), body: t('consent.inconclusive') };
  await dialog.confirm({ ...body, confirmText: t('common.close'), cancelText: t('common.close') });
  return r;
}
