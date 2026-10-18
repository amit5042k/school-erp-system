'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, fmtDateTime, getUser } from '@/lib/api';

type Suggestion = { id: number; subject: string; body: string; status: 'new' | 'reviewed' | 'closed'; created_at: string };

export default function SuggestionsPage() {
  const isAdmin = getUser<any>()?.role === 'admin';
  const [rows, setRows] = useState<Suggestion[]>([]);
  const [form, setForm] = useState({ subject: '', body: '' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function flash(text: string, ok = true) { setMsg({ ok, text }); setTimeout(() => setMsg(null), 3000); }
  async function load() {
    if (!isAdmin) return;
    try { setRows(await api<Suggestion[]>('/suggestions')); } catch (e: any) { flash(e.message, false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api('/suggestions', { method: 'POST', body: JSON.stringify(form) });
      setForm({ subject: '', body: '' });
      flash('Thank you, your suggestion has been submitted.');
      load();
    } catch (e: any) { flash(e.message, false); }
  }

  async function setStatus(s: Suggestion, status: Suggestion['status']) {
    try { await api(`/suggestions/${s.id}`, { method: 'PUT', body: JSON.stringify({ status }) }); load(); }
    catch (e: any) { flash(e.message, false); }
  }

  return (
    <Shell>
      <div className="text-xs text-gray-500 mb-1">Communication › Suggestion Box</div>
      <h2 className="text-xl font-bold text-brand-700 mb-4">Suggestion Box</h2>

      {msg && (
        <div className={`text-sm rounded px-3 py-2 mb-3 border ${msg.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {msg.text}
        </div>
      )}

      <form onSubmit={submit} className="card p-4 mb-6 grid gap-3 text-sm max-w-2xl">
        <div className="text-gray-600">Suggestions are anonymous: your name is not stored with them.</div>
        <div><label className="label">Subject *</label><input className="input" required value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} /></div>
        <div><label className="label">Suggestion *</label><textarea className="input" rows={4} required value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} /></div>
        <div><button className="btn btn-primary">Submit</button></div>
      </form>

      {isAdmin && (
        <div className="card p-4 overflow-x-auto">
          <h3 className="font-semibold text-brand-700 mb-3">Principal&apos;s Inbox</h3>
          <table className="table">
            <thead><tr><th>Received</th><th>Subject</th><th>Suggestion</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map(s => (
                <tr key={s.id}>
                  <td className="whitespace-nowrap">{fmtDateTime(s.created_at)}</td>
                  <td>{s.subject}</td>
                  <td className="text-sm">{s.body}</td>
                  <td><span className={`badge ${s.status === 'new' ? 'badge-amber' : s.status === 'reviewed' ? 'badge-green' : 'badge-gray'}`}>{s.status}</span></td>
                  <td className="whitespace-nowrap">
                    {s.status === 'new' && <button className="text-xs text-brand-600 hover:underline mr-2" onClick={() => setStatus(s, 'reviewed')}>Mark Reviewed</button>}
                    {s.status !== 'closed' && <button className="text-xs text-gray-600 hover:underline" onClick={() => setStatus(s, 'closed')}>Close</button>}
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={5} className="text-center py-4 text-gray-500">No suggestions yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
