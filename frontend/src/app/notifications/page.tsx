'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, fmtDateTime } from '@/lib/api';

type Item = { id: number; title: string; body: string; link: string | null; kind: string | null; read_at: string | null; created_at: string };

export default function NotificationsPage() {
  const router = useRouter();
  const [data, setData] = useState<{ unread: number; items: Item[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = () => api<{ unread: number; items: Item[] }>('/push/inbox?limit=200').then(setData).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);

  async function open(n: Item) {
    if (!n.read_at) await api(`/push/inbox/${n.id}/read`, { method: 'POST' }).catch(() => {});
    if (n.link && n.link.startsWith('/')) router.push(n.link);
    else load();
  }
  async function readAll() {
    try { await api('/push/inbox/read-all', { method: 'POST' }); load(); } catch (e: any) { setErr(e.message); }
  }

  return (
    <Shell>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-brand-700">Notifications</h2>
          {!!data?.unread && <button className="text-sm text-brand-600 hover:underline" onClick={readAll}>Mark all as read</button>}
        </div>
        {err && <div className="text-red-700 text-sm mb-3">{err}</div>}
        <div className="card p-0 overflow-hidden">
          {data?.items.map(n => (
            <button key={n.id} type="button" onClick={() => open(n)}
              className={`w-full text-left px-4 py-3 border-b last:border-b-0 hover:bg-brand-50 ${n.read_at ? '' : 'bg-brand-50/60'}`}>
              <div className="flex justify-between gap-3">
                <span className={`text-sm ${n.read_at ? 'text-gray-700' : 'font-semibold text-gray-900'}`}>
                  {!n.read_at && <span className="inline-block w-2 h-2 rounded-full bg-accent-500 mr-2 align-middle" aria-label="Unread" />}
                  {n.title}
                </span>
                <span className="text-[11px] text-gray-400 whitespace-nowrap">{fmtDateTime(n.created_at)}</span>
              </div>
              <div className="text-sm text-gray-600 mt-0.5">{n.body}</div>
            </button>
          ))}
          {data && !data.items.length && <div className="px-4 py-8 text-center text-sm text-gray-500">No notifications yet. Updates about attendance, fees, results, notices and leave will appear here.</div>}
          {!data && !err && <div className="px-4 py-8 text-center text-sm text-gray-500">Loading…</div>}
        </div>
      </div>
    </Shell>
  );
}
