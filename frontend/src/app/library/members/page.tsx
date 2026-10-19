'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, fmtDate, getUser, localDate } from '@/lib/api';

type Member = {
  id: number; member_type: 'student' | 'staff'; student_id: number | null; teacher_id: number | null; card_no: string; max_books: number;
  valid_from: string | null; valid_to: string | null; active: number; remarks: string | null; member_name: string;
  admission_no: string | null; employee_no: string | null; class: string | null; books_out: number;
};
type Settings = { fine_per_day: number; loan_days: number; default_max_books: number };

const BLANK = { member_type: 'student', student_id: '', teacher_id: '', card_no: '', max_books: '', valid_from: localDate(), valid_to: '', remarks: '' };

export default function LibraryMembersPage() {
  const isAdmin = getUser<any>()?.role === 'admin';
  const [rows, setRows] = useState<Member[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [form, setForm] = useState<Record<string, any>>(BLANK);
  const [editId, setEditId] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const flash = (text: string, ok = true) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), ok ? 3000 : 6000); };

  const load = () => {
    api<Member[]>('/lib/members').then(setRows).catch(e => flash(e.message, false));
    api<Settings>('/lib/settings').then(setSettings).catch(() => {});
  };
  useEffect(() => {
    load();
    api<any[]>('/students').then(s => setStudents(s.filter(x => (x.status || 'active') === 'active'))).catch(() => {});
    api<any[]>('/teachers').then(setTeachers).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      const body: Record<string, any> = {};
      for (const [k, v] of Object.entries(form)) if (v !== '') body[k] = v;
      if (body.student_id) body.student_id = Number(body.student_id);
      if (body.teacher_id) body.teacher_id = Number(body.teacher_id);
      if (body.max_books) body.max_books = Number(body.max_books);
      if (editId) {
        await api(`/lib/members/${editId}`, { method: 'PUT', body: JSON.stringify({ ...body, valid_to: form.valid_to || null, remarks: form.remarks }) });
        flash('Membership updated.');
      } else {
        const r = await api<{ card_no: string }>('/lib/members', { method: 'POST', body: JSON.stringify(body) });
        flash(`Library card ${r.card_no} created.`);
      }
      setForm(BLANK); setEditId(null); load();
    } catch (err: any) { flash(err.message, false); }
  }

  async function toggle(m: Member) {
    try { await api(`/lib/members/${m.id}`, { method: 'PUT', body: JSON.stringify({ active: m.active ? 0 : 1 }) }); load(); }
    catch (err: any) { flash(err.message, false); }
  }
  async function remove(m: Member) {
    if (!confirm(`Delete library card ${m.card_no}? Borrowing history is kept.`)) return;
    try { await api(`/lib/members/${m.id}`, { method: 'DELETE' }); load(); }
    catch (err: any) { flash(err.message, false); }
  }
  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    try { setSettings(await api<Settings>('/lib/settings', { method: 'PUT', body: JSON.stringify(settings) })); flash('Library settings saved.'); }
    catch (err: any) { flash(err.message, false); }
  }

  const today = localDate();
  const shown = rows.filter(m => !q || `${m.card_no} ${m.member_name} ${m.admission_no || ''} ${m.employee_no || ''}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <Shell>
      <div className="flex flex-wrap items-end justify-between gap-2 mb-4">
        <div>
          <div className="text-xs text-gray-500 mb-1">Library Management › Member Management</div>
          <h2 className="text-xl font-bold text-brand-700">Member Management</h2>
          <div className="text-sm text-gray-500">Library cards with borrowing limits and validity</div>
        </div>
        <div className="flex gap-2">
          <Link href="/library" className="btn bg-gray-200 text-sm">Library</Link>
          <Link href="/report/book-history" className="btn bg-gray-200 text-sm">Track Book History</Link>
        </div>
      </div>
      {msg && <div className={`text-sm rounded px-3 py-2 mb-3 border ${msg.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>{msg.text}</div>}

      {isAdmin && settings && (
        <form onSubmit={saveSettings} className="card p-4 mb-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <h3 className="col-span-2 md:col-span-4 font-semibold text-brand-700">Library Settings</h3>
          <div><label className="label">Late Fine per Day (₹)</label>
            <input className="input" type="number" min={0} step="0.5" value={settings.fine_per_day} onChange={e => setSettings({ ...settings, fine_per_day: Number(e.target.value) })} /></div>
          <div><label className="label">Loan Period (days)</label>
            <input className="input" type="number" min={1} value={settings.loan_days} onChange={e => setSettings({ ...settings, loan_days: Number(e.target.value) })} /></div>
          <div><label className="label">Books Allowed Without a Card</label>
            <input className="input" type="number" min={1} value={settings.default_max_books} onChange={e => setSettings({ ...settings, default_max_books: Number(e.target.value) })} /></div>
          <div className="flex items-end"><button className="btn btn-primary">Save Settings</button></div>
        </form>
      )}

      {isAdmin && (
        <form onSubmit={save} className="card p-4 mb-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <h3 className="col-span-2 md:col-span-4 font-semibold text-brand-700">{editId ? 'Edit Membership' : 'New Library Card'}</h3>
          {!editId && (
            <>
              <div><label className="label">Member Type</label>
                <select className="input" value={form.member_type} onChange={e => set('member_type', e.target.value)}>
                  <option value="student">Student</option><option value="staff">Staff</option>
                </select></div>
              {form.member_type === 'student' ? (
                <div><label className="label">Student *</label>
                  <select className="input" required value={form.student_id} onChange={e => set('student_id', e.target.value)}>
                    <option value="">-- Select --</option>
                    {students.filter(s => !rows.some(m => m.student_id === s.id)).map(s => <option key={s.id} value={s.id}>{s.admission_no} — {s.full_name}</option>)}
                  </select></div>
              ) : (
                <div><label className="label">Staff *</label>
                  <select className="input" required value={form.teacher_id} onChange={e => set('teacher_id', e.target.value)}>
                    <option value="">-- Select --</option>
                    {teachers.filter(t => !rows.some(m => m.teacher_id === t.id)).map(t => <option key={t.id} value={t.id}>{t.employee_no} — {t.full_name}</option>)}
                  </select></div>
              )}
            </>
          )}
          <div><label className="label">Card No</label><input className="input" placeholder="Auto" value={form.card_no} onChange={e => set('card_no', e.target.value)} /></div>
          <div><label className="label">Max Books</label><input className="input" type="number" min={1} placeholder={String(settings?.default_max_books ?? 2)} value={form.max_books} onChange={e => set('max_books', e.target.value)} /></div>
          <div><label className="label">Valid From</label><input className="input" type="date" value={form.valid_from} onChange={e => set('valid_from', e.target.value)} /></div>
          <div><label className="label">Valid To</label><input className="input" type="date" value={form.valid_to} onChange={e => set('valid_to', e.target.value)} /></div>
          <div className="col-span-2"><label className="label">Remarks</label><input className="input" value={form.remarks} onChange={e => set('remarks', e.target.value)} /></div>
          <div className="col-span-2 md:col-span-4 flex gap-2">
            <button className="btn btn-primary">{editId ? 'Save Changes' : 'Create Card'}</button>
            {editId && <button type="button" className="btn bg-gray-200" onClick={() => { setEditId(null); setForm(BLANK); }}>Cancel</button>}
          </div>
        </form>
      )}

      <div className="card p-4 overflow-x-auto">
        <div className="flex justify-between items-center mb-3 gap-2">
          <input className="input max-w-xs" placeholder="Search card, name…" value={q} onChange={e => setQ(e.target.value)} />
          <span className="text-xs text-gray-500">{shown.length} member(s)</span>
        </div>
        <table className="table text-sm">
          <thead><tr><th>Card No</th><th>Member</th><th>Type</th><th>Class / Emp No</th><th>Books Out</th><th>Valid</th><th>Status</th>{isAdmin && <th></th>}</tr></thead>
          <tbody>
            {shown.map(m => {
              const expired = m.valid_to && m.valid_to < today;
              return (
                <tr key={m.id} className={m.active ? '' : 'opacity-60'}>
                  <td className="font-mono text-xs">{m.card_no}</td>
                  <td className="font-medium">{m.member_name}</td>
                  <td className="capitalize">{m.member_type}</td>
                  <td>{m.member_type === 'student' ? `${m.admission_no} · ${m.class || '—'}` : m.employee_no}</td>
                  <td>{m.books_out} / {m.max_books}</td>
                  <td className="whitespace-nowrap">{fmtDate(m.valid_from)} – {m.valid_to ? fmtDate(m.valid_to) : 'no end'}</td>
                  <td><span className={`badge ${!m.active ? 'badge-gray' : expired ? 'badge-red' : 'badge-green'}`}>{!m.active ? 'Inactive' : expired ? 'Expired' : 'Active'}</span></td>
                  {isAdmin && (
                    <td className="text-xs whitespace-nowrap">
                      <button className="text-brand-600 hover:underline mr-2" onClick={() => {
                        setEditId(m.id);
                        setForm({ ...BLANK, card_no: m.card_no, max_books: String(m.max_books), valid_from: m.valid_from || '', valid_to: m.valid_to || '', remarks: m.remarks || '' });
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}>Edit</button>
                      <button className="text-amber-700 hover:underline mr-2" onClick={() => toggle(m)}>{m.active ? 'Deactivate' : 'Activate'}</button>
                      <button className="text-red-600 hover:underline" onClick={() => remove(m)}>Delete</button>
                    </td>
                  )}
                </tr>
              );
            })}
            {!shown.length && <tr><td colSpan={8} className="text-center text-gray-500 py-4">No library members yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
