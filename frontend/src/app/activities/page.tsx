'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import FileUpload from '@/components/FileUpload';
import { api, fileUrl, fmtDate } from '@/lib/api';

type ClassRow = { id: number; name: string; section: string };
type Activity = {
  id: number; class_id: number | null; class_name?: string | null; class_section?: string | null; section?: string | null;
  name: string; activity_date: string; description?: string | null; file_names?: string | null; file_urls?: string | null;
};
type Item = { url: string; name: string };

const isImage = (u: string) => /\.(jpe?g|png|gif|webp)$/i.test(u);
const isVideo = (u: string) => /\.mp4$/i.test(u);
const filesOf = (a: Activity): Item[] => {
  const urls = (a.file_urls || '').split(',').filter(Boolean);
  const names = (a.file_names || '').split(',').map(s => s.trim());
  return urls.map((url, i) => ({ url, name: names[i] || `File ${i + 1}` }));
};

export default function ActivitiesPage() {
  const [tab, setTab] = useState<'create' | 'manage'>('create');
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [items, setItems] = useState<Activity[]>([]);
  const [files, setFiles] = useState<Item[]>([]);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function flash(text: string, ok = true) { setMsg({ ok, text }); setTimeout(() => setMsg(null), 3000); }
  async function loadItems() {
    try { setItems(await api<Activity[]>('/activities')); } catch (e: any) { flash(e.message, false); }
  }

  useEffect(() => {
    api<ClassRow[]>('/classes').then(setClasses).catch(() => {});
    loadItems();
  }, []);

  const saveFiles = (id: number, list: Item[]) => api(`/comm/activities/${id}/files`, { method: 'PUT', body: JSON.stringify({
    file_urls: list.map(f => f.url), file_names: list.map(f => f.name.replace(/,/g, ' ')),
  }) });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const f = e.target as any;
    const body = {
      class_id: f.class_id.value ? Number(f.class_id.value) : null,
      section: f.section.value,
      name: f.name.value,
      activity_date: f.activity_date.value,
      description: f.description.value,
    };
    try {
      const { id } = await api<{ id: number }>('/activities', { method: 'POST', body: JSON.stringify(body) });
      if (files.length) await saveFiles(id, files);
      f.reset();
      setFiles([]);
      flash('Activity saved.');
      loadItems();
    } catch (e: any) { flash(e.message, false); }
  }

  async function saveEditedFiles() {
    if (!editing) return;
    try { await saveFiles(editing.id, files); setEditing(null); setFiles([]); flash('Files updated.'); loadItems(); }
    catch (e: any) { flash(e.message, false); }
  }

  async function remove(a: Activity) {
    if (!confirm(`Delete "${a.name}"?`)) return;
    try { await api(`/activities/${a.id}`, { method: 'DELETE' }); loadItems(); }
    catch (e: any) { flash(e.message, false); }
  }

  const fileList = (
    <>
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {files.map(f => (
            <div key={f.url} className="relative border rounded p-1 text-[11px] w-24">
              {isImage(f.url) ? <img src={fileUrl(f.url)} alt="" className="w-full h-16 object-cover rounded" /> : <div className="h-16 grid place-items-center bg-gray-50">📎</div>}
              <div className="truncate" title={f.name}>{f.name}</div>
              <button type="button" className="text-red-600 hover:underline" onClick={() => setFiles(x => x.filter(y => y.url !== f.url))}>remove</button>
            </div>
          ))}
        </div>
      )}
    </>
  );

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
            <FileUpload multiple accept="image/*,video/mp4,.pdf" label="Upload File (multiple)"
              onUploaded={up => setFiles(f => [...f, ...up.map(u => ({ url: u.url, name: u.name }))])} />
            {fileList}
          </div>
          <div className="md:col-span-2"><label className="label">Description</label><textarea className="input" name="description" rows={3} /></div>
          <div className="md:col-span-2"><button className="btn btn-primary">Save</button></div>
        </form>
      )}

      {tab === 'manage' && editing && (
        <div className="card p-4 mb-4 text-sm">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-semibold text-brand-700">Files for “{editing.name}”</h3>
            <button className="text-xs text-gray-500 hover:underline" onClick={() => { setEditing(null); setFiles([]); }}>Cancel</button>
          </div>
          <FileUpload multiple accept="image/*,video/mp4,.pdf" label="Add more files"
            onUploaded={up => setFiles(f => [...f, ...up.map(u => ({ url: u.url, name: u.name }))])} />
          {fileList}
          <button className="btn btn-primary mt-3" onClick={saveEditedFiles}>Save Files</button>
        </div>
      )}

      {tab === 'manage' && (
        <div className="space-y-4">
          {items.map(a => {
            const list = filesOf(a);
            return (
              <div key={a.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-brand-700">{a.name}</div>
                    <div className="text-xs text-gray-500">
                      {a.class_name ? `${a.class_name} ${a.class_section}` : 'All classes'}{a.section ? ` · ${a.section}` : ''} · {fmtDate(a.activity_date)}
                    </div>
                  </div>
                  <div className="text-xs">
                    <button className="text-brand-600 hover:underline mr-3" onClick={() => { setEditing(a); setFiles(list); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Edit Files</button>
                    <button className="text-red-600 hover:underline" onClick={() => remove(a)}>Delete</button>
                  </div>
                </div>
                {a.description && <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{a.description}</p>}
                {list.length > 0 ? (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {list.map(f => (
                      <a key={f.url} href={fileUrl(f.url)} target="_blank" rel="noreferrer" className="block border rounded overflow-hidden w-28 text-[11px] hover:shadow" title={f.name}>
                        {isImage(f.url) ? <img src={fileUrl(f.url)} alt={f.name} className="w-full h-20 object-cover" />
                          : isVideo(f.url) ? <div className="h-20 grid place-items-center bg-gray-900 text-white text-xl">▶</div>
                          : <div className="h-20 grid place-items-center bg-gray-50 text-xl">📄</div>}
                        <div className="px-1 truncate">{f.name}</div>
                      </a>
                    ))}
                  </div>
                ) : a.file_names ? <div className="text-xs text-gray-500 mt-2">Files (names only, from before uploads were available): {a.file_names}</div> : null}
              </div>
            );
          })}
          {!items.length && <div className="card p-6 text-center text-gray-500">No activities yet.</div>}
        </div>
      )}
    </Shell>
  );
}
