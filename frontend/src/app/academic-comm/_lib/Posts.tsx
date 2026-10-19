'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import FileUpload, { FileLinks } from '@/components/FileUpload';
import { api, fmtDate } from '@/lib/api';
import { Breadcrumb, useLookups, useRole } from './lookups';

type Post = {
  id: number; scope: 'class' | 'section'; class_name: string | null; class_id: number | null; class_label: string; class_section: string | null;
  category: string; subject: string | null; title: string; body: string | null; due_date: string | null;
  attachments: string | null; attachment_names: string | null; posted_by_name: string | null; created_at: string;
};
const CATEGORIES = ['Homework', 'Assignment', 'Circular', 'Notice', 'Class Test', 'Project'];
const EMPTY = { class_name: '', class_id: '', category: 'Homework', subject: '', title: '', body: '', due_date: '' };

/** Academic Communication Classwise (all sections of a class) or Class Section wise (one section). */
export default function Posts({ scope }: { scope: 'class' | 'section' }) {
  const { isStaff } = useRole();
  const { opts } = useLookups(['classes', 'subjects']);
  const title = scope === 'class' ? 'Academic Communication Classwise' : 'Academic Communication Class Section wise';
  const [rows, setRows] = useState<Post[]>([]);
  const [form, setForm] = useState<Record<string, string>>(EMPTY);
  const [files, setFiles] = useState<{ url: string; name: string }[]>([]);
  const [editId, setEditId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const flash = (text: string, ok = true) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 3000); };

  async function load() {
    const qs = new URLSearchParams();
    if (isStaff) qs.set('scope', scope);
    if (category) qs.set('category', category);
    try { setRows(await api<Post[]>(`/comm/posts?${qs}`)); } catch (e: any) { flash(e.message, false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [category]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const body = {
      scope, class_name: scope === 'class' ? form.class_name : null, class_id: scope === 'section' ? Number(form.class_id) : null,
      category: form.category, subject: form.subject, title: form.title, body: form.body, due_date: form.due_date || null,
      attachments: files.map(f => f.url).join(','), attachment_names: files.map(f => f.name.replace(/,/g, ' ')).join(','),
    };
    try {
      await api(editId ? `/comm/posts/${editId}` : '/comm/posts', { method: editId ? 'PUT' : 'POST', body: JSON.stringify(body) });
      setForm(EMPTY); setFiles([]); setEditId(null); setOpen(false); flash('Posted.'); load();
    } catch (e: any) { flash(e.message, false); }
  }
  function edit(p: Post) {
    setForm({ class_name: p.class_name || '', class_id: p.class_id ? String(p.class_id) : '', category: p.category, subject: p.subject || '',
      title: p.title, body: p.body || '', due_date: p.due_date || '' });
    const urls = (p.attachments || '').split(',').filter(Boolean), names = (p.attachment_names || '').split(',');
    setFiles(urls.map((url, i) => ({ url, name: names[i] || `File ${i + 1}` })));
    setEditId(p.id); setOpen(true); window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function remove(p: Post) {
    if (!confirm(`Delete "${p.title}"?`)) return;
    try { await api(`/comm/posts/${p.id}`, { method: 'DELETE' }); load(); } catch (e: any) { flash(e.message, false); }
  }
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <Shell>
      <Breadcrumb trail={['Academic Communication', isStaff ? title : 'Class Communication']} />
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 className="text-xl font-bold text-brand-700">{isStaff ? title : 'Homework & Class Communication'}</h2>
        <div className="flex gap-2">
          <select className="input max-w-[11rem]" value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">All types</option>{CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
          {isStaff && <button className="btn btn-primary text-sm" onClick={() => { setOpen(o => !o); setForm(EMPTY); setFiles([]); setEditId(null); }}>{open ? 'Cancel' : '+ New Post'}</button>}
        </div>
      </div>
      {isStaff && (
        <p className="text-sm text-gray-500 mb-3">
          {scope === 'class' ? 'Goes to every section of the chosen class (e.g. all of Class 8).' : 'Goes to one section only (e.g. Class 8 A).'}
        </p>
      )}
      {msg && <div className={`text-sm rounded px-3 py-2 mb-3 border ${msg.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>{msg.text}</div>}

      {open && (
        <form onSubmit={save} className="card p-4 mb-4 grid md:grid-cols-3 gap-3 text-sm">
          {scope === 'class' ? (
            <div><label className="label">Class *</label>
              <select className="input" required value={form.class_name} onChange={set('class_name')}>
                <option value="">-- Select --</option>{opts.classNames.map(o => <option key={o.value} value={o.value}>{o.label} (all sections)</option>)}
              </select></div>
          ) : (
            <div><label className="label">Class Section *</label>
              <select className="input" required value={form.class_id} onChange={set('class_id')}>
                <option value="">-- Select --</option>{opts.classes.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select></div>
          )}
          <div><label className="label">Type</label>
            <select className="input" value={form.category} onChange={set('category')}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>
          <div><label className="label">Subject</label>
            <select className="input" value={form.subject} onChange={set('subject')}>
              <option value="">—</option>{opts.subjects.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select></div>
          <div className="md:col-span-2"><label className="label">Title *</label><input className="input" required value={form.title} onChange={set('title')} /></div>
          <div><label className="label">Due / Submission Date</label><input className="input" type="date" value={form.due_date} onChange={set('due_date')} /></div>
          <div className="md:col-span-3"><label className="label">Details</label><textarea className="input" rows={4} value={form.body} onChange={set('body')} /></div>
          <div className="md:col-span-2">
            <FileUpload multiple label="Attachments" onUploaded={up => setFiles(f => [...f, ...up.map(u => ({ url: u.url, name: u.name }))])} />
            {files.length > 0 && (
              <ul className="mt-2 text-xs space-y-1">
                {files.map(f => (
                  <li key={f.url} className="flex items-center gap-2">
                    <span>📎 {f.name}</span>
                    <button type="button" className="text-red-600 hover:underline" onClick={() => setFiles(x => x.filter(y => y.url !== f.url))}>remove</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="md:col-span-3"><button className="btn btn-primary">{editId ? 'Save Changes' : 'Post'}</button></div>
        </form>
      )}

      <div className="space-y-3">
        {rows.map(p => (
          <div key={p.id} className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-semibold text-brand-700">{p.title}</div>
                <div className="text-xs text-gray-500">
                  {p.scope === 'class' ? `${p.class_label} (all sections)` : `${p.class_label} ${p.class_section}`}
                  {p.subject ? ` · ${p.subject}` : ''} · {p.posted_by_name || 'Staff'} · {fmtDate(p.created_at)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="badge badge-gray">{p.category}</span>
                {p.due_date && <span className="badge badge-amber">Due {fmtDate(p.due_date)}</span>}
              </div>
            </div>
            {p.body && <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{p.body}</p>}
            {p.attachments && <div className="text-sm mt-2">📎 <FileLinks value={p.attachments} names={p.attachment_names} /></div>}
            {isStaff && (
              <div className="text-xs mt-2">
                <button className="text-brand-600 hover:underline mr-3" onClick={() => edit(p)}>Edit</button>
                <button className="text-red-600 hover:underline" onClick={() => remove(p)}>Delete</button>
              </div>
            )}
          </div>
        ))}
        {!rows.length && <div className="card p-6 text-center text-gray-500">Nothing posted yet.</div>}
      </div>
    </Shell>
  );
}
