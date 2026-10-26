// Screen language (English, Hindi, Punjabi). Strings are looked up by their English text, so anything not yet
// translated simply stays in English. Changing language reloads the page so every screen switches together.
import { DICT } from './i18n-dict';

export type Lang = 'en' | 'hi' | 'pa';
export const LANGS: { key: Lang; label: string }[] = [
  { key: 'en', label: 'English' },
  { key: 'hi', label: 'हिन्दी' },
  { key: 'pa', label: 'ਪੰਜਾਬੀ' },
];
const KEY = 'erp_lang';

// Server-rendered HTML is always English; LanguageGate switches on the chosen language once the page is live,
// so the first browser render matches the server's and React doesn't throw away the page.
let live = false;
export function goLive() { live = true; }

export function getLang(): Lang {
  if (typeof window === 'undefined' || !live) return 'en';
  try {
    const v = localStorage.getItem(KEY);
    return v === 'hi' || v === 'pa' ? v : 'en';
  } catch { return 'en'; }
}

export function setLang(lang: Lang) {
  try { localStorage.setItem(KEY, lang); } catch { /* private mode: stays English */ }
  window.location.reload();
}

/** Translate an English UI string; {name} placeholders are filled from vars. */
export function t(text: string, vars?: Record<string, string | number>): string {
  const lang = getLang();
  let out = lang === 'en' ? text : DICT[text]?.[lang] ?? text;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
  return out;
}
