'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';
import { Flash, HrHeader, useFlash, useMasterNames } from '../_ui';

type Post = { id: number; designation: string; subject: string; sanctioned: number; filled: number; vacant: number; remarks: string | null };
const blank = { designation: '', subject: '', sanctioned: '1', remarks: '' };

export default function TeacherPostsPage() {
  const [rows, setRows] = useState<Post[]>([]);
  const [form, setForm] = useState(blank);
  const [editId, setEditId] = useState<number | null>(null);
  const designations = useMasterNames('designations');
  const subjects = useMasterNames('subjects');
  const { msg, flash } = useFlash();

  const load = () => api<Post[]>('/hr/teacher-posts').then(setRows).catch(e => flash(e.message, false));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api(editId ? `/hr/teacher-posts/${editId}` : '/hr/teacher-posts', { method: editId ? 'PUT' : 'POST', body: JSON.stringify(form) });
      setForm(blank); setEditId(null); flash('Post saved.'); load();
    } catch (ex: any) { flash(ex.message, false); }
  }
  async function remove(p: Post) {
    if (!confirm(`Delete the ${p.designation}${p.subject ? ` (${p.subject})` : ''} post?`)) return;
    try { await api(`/hr/teacher-posts/${p.id}`, { method: 'DELETE' }); load(); } catch (ex: any) { flash(ex.message, false); }
  }

  const totals = rows.reduce((t, r) => ({ s: t.s + r.sanctioned, f: t.f + r.filled, v: t.v + Math.max(0, r.vacant) }), { s: 0, f: 0, v: 0 });
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <Shell>
      <HrHeader title="Manage Teacher Post" subtitle="Sanctioned posts per designation and subject, against active staff in post."
        links={[{ label: 'Public job page', href: '/careers' }, { label: 'Applications', href: '/hr/applications' }]} />
      <Flash msg={msg} />
      <form onSubmit={save} className="card p-4 mb-4 grid md:grid-cols-5 gap-3 text-sm">
        <div><label className="label">Designation *</label>
          <select className="input" required value={form.designation} onChange={set('designation')}>
            <option value="">-- Select --</option>
            {form.designation && !designations.includes(form.designation) && <option>{form.designation}</option>}
            {designations.map(d => <option key={d}>{d}</option>)}
          </select></div>
        <div><label className="label">Subject</label>
          <select className="input" value={form.subject} onChange={set('subject')}>
            <option value="">Any subject</option>{subjects.map(s => <option key={s}>{s}</option>)}
          </select></div>
        <div><label className="label">Sanctioned Posts *</label><input className="input" type="number" min={0} max={500} required value={form.sanctioned} onChange={set('sanctioned')} /></div>
        <div><label className="label">Remarks</label><input className="input" value={form.remarks} onChange={set('remarks')} /></div>
        <div className="flex items-end gap-2">
          <button className="btn btn-primary">{editId ? 'Save Changes' : 'Add Post'}</button>
          {editId && <button type="button" className="text-xs text-gray-500 hover:underline" onClick={() => { setEditId(null); setForm(blank); }}>Cancel</button>}
        </div>
      </form>
      <div className="card p-4 overflow-x-auto">
        <table className="table text-sm">
          <thead><tr><th>Designation</th><th>Subject</th><th>Sanctioned</th><th>Filled</th><th>Vacant</th><th>Remarks</th><th></th></tr></thead>
          <tbody>
            {rows.map(p => (
              <tr key={p.id}>
                <td>{p.designation}</td><td>{p.subject || 'Any'}</td><td>{p.sanctioned}</td><td>{p.filled}</td>
                <td>{p.vacant > 0 ? <span className="badge badge-amber">{p.vacant} vacant</span> : p.vacant < 0 ? <span className="badge badge-red">{-p.vacant} over</span> : <span className="badge badge-green">Full</span>}</td>
                <td>{p.remarks || '—'}</td>
                <td className="whitespace-nowrap text-xs">
                  <button className="text-brand-600 hover:underline mr-2" onClick={() => { setEditId(p.id); setForm({ designation: p.designation, subject: p.subject, sanctioned: String(p.sanctioned), remarks: p.remarks || '' }); }}>Edit</button>
                  <button className="text-red-600 hover:underline" onClick={() => remove(p)}>Delete</button>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7} className="text-center py-4 text-gray-500">No posts defined.</td></tr>}
            {rows.length > 0 && <tr className="font-semibold bg-brand-50"><td colSpan={2}>Total</td><td>{totals.s}</td><td>{totals.f}</td><td>{totals.v}</td><td colSpan={2}></td></tr>}
          </tbody>
        </table>
        <p className="text-xs text-gray-500 mt-3">Filled = active employees whose designation (and subject, if set) matches. Vacant posts are listed on the public careers page.</p>
      </div>
    </Shell>
  );
}
