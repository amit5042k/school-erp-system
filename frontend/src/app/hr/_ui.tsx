'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, sessionList } from '@/lib/api';

export type Msg = { ok: boolean; text: string } | null;

export function useFlash() {
  const [msg, setMsg] = useState<Msg>(null);
  const flash = (text: string, ok = true) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), ok ? 3000 : 6000); };
  return { msg, flash };
}

export function Flash({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <div className={`text-sm rounded px-3 py-2 mb-3 border ${msg.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
      {msg.text}
    </div>
  );
}

/** Names from a master list, e.g. useMasterNames('designations'). */
export function useMasterNames(type: string) {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    api<{ name: string }[]>(`/masters/${type}`).then(r => setNames(r.map(x => x.name))).catch(() => {});
  }, [type]);
  return names;
}

// The school's own leave types (Masters → Leave Types); the built-in list until they load.
export function useLeaveTypes() {
  const [names, setNames] = useState<string[]>(LEAVE_TYPES);
  useEffect(() => {
    api<{ name: string; active?: number }[]>('/masters/leave-types')
      .then(r => { const n = r.filter(x => x.active !== 0).map(x => x.name); if (n.length) setNames(n); }).catch(() => {});
  }, []);
  return names;
}

export function HrHeader({ title, subtitle, crumb = 'Human Resource', links }: {
  title: string; subtitle?: string; crumb?: string; links?: { label: string; href: string }[];
}) {
  return (
    <div className="mb-4">
      <div className="text-xs text-gray-500 mb-1 no-print">
        <Link href="/teachers" className="hover:underline">{crumb}</Link> › {title}
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-brand-700">{title}</h2>
          {subtitle && <div className="text-sm text-gray-500">{subtitle}</div>}
        </div>
        {links && (
          <div className="flex flex-wrap gap-3 text-sm no-print">
            {links.map(l => <Link key={l.href} href={l.href} className="text-brand-600 hover:underline">{l.label} →</Link>)}
          </div>
        )}
      </div>
    </div>
  );
}

export const LEAVE_TYPES = [
  'Casual Leave', 'Casual Leave Jan_June', 'Casual Leave July_Dec', 'Compensatory Casual leave',
  'Earned Leave', 'Leave without Pay', 'Medical Leave', 'On Duty',
];

// Sessions around the school's current one, written the way the school writes it (2026-27 or 2026-2027), so
// rules saved here match the session the leave balances use.
export function useSessions() {
  const [list, setList] = useState<string[]>([]);
  useEffect(() => { api<{ academic_year?: string }>('/settings').then(s => setList(sessionList(s?.academic_year))).catch(() => {}); }, []);
  return list;
}
