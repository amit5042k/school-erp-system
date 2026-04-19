'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';

type ClassRow = { id: number; name: string; section: string; description?: string | null };
type Teacher = { id: number; full_name: string };

export default function SettingsPage() {
  const [tab, setTab] = useState<'classes' | 'section' | 'swap' | 'promote' | 'school'>('classes');
  const [s, setS] = useState<any>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [draft, setDraft] = useState<{ name: string; section: string; description: string }>({ name: '', section: '', description: '' });
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    api('/settings').then(setS).catch(() => {});
    api<ClassRow[]>('/classes').then(setClasses).catch(() => {});
    api<Teacher[]>('/teachers').then(setTeachers).catch(() => {});
  }, []);

  function flash(m: string) { setMsg(m); setTimeout(() => setMsg(null), 2500); }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api('/settings', { method: 'PUT', body: JSON.stringify(s) });
      flash('Settings saved.');
    } catch (e: any) { flash(e.message); }
  }

  async function addClass(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.name) return;
    try {
      await api('/classes', { method: 'POST', body: JSON.stringify(draft) });
      setDraft({ name: '', section: '', description: '' });
      setClasses(await api<ClassRow[]>('/classes'));
      flash('Class added.');
    } catch (e: any) { flash(e.message); }
  }

  const TABS: { key: typeof tab; label: string }[] = [
    { key: 'promote', label: 'Promote Students' },
    { key: 'swap',    label: 'Swap Section' },
    { key: 'classes', label: 'Manage Classes' },
    { key: 'section', label: 'Manage Section' },
    { key: 'school',  label: 'School Settings' },
  ];

  return (
    <Shell>
      <div className="text-xs text-gray-500 mb-1">Dashboard › Settings</div>
      <div className="flex items-baseline gap-3 mb-4">
        <span className="text-brand-600 text-2xl leading-none">⚙</span>
        <h2 className="text-xl font-bold text-brand-700">Settings</h2>
        <span className="text-sm text-gray-500">Manage Classes & Sections</span>
      </div>

      <div className="flex flex-wrap gap-2 mb-4 border-b">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm rounded-t border-b-2 -mb-px ${
              tab === t.key
                ? 'border-brand-600 text-brand-700 font-semibold bg-brand-50'
                : 'border-transparent text-gray-600 hover:text-brand-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {msg && <div className="text-sm bg-green-50 border border-green-200 text-green-700 rounded px-3 py-2 mb-3">{msg}</div>}

      {tab === 'classes' && (
        <div className="card p-4">
          <h3 className="font-semibold text-brand-700 mb-3">Manage Classes</h3>
          <form onSubmit={addClass} className="grid md:grid-cols-4 gap-2 text-sm mb-4">
            <input className="input" placeholder="Class Name" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
            <input className="input" placeholder="Section" value={draft.section} onChange={e => setDraft({ ...draft, section: e.target.value })} />
            <input className="input" placeholder="Description" value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} />
            <button className="btn btn-primary">Add New Class</button>
          </form>

          <div className="overflow-x-auto">
            <table className="table text-sm">
              <thead><tr>
                <th>Class Name</th><th>Section</th><th>Description</th><th>Approver Teacher</th><th>Status</th><th>Action</th>
              </tr></thead>
              <tbody>
                {classes.map(c => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{c.section}</td>
                    <td>{c.description || '—'}</td>
                    <td>
                      <select className="input">
                        <option value="">— Select Teacher —</option>
                        {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                      </select>
                    </td>
                    <td><span className="badge badge-green">Active</span></td>
                    <td>
                      <button className="btn btn-primary text-xs py-1 mr-1">Save</button>
                      <button className="text-xs text-red-600 hover:underline">Delete</button>
                    </td>
                  </tr>
                ))}
                {!classes.length && <tr><td colSpan={6} className="text-center py-4 text-gray-500">No classes defined.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2 mt-4">
            <button className="btn btn-primary">Save</button>
            <button className="btn bg-gray-200" onClick={() => setTab('school')}>Exit</button>
          </div>
        </div>
      )}

      {tab === 'section' && (
        <div className="card p-4 text-sm text-gray-600">
          <h3 className="font-semibold text-brand-700 mb-2">Manage Section</h3>
          Section management coming soon.
        </div>
      )}

      {tab === 'swap' && (
        <div className="card p-4 text-sm text-gray-600">
          <h3 className="font-semibold text-brand-700 mb-2">Swap Section</h3>
          Swap students between sections — coming soon.
        </div>
      )}

      {tab === 'promote' && (
        <div className="card p-4 text-sm text-gray-600">
          <h3 className="font-semibold text-brand-700 mb-2">Promote Students</h3>
          Promote students to next class/session — coming soon.
        </div>
      )}

      {tab === 'school' && s && (
        <form onSubmit={saveSettings} className="card p-4 grid md:grid-cols-2 gap-3 text-sm">
          <h3 className="md:col-span-2 font-semibold text-brand-700">School Settings</h3>
          <div><label className="label">School Name</label><input className="input" value={s.school_name || ''} onChange={e => setS({ ...s, school_name: e.target.value })} /></div>
          <div><label className="label">Academic Year</label><input className="input" value={s.academic_year || ''} onChange={e => setS({ ...s, academic_year: e.target.value })} /></div>
          <div className="md:col-span-2"><label className="label">Address</label><input className="input" value={s.address || ''} onChange={e => setS({ ...s, address: e.target.value })} /></div>
          <div><label className="label">Phone</label><input className="input" value={s.phone || ''} onChange={e => setS({ ...s, phone: e.target.value })} /></div>
          <div><label className="label">Email</label><input className="input" type="email" value={s.email || ''} onChange={e => setS({ ...s, email: e.target.value })} /></div>
          <div><label className="label">Website</label><input className="input" value={s.website || ''} onChange={e => setS({ ...s, website: e.target.value })} /></div>
          <div><label className="label">Logo URL</label><input className="input" value={s.logo_url || ''} onChange={e => setS({ ...s, logo_url: e.target.value })} /></div>
          <div className="md:col-span-2"><button className="btn btn-primary">Save Settings</button></div>
        </form>
      )}
    </Shell>
  );
}
