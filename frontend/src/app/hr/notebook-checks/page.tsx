'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, fmtDate, getUser, localDate } from '@/lib/api';
import { Flash, HrHeader, useFlash, useMasterNames } from '../_ui';

type Check = { id: number; teacher_id: number; teacher_name: string; class_name: string; class_section: string; subject: string;
  check_date: string; students_checked: number; total_students: number | null; remarks: string | null };
type ClassRow = { id: number; name: string; section: string; strength: number };

export default function NotebookChecksPage() {
  const me = getUser<any>();
  const isAdmin = me?.role === 'admin';
  const [rows, setRows] = useState<Check[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [teachers, setTeachers] = useState<{ id: number; full_name: string }[]>([]);
  const subjects = useMasterNames('subjects');
  const blank = { teacher_id: '', class_id: '', subject: '', check_date: localDate(), students_checked: '', total_students: '', remarks: '' };
  const [form, setForm] = useState(blank);
  const { msg, flash } = useFlash();

  const load = () => api<Check[]>('/hr/notebook-checks').then(setRows).catch(e => flash(e.message, false));
  useEffect(() => {
    load();
    api<ClassRow[]>('/classes').then(setClasses).catch(() => {});
    if (isAdmin) api<any[]>('/teachers').then(setTeachers).catch(() => {});
    /* eslint-disable-next-line */
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api('/hr/notebook-checks', { method: 'POST', body: JSON.stringify(form) });
      setForm({ ...blank, teacher_id: form.teacher_id, class_id: form.class_id, subject: form.subject });
      flash('Notebook check recorded.'); load();
    } catch (ex: any) { flash(ex.message, false); }
  }
  async function remove(c: Check) {
    if (!confirm('Delete this entry?')) return;
    try { await api(`/hr/notebook-checks/${c.id}`, { method: 'DELETE' }); load(); } catch (ex: any) { flash(ex.message, false); }
  }

  const strength = classes.find(c => String(c.id) === form.class_id)?.strength;
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <Shell>
      <HrHeader title="Notebook Checking" subtitle="Record notebook / copy checking. Reports summarise it by teacher and by class and subject."
        links={[{ label: 'TeacherWise report', href: '/report/notebook-teacherwise' }, { label: 'SubjectWise report', href: '/report/notebook-subjectwise' }]} />
      <Flash msg={msg} />
      <form onSubmit={save} className="card p-4 mb-4 grid md:grid-cols-4 gap-3 text-sm">
        {isAdmin && (
          <div><label className="label">Teacher *</label>
            <select className="input" required value={form.teacher_id} onChange={set('teacher_id')}>
              <option value="">-- Select --</option>{teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select></div>
        )}
        <div><label className="label">Class *</label>
          <select className="input" required value={form.class_id} onChange={set('class_id')}>
            <option value="">-- Select --</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name} {c.section}</option>)}
          </select></div>
        <div><label className="label">Subject *</label>
          <select className="input" required value={form.subject} onChange={set('subject')}>
            <option value="">-- Select --</option>{subjects.map(s => <option key={s}>{s}</option>)}
          </select></div>
        <div><label className="label">Date Checked *</label><input className="input" type="date" required max={localDate()} value={form.check_date} onChange={set('check_date')} /></div>
        <div><label className="label">Notebooks Checked *</label><input className="input" type="number" min={0} required value={form.students_checked} onChange={set('students_checked')} /></div>
        <div><label className="label">Total Students</label><input className="input" type="number" min={0} placeholder={strength != null ? `${strength} (class strength)` : 'Class strength'} value={form.total_students} onChange={set('total_students')} /></div>
        <div className="md:col-span-2"><label className="label">Remarks</label><input className="input" value={form.remarks} onChange={set('remarks')} /></div>
        <div className="flex items-end"><button className="btn btn-primary">Save</button></div>
      </form>

      <div className="card p-4 overflow-x-auto">
        <table className="table text-sm">
          <thead><tr><th>Date</th>{isAdmin && <th>Teacher</th>}<th>Class</th><th>Subject</th><th>Checked</th><th>Remarks</th><th></th></tr></thead>
          <tbody>
            {rows.map(c => (
              <tr key={c.id}>
                <td>{fmtDate(c.check_date)}</td>{isAdmin && <td>{c.teacher_name}</td>}<td>{c.class_name} {c.class_section}</td><td>{c.subject}</td>
                <td>{c.students_checked}{c.total_students != null && ` / ${c.total_students}`}</td><td>{c.remarks || '—'}</td>
                <td>{(isAdmin || c.teacher_id === me?.linkedId) && <button className="text-xs text-red-600 hover:underline" onClick={() => remove(c)}>Delete</button>}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7} className="text-center py-4 text-gray-500">No entries yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
