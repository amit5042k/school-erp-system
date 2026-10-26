'use client';

import Link from 'next/link';
import { useState } from 'react';
import { t as tr } from '@/lib/i18n';

export type Action = {
  label: string;
  href?: string;
  toast?: string;
  onClick?: () => void;
};

export type Group = {
  title?: string;
  actions: Action[];
};

type Props = {
  icon?: string;
  title: string;
  subtitle?: string;
  breadcrumb?: string[];
  tabs?: { label: string; href: string; active?: boolean }[];
  groups: Group[];
  columns?: 2 | 3 | 4;
};

export default function ExploreOptions({
  icon = '▦',
  title,
  subtitle = 'Explore Options',
  breadcrumb,
  tabs,
  groups,
  columns = 3,
}: Props) {
  const [toast, setToast] = useState<string | null>(null);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }

  const gridCols = columns === 4
    ? 'md:grid-cols-2 lg:grid-cols-4'
    : columns === 3
    ? 'md:grid-cols-2 lg:grid-cols-3'
    : 'md:grid-cols-2';

  return (
    <div>
      {breadcrumb && breadcrumb.length > 0 && (
        <div className="text-xs text-gray-500 mb-1">{breadcrumb.map(b => tr(b)).join(' › ')}</div>
      )}

      <div className="flex flex-wrap items-baseline gap-3 mb-4">
        <span className="text-brand-600 text-2xl leading-none">{icon}</span>
        <h2 className="text-xl font-bold text-brand-700">{tr(title)}</h2>
        <span className="text-sm text-gray-500">{tr(subtitle)}</span>
      </div>

      {tabs && tabs.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4 border-b">
          {tabs.map(t => (
            <Link
              key={t.label}
              href={t.href}
              className={`px-3 py-2 text-sm rounded-t border-b-2 -mb-px ${
                t.active
                  ? 'border-brand-600 text-brand-700 font-semibold bg-brand-50'
                  : 'border-transparent text-gray-600 hover:text-brand-600'
              }`}
            >
              {tr(t.label)}
            </Link>
          ))}
        </div>
      )}

      <div className={`grid ${gridCols} gap-4`}>
        {groups.map((g, i) => (
          <div key={g.title || `g${i}`} className="card p-0 overflow-hidden">
            {g.title && (
              <div className="bg-brand-700 text-white text-xs font-semibold px-3 py-2">
                {tr(g.title)}
              </div>
            )}
            <ul className="divide-y">
              {g.actions.map(a => {
                const content = (
                  <>
                    <span className="flex items-center gap-2">
                      <span className="text-brand-600">▸</span>
                      <span>{tr(a.label)}</span>
                    </span>
                    <span className="text-xs text-gray-400">
                      {tr(a.href ? 'Open' : 'Report')}
                    </span>
                  </>
                );
                if (a.href) {
                  return (
                    <li key={a.label}>
                      <Link
                        href={a.href}
                        className="flex items-center justify-between px-3 py-2 text-sm hover:bg-brand-50"
                      >
                        {content}
                      </Link>
                    </li>
                  );
                }
                return (
                  <li key={a.label}>
                    <button
                      onClick={() => {
                        if (a.onClick) a.onClick();
                        else flash(a.toast || `${a.label}: coming soon.`);
                      }}
                      className="w-full flex items-center justify-between px-3 py-2 text-left text-sm hover:bg-brand-50"
                    >
                      {content}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {toast && (
        <div className="fixed bottom-4 right-4 bg-gray-900 text-white text-sm px-3 py-2 rounded shadow z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
