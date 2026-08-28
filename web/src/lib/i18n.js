import en from '../i18n/en.json';
import he from '../i18n/he.json';

const BUNDLES = { en, he };

function lookup(bundle, key) {
  return key.split('.').reduce((o, k) => (o == null ? o : o[k]), bundle);
}

// Translate a dotted key, interpolating {var} placeholders.
export function makeT(locale) {
  const bundle = BUNDLES[locale] || BUNDLES.en;
  return function t(key, vars) {
    let str = lookup(bundle, key);
    if (str == null) str = lookup(BUNDLES.en, key) ?? key;
    if (vars && typeof str === 'string') {
      for (const [k, v] of Object.entries(vars)) {
        str = str.replaceAll(`{${k}}`, v);
      }
    }
    return str;
  };
}

export const isRtl = (locale) => locale === 'he';
