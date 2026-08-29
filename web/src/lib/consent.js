// Ask the user whether to enable OpenAI-on-OpenRouter models, which require
// OpenRouter's per-account data-sharing policy. Shared by onboarding + settings.
//
// We can't flip the account setting for them (it lives on their OpenRouter
// account, not in this app), so on "yes" we record consent AND open the exact
// settings page so they can switch it on. On "no" we record a decline, which
// hides those models everywhere (they still have the Google/Nano-Banana models).
export const OPENROUTER_PRIVACY_URL = 'https://openrouter.ai/settings/privacy';

export async function askOpenrouterConsent({ t, dialog, setOpenrouterConsent }) {
  const ok = await dialog.confirm({
    title: t('consent.title'),
    body: t('consent.body'),
    confirmText: t('consent.yes'),
    cancelText: t('consent.no'),
  });
  await setOpenrouterConsent(!!ok);
  if (ok) {
    try { window.open(OPENROUTER_PRIVACY_URL, '_blank', 'noopener'); } catch { /* popup blocked */ }
  }
  return !!ok;
}
