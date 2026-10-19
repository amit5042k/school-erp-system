'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import FileUpload, { FileLinks } from '@/components/FileUpload';
import { api, getUser, fmtDateTime } from '@/lib/api';

type Announcement = { id: number; title: string; body: string; audience: string; posted_by_name: string; posted_at: string; attachment?: string | null; attachment_name?: string | null };

export default function AnnouncementsPage() {
  const [rows, setRows] = useState<Announcement[]>([]);
  const [form, setForm] = useState({ title: '', body: '', audience: 'all' });
  const [error, setError] = useState<string | null>(null);
  const user = getUser<any>();
  const canPost = user?.role === 'admin' || user?.role === 'teacher';
  const [file, setFile] = useState<{ url: string; name: string } | null>(null);

  async function load() { try { setRows(await api<Announcement[]>('/announcements')); } catch (e: any) { setError(e.message); } }
  useEffect(() => { load(); }, []);

  async function post(e: React.FormEvent) {
    e.preventDefault();
    try {
      const { id } = await api<{ id: number }>('/announcements', { method: 'POST', body: JSON.stringify(form) });
      if (file) await api(`/comm/announcements/${id}/attachment`, { method: 'PUT', body: JSON.stringify({ attachment: file.url, attachment_name: file.name }) });
      setForm({ title: '', body: '', audience: 'all' });
      setFile(null);
      load();
    } catch (e: any) { setError(e.message); }
  }

  async function remove(a: Announcement) {
    if (!confirm(`Delete "${a.title}"?`)) return;
    try { await api(`/announcements/${a.id}`, { method: 'DELETE' }); load(); } catch (e: any) { setError(e.message); }
  }

  return (
    <Shell>
      <h2 className="text-xl font-bold text-brand-700 mb-4">Announcements &amp; Circulars</h2>

      {canPost && (
        <form onSubmit={post} className="card p-4 mb-4 grid gap-3">
          <div><label className="label">Title</label>
            <input className="input" required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
          <div><label className="label">Message</label>
            <textarea className="input" rows={3} required value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} /></div>
          <div>
            <FileUpload label="Attachment (optional: circular PDF, image)" onUploaded={([f]) => setFile({ url: f.url, name: f.name })} />
            {file && <div className="text-xs mt-1">📎 {file.name} <button type="button" className="text-red-600 hover:underline ml-1" onClick={() => setFile(null)}>remove</button></div>}
          </div>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="label">Audience</label>
              <select className="input" value={form.audience} onChange={e => setForm({ ...form, audience: e.target.value })}>
                <option value="all">All</option>
                <option value="student">Students</option>
                <option value="teacher">Teachers</option>
                <option value="parent">Parents</option>
              </select>
            </div>
            <button className="btn btn-primary">Post</button>
          </div>
        </form>
      )}

      {error && <div className="text-red-700 text-sm mb-2">{error}</div>}

      <div className="space-y-3">
        {rows.map(a => (
          <div key={a.id} className="card p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-brand-700">{a.title}</h3>
              <span className="badge badge-gray">{a.audience}</span>
            </div>
            <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{a.body}</p>
            {a.attachment && <div className="text-sm mt-2">📎 <FileLinks value={a.attachment} names={a.attachment_name || 'Attachment'} /></div>}
            <div className="text-xs text-gray-500 mt-2">
              Posted by {a.posted_by_name || 'Admin'} on {fmtDateTime(a.posted_at)}
              {user?.role === 'admin' && <button className="text-red-600 hover:underline ml-3" onClick={() => remove(a)}>Delete</button>}
            </div>
          </div>
        ))}
        {!rows.length && <div className="card p-6 text-center text-gray-500">No announcements yet.</div>}
      </div>
    </Shell>
  );
}
