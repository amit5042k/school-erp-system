'use client';

import { useState } from 'react';

export type Msg = { ok: boolean; text: string } | null;

export function useFlash() {
  const [msg, setMsg] = useState<Msg>(null);
  const flash = (text: string, ok = true) => { setMsg({ ok, text }); if (ok) setTimeout(() => setMsg(null), 3500); };
  return { msg, flash, clear: () => setMsg(null) };
}

export function Flash({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <div className={`text-sm rounded px-3 py-2 mb-3 border no-print ${msg.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
      {msg.text}
    </div>
  );
}

export const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

/** ISO string → value for <input type="datetime-local"> in the viewer's time zone. */
export function toLocalInput(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export const STATE_UI: Record<string, { label: string; cls: string }> = {
  upcoming: { label: 'Upcoming', cls: 'badge-gray' },
  open: { label: 'Open now', cls: 'badge-green' },
  in_progress: { label: 'In progress', cls: 'badge-amber' },
  submitted: { label: 'Submitted', cls: 'badge-green' },
  missed: { label: 'Missed', cls: 'badge-red' },
  draft: { label: 'Draft', cls: 'badge-gray' },
  published: { label: 'Published', cls: 'badge-green' },
  closed: { label: 'Closed', cls: 'badge-red' },
};
