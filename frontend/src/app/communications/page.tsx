'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';

export default function CommunicationsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try { setRows(await api('/communications')); } catch (e: any) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const f = e.target as any;
    try {
      await api('/communications', { method: 'POST', body: JSON.stringify({
        channel: f.channel.value, audience: f.audience.value,
        subject: f.subject.value, body: f.body.value,
        recipient_count: Number(f.recipient_count.value) || 0,
      }) });
      f.reset(); load();
    } catch (e: any) { setErr(e.message); }
  }

  return (
    <Shell>
      <h2 className="text-xl font-bold text-brand-700 mb-4">Communication (SMS / Email)</h2>
      {err && <div className="text-red-700 text-sm mb-2">{err}</div>}

      <form onSubmit={send} className="card p-4 mb-4 grid md:grid-cols-3 gap-3 text-sm">
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

      <div className="card p-4 overflow-x-auto">
        <table className="table"><thead><tr><th>When</th><th>Channel</th><th>Audience</th><th>Subject</th><th>Recipients</th><th>By</th></tr></thead>
          <tbody>{rows.map(c => <tr key={c.id}>
            <td>{new Date(c.sent_at).toLocaleString()}</td>
            <td><span className="badge badge-gray uppercase">{c.channel}</span></td>
            <td>{c.audience}</td><td>{c.subject} <div className="text-xs text-gray-500">{c.body}</div></td>
            <td>{c.recipient_count}</td><td>{c.sent_by_name || '—'}</td></tr>)}
            {!rows.length && <tr><td colSpan={6} className="text-center py-3 text-gray-500">No messages sent.</td></tr>}
          </tbody></table>
      </div>
    </Shell>
  );
}
