'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';

type ClassRow = { id: number; name: string; section: string };
type Activity = { id: number; class_id: number | null; class_name?: string | null; class_section?: string | null; section?: string | null; name: string; activity_date: string; description?: string | null; file_names?: string | null };

export default function ActivitiesPage() {
  const [tab, setTab] = useState<'create' | 'manage'>('create');
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [items, setItems] = useState<Activity[]>([]);
  const [files, setFiles] = useState<FileList | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function flash(text: string, ok = true) { setMsg({ ok, text }); setTimeout(() => setMsg(null), 3000); }
  async function loadItems() {
    try { setItems(await api<Activity[]>('/activities')); } catch (e: any) { flash(e.message, false); }
  }

  useEffect(() => {
    api<ClassRow[]>('/classes').then(setClasses).catch(() => {});
    loadItems();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const f = e.target as any;
    const body = {
      class_id: f.class_id.value ? Number(f.class_id.value) : null,
      section: f.section.value,
      name: f.name.value,
      activity_date: f.activity_date.value,
      description: f.description.value,
      file_names: files ? Array.from(files).map(x => x.name).join(', ') : null,
    };
    try {
      await api('/activities', { method: 'POST', body: JSON.stringify(body) });
      f.reset();
      setFiles(null);
      flash('Activity saved.');
      loadItems();
    } catch (e: any) { flash(e.message, false); }
  }

  async function remove(a: Activity) {
    if (!confirm(`Delete "${a.name}"?`)) return;
    try { await api(`/activities/${a.id}`, { method: 'DELETE' }); loadItems(); }
    catch (e: any) { flash(e.message, false); }
  }

  return (
    <Shell>
      <div className="text-xs text-gray-500 mb-1">Dashboard › Photos / Videos</div>
      <div className="flex items-baseline gap-3 mb-4">
        <span className="text-brand-600 text-2xl leading-none">🎬</span>
        <h2 className="text-xl font-bold text-brand-700">Manage Activities</h2>
        <span className="text-sm text-gray-500">Upload Photos, Videos & Class Events</span>
      </div>

      <div className="flex flex-wrap gap-2 mb-4 border-b">
        {(['create', 'manage'] as const).map(k => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3 py-2 text-sm rounded-t border-b-2 -mb-px ${tab === k ? 'border-brand-600 text-brand-700 font-semibold bg-brand-50' : 'border-transparent text-gray-600 hover:text-brand-600'}`}>
            {k === 'create' ? 'Create Activity' : 'Manage'}
          </button>
        ))}
      </div>

      {msg && (
        <div className={`text-sm rounded px-3 py-2 mb-3 border ${msg.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {msg.text}
        </div>
      )}

      {tab === 'create' && (
        <form onSubmit={save} className="card p-4 grid md:grid-cols-2 gap-3 text-sm">
          <h3 className="md:col-span-2 font-semibold text-brand-700">Create Activity</h3>
          <div><label className="label">Class</label>
            <select className="input" name="class_id">
              <option value="">All Classes</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name} {c.section}</option>)}
            </select></div>
          <div><label className="label">Section</label><input className="input" name="section" placeholder="All Sections" /></div>
          <div className="md:col-span-2"><label className="label">Activity Name *</label><input className="input" name="name" required /></div>
          <div><label className="label">Activity Date *</label><input className="input" name="activity_date" type="date" required /></div>
          <div>
            <label className="label">Upload File (multiple)</label>
            <input className="input" type="file" multiple onChange={e => setFiles(e.target.files)} />
            <div className="text-[11px] text-gray-500 mt-1">File storage isn&apos;t set up yet: only the file names are saved.</div>
          </div>
          <div className="md:col-span-2"><label className="label">Description</label><textarea className="input" name="description" rows={3} /></div>
          <div className="md:col-span-2"><button className="btn btn-primary">Save</button></div>
        </form>
      )}

      {tab === 'manage' && (
        <div className="card p-4 overflow-x-auto">
          <h3 className="font-semibold text-brand-700 mb-3">Manage Activities</h3>
          <table className="table">
            <thead><tr><th>Name</th><th>Class</th><th>Date</th><th>Files</th><th>Description</th><th></th></tr></thead>
            <tbody>
              {items.map(a => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td>{a.class_name ? `${a.class_name} ${a.class_section}` : 'All'} {a.section}</td>
                  <td>{a.activity_date}</td>
                  <td className="text-xs">{a.file_names || '—'}</td>
                  <td className="text-xs text-gray-500">{a.description || '—'}</td>
                  <td><button className="text-xs text-red-600 hover:underline" onClick={() => remove(a)}>Delete</button></td>
                </tr>
              ))}
              {!items.length && <tr><td colSpan={6} className="text-center text-gray-500 py-4">No activities yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
