'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, fmtDateTime, parseDate } from '@/lib/api';

type QuickLink = { label: string; onClick?: () => void };

export default function CommunicationsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d');

  async function load() {
    try { setRows(await api('/communications')); } catch (e: any) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);

  function flash(m: string) { setToast(m); setTimeout(() => setToast(null), 2400); }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const f = e.target as any;
    try {
      await api('/communications', { method: 'POST', body: JSON.stringify({
        channel: f.channel.value, audience: f.audience.value,
        subject: f.subject.value, body: f.body.value,
        recipient_count: Number(f.recipient_count.value) || 0,
      }) });
      f.reset(); setSending(false); load();
    } catch (e: any) { setErr(e.message); }
  }

  const quickLinks: QuickLink[] = [
    { label: 'Staff Communication',       onClick: () => setSending(true) },
    { label: 'Manage Staff Groups',       onClick: () => flash('Manage Staff Groups: coming soon.') },
    { label: 'SMS to Selected Students',  onClick: () => setSending(true) },
    { label: 'SMS to Many',               onClick: () => setSending(true) },
    { label: 'Manage Student Groups',     onClick: () => flash('Manage Student Groups: coming soon.') },
    { label: 'SMS Classwise',             onClick: () => setSending(true) },
    { label: 'Transport Communication',   onClick: () => setSending(true) },
    { label: 'Message Sent Box',          onClick: () => document.getElementById('msg-box')?.scrollIntoView({ behavior: 'smooth' }) },
  ];

  const now = Date.now();
  const windowMs = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const filtered = rows.filter(r => (now - (parseDate(r.sent_at)?.getTime() ?? 0)) / 86400000 <= windowMs);
  const totalSms = filtered.filter(r => r.channel === 'sms').reduce((n, r) => n + (r.recipient_count || 0), 0);
  const totalPush = filtered.filter(r => r.channel === 'push').reduce((n, r) => n + (r.recipient_count || 0), 0);
  const totalEmail = filtered.filter(r => r.channel === 'email').reduce((n, r) => n + (r.recipient_count || 0), 0);

  return (
    <Shell>
      <div className="text-xs text-gray-500 mb-1">Dashboard › Communication</div>
      <div className="flex items-baseline gap-3 mb-4">
        <span className="text-brand-600 text-2xl leading-none">💬</span>
        <h2 className="text-xl font-bold text-brand-700">Communication</h2>
        <span className="text-sm text-gray-500">Send & Track Messages</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
        {quickLinks.map(q => (
          <button key={q.label} onClick={q.onClick}
            className="card p-4 text-sm text-left hover:bg-brand-50 border border-brand-100">
            <div className="text-brand-600 text-xl mb-1">✉</div>
            <div className="font-semibold text-brand-700 leading-tight">{q.label}</div>
          </button>
        ))}
      </div>

      <div className="card p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-brand-700">Sent SMS / Push Summary</h3>
          <select className="input max-w-[10rem]" value={period} onChange={e => setPeriod(e.target.value as any)}>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded border border-brand-100 bg-brand-50 p-3">
            <div className="text-xs text-brand-700 uppercase">SMS</div>
            <div className="text-2xl font-bold text-brand-700">{totalSms}</div>
          </div>
          <div className="rounded border border-green-100 bg-green-50 p-3">
            <div className="text-xs text-green-700 uppercase">Push</div>
            <div className="text-2xl font-bold text-green-700">{totalPush}</div>
          </div>
          <div className="rounded border border-amber-100 bg-amber-50 p-3">
            <div className="text-xs text-amber-700 uppercase">Email</div>
            <div className="text-2xl font-bold text-amber-700">{totalEmail}</div>
          </div>
        </div>
      </div>

      {sending && (
        <form onSubmit={send} className="card p-4 mb-6 grid md:grid-cols-3 gap-3 text-sm">
          <div className="md:col-span-3 flex items-center justify-between">
            <h3 className="font-semibold text-brand-700">Compose Message</h3>
            <button type="button" className="text-xs text-gray-500 hover:underline" onClick={() => setSending(false)}>Cancel</button>
          </div>
          <div><label className="label">Channel</label>
            <select className="input" name="channel"><option value="sms">SMS</option><option value="email">Email</option><option value="push">Push</option></select>
          </div>
          <div><label className="label">Audience</label>
            <select className="input" name="audience"><option value="all">All</option><option value="student">Students</option><option value="parent">Parents</option><option value="teacher">Teachers</option></select>
          </div>
          <div><label className="label">Recipient count</label><input className="input" name="recipient_count" type="number" defaultValue={0} /></div>
          <div className="md:col-span-3"><label className="label">Subject</label><input className="input" name="subject" /></div>
          <div className="md:col-span-3"><label className="label">Message *</label><textarea className="input" name="body" rows={3} required /></div>
          <div className="md:col-span-3"><button className="btn btn-primary">Send &amp; Log</button></div>
        </form>
      )}

      <div id="msg-box" className="card p-4 overflow-x-auto">
        <h3 className="font-semibold text-brand-700 mb-3">Message Sent Box</h3>
        {err && <div className="text-red-700 text-sm mb-2">{err}</div>}
        <table className="table"><thead><tr><th>When</th><th>Channel</th><th>Audience</th><th>Subject</th><th>Recipients</th><th>By</th></tr></thead>
          <tbody>{rows.map(c => <tr key={c.id}>
            <td>{fmtDateTime(c.sent_at)}</td>
            <td><span className="badge badge-gray uppercase">{c.channel}</span></td>
            <td>{c.audience}</td><td>{c.subject} <div className="text-xs text-gray-500">{c.body}</div></td>
            <td>{c.recipient_count}</td><td>{c.sent_by_name || '—'}</td></tr>)}
            {!rows.length && <tr><td colSpan={6} className="text-center py-3 text-gray-500">No messages sent.</td></tr>}
          </tbody></table>
      </div>

      {toast && (
        <div className="fixed bottom-4 right-4 bg-gray-900 text-white text-sm px-3 py-2 rounded shadow z-50">{toast}</div>
      )}
    </Shell>
  );
}
