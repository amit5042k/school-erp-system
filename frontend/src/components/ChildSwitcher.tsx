'use client';

import { useEffect, useState } from 'react';
import { api, getStoredUser, setUser } from '@/lib/api';

type Child = { student_id: number; full_name: string; class_name: string | null; class_section: string | null; active: number };

/** For parents with two or more children: choose which child every page shows. Renders nothing otherwise. */
export default function ChildSwitcher({ className = '' }: { className?: string }) {
  const [kids, setKids] = useState<Child[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const u = getStoredUser<any>();
    if ((u?.baseRole || u?.role) !== 'parent') return;
    api<Child[]>('/family/children').then(setKids).catch(() => {});
  }, []);

  if (kids.length < 2) return null;
  const active = kids.find(k => k.active)?.student_id ?? kids[0].student_id;

  async function change(id: number) {
    if (id === active) return;
    setBusy(true);
    try {
      await api('/family/switch', { method: 'POST', body: JSON.stringify({ student_id: id }) });
      const u = getStoredUser<any>();
      if (u) setUser({ ...u, linkedId: id });
      window.location.reload();
    } catch { setBusy(false); }
  }

  return (
    <label className={`inline-flex items-center gap-1 text-xs ${className}`} title="Choose which child to view">
      <span className="opacity-80">Child</span>
      <select
        className="bg-brand-600 text-white text-xs rounded px-2 py-1 border border-brand-500 max-w-[11rem]"
        value={active}
        disabled={busy}
        onChange={e => change(Number(e.target.value))}
      >
        {kids.map(k => (
          <option key={k.student_id} value={k.student_id}>
            {k.full_name}{k.class_name ? ` (${k.class_name}${k.class_section ? ` ${k.class_section}` : ''})` : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
