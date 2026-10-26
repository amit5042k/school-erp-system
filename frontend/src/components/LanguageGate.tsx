'use client';

import { Fragment, useEffect, useState } from 'react';
import { getLang, goLive } from '@/lib/i18n';

/** Re-renders the app in the chosen language after the first (English, server-matching) render. */
export default function LanguageGate({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState('en');
  useEffect(() => {
    goLive();
    const l = getLang();
    document.documentElement.lang = l;
    if (l !== 'en') setLangState(l);
  }, []);
  return <Fragment key={lang}>{children}</Fragment>;
}
