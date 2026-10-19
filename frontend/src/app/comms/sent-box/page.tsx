'use client';

import Link from 'next/link';
import { Fragment, useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, fmtDateTime } from '@/lib/api';
import ConfigNotice from '../_lib/ConfigNotice';

type Batch = {
  batch_id: string; channel: 'sms' | 'email'; sent_at: string; subject: string | null; sample_body: string; sent_by_name: string | null;
  total: number; sent: number; failed: number; not_configured: number; resent: number;
};
type Msg = { id: number; recipient: string; recipient_name: string | null; body: string; status: string; error: string | null; resent_batch: string | null };
const BADGE: Record<string, string> = { sent: 'badge-green', failed: 'badge-red', not_configured: 'badge-amber' };

export default function SentBoxPage({ searchParams }: { searchParams: { batch?: string } }) {
  const [filters, setFilters] = useState({ from: '', to: '', channel: '', status: '', q: '' });
  const [rows, setRows] = useState<Batch[]>([]);
  const [open, setOpen] = useState<string | null>(searchParams.batch || null);
  const [detail, setDetail] = useState<Msg[]>([]);
  const [status, setStatus] = useState<{ sms: boolean; email: boolean } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const flash = (text: string, ok = true) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 4000); };

  async function load(f = filters) {
    const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
    try { setRows(await api<Batch[]>(`/comm/batches${qs ? `?${qs}` : ''}`)); } catch (e: any) { flash(e.message, false); }
  }
  useEffect(() => { load(); api<any>('/messaging/status').then(setStatus).catch(() => {}); /* eslint-disable-next-line */ }, []);
  useEffect(() => {
    if (!open) return setDetail([]);
    api<Msg[]>(`/comm/batches/${open}`).then(setDetail).catch(e => flash(e.message, false));
  }, [open]);

  async function resend(b: Batch) {
    if (!confirm(`Resend the ${b.failed + b.not_configured - b.resent} undelivered message(s) in this batch?`)) return;
    try {
      const r = await api<{ total: number; sent: number; failed: number }>(`/comm/batches/${b.batch_id}/resend`, { method: 'POST', body: '{}' });
      flash(`Resent ${r.total}: ${r.sent} delivered, ${r.failed} failed.`, r.failed === 0);
      load();
      if (open === b.batch_id) api<Msg[]>(`/comm/batches/${b.batch_id}`).then(setDetail).catch(() => {});
    } catch (e: any) { flash(e.message, false); }
  }
  const set = (k: keyof typeof filters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setFilters(f => ({ ...f, [k]: e.target.value }));

  return (
    <Shell>
      <div className="text-xs text-gray-500 mb-1">Communication › Message Sent Box</div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 className="text-xl font-bold text-brand-700">Message Sent Box</h2>
        <div className="flex gap-2">
          <Link href="/report/message-delivery" className="btn bg-gray-200 text-sm">Delivery Report</Link>
          <Link href="/comms/compose?mode=many" className="btn btn-primary text-sm">New Message</Link>
        </div>
      </div>
      <ConfigNotice status={status} />
      {msg && <div className={`text-sm rounded px-3 py-2 mb-3 border ${msg.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>{msg.text}</div>}

      <form className="card p-4 mb-4 grid md:grid-cols-6 gap-3 text-sm" onSubmit={e => { e.preventDefault(); load(); }}>
        <div><label className="label">From</label><input className="input" type="date" value={filters.from} onChange={set('from')} /></div>
        <div><label className="label">To</label><input className="input" type="date" value={filters.to} onChange={set('to')} /></div>
        <div><label className="label">Channel</label>
          <select className="input" value={filters.channel} onChange={set('channel')}><option value="">All</option><option value="sms">SMS</option><option value="email">Email</option></select></div>
        <div><label className="label">Status</label>
          <select className="input" value={filters.status} onChange={set('status')}>
            <option value="">All</option><option value="sent">All delivered</option><option value="failed">Has failures</option><option value="not_configured">Not configured</option>
          </select></div>
        <div><label className="label">Search</label><input className="input" value={filters.q} onChange={set('q')} placeholder="Text, number, name" /></div>
        <div className="flex items-end"><button className="btn btn-primary">Search</button></div>
      </form>

      <div className="card p-4 overflow-x-auto">
        <table className="table text-sm min-w-max">
          <thead><tr><th>When</th><th>Channel</th><th>Message</th><th>Sent By</th><th className="text-right">Total</th><th className="text-right">Delivered</th><th className="text-right">Failed</th><th className="text-right">Not configured</th><th></th></tr></thead>
          <tbody>
            {rows.map(b => {
              const pending = b.failed + b.not_configured - b.resent;
              return (
                <Fragment key={b.batch_id}>
                  <tr className={open === b.batch_id ? 'bg-brand-50' : ''}>
                    <td className="whitespace-nowrap">{fmtDateTime(b.sent_at)}</td>
                    <td><span className="badge badge-gray uppercase">{b.channel}</span></td>
                    <td className="max-w-md">{b.subject && <div className="font-medium">{b.subject}</div>}<div className="text-xs text-gray-600 truncate">{b.sample_body}</div></td>
                    <td>{b.sent_by_name || '—'}</td>
                    <td className="text-right">{b.total}</td><td className="text-right text-green-700">{b.sent}</td>
                    <td className="text-right text-red-700">{b.failed}</td><td className="text-right text-amber-700">{b.not_configured}</td>
                    <td className="whitespace-nowrap text-xs">
                      <button className="text-brand-600 hover:underline mr-2" onClick={() => setOpen(open === b.batch_id ? null : b.batch_id)}>{open === b.batch_id ? 'Hide' : 'Details'}</button>
                      {pending > 0 && <button className="text-amber-700 hover:underline" onClick={() => resend(b)}>Resend {pending}</button>}
                    </td>
                  </tr>
                  {open === b.batch_id && (
                    <tr><td colSpan={9} className="bg-gray-50">
                      <table className="w-full text-xs">
                        <thead><tr className="text-gray-500"><th className="text-left p-1">Name</th><th className="text-left p-1">To</th><th className="text-left p-1">Message</th><th className="text-left p-1">Status</th></tr></thead>
                        <tbody>{detail.map(m => (
                          <tr key={m.id} className="border-t">
                            <td className="p-1">{m.recipient_name || '—'}</td><td className="p-1 font-mono">{m.recipient}</td>
                            <td className="p-1 max-w-md whitespace-pre-wrap">{m.body}</td>
                            <td className="p-1"><span className={`badge ${BADGE[m.status] || 'badge-gray'}`}>{m.status.replace('_', ' ')}</span>
                              {m.resent_batch && m.status !== 'sent' && <span className="ml-1 text-green-700">resent ✓</span>}
                              {m.error && <div className="text-red-600">{m.error}</div>}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </td></tr>
                  )}
                </Fragment>
              );
            })}
            {!rows.length && <tr><td colSpan={9} className="text-center py-4 text-gray-500">No messages sent yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
