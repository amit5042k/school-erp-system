'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, getUser } from '@/lib/api';

type Student = {
  id: number; admission_no: string; full_name: string; gender: string;
  class_name: string; class_section: string; roll_no: number;
  father_name: string; contact: string;
};

export default function StudentsPage() {
  const [rows, setRows] = useState<Student[]>([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const user = getUser<any>();
  const isAdmin = user?.role === 'admin';

  const [form, setForm] = useState({
    admission_no: '', full_name: '', gender: 'M', roll_no: '', father_name: '', contact: '',
  });

  async function load() {
    try { setRows(await api<Student[]>('/students')); }
    catch (e: any) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function addStudent(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api('/students', { method: 'POST', body: JSON.stringify({
        ...form, roll_no: form.roll_no ? Number(form.roll_no) : null,
      }) });
      setAdding(false);
      setForm({ admission_no: '', full_name: '', gender: 'M', roll_no: '', father_name: '', contact: '' });
      load();
    } catch (e: any) { setError(e.message); }
  }

  const filtered = rows.filter(r =>
    !q || r.full_name.toLowerCase().includes(q.toLowerCase()) || r.admission_no.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <Shell>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-brand-700">Students</h2>
        {isAdmin && (
          <button className="btn btn-primary text-sm" onClick={() => setAdding(v => !v)}>
            {adding ? 'Cancel' : '+ Add Student'}
          </button>
        )}
      </div>

      {adding && (
        <form onSubmit={addStudent} className="card p-4 mb-4 grid md:grid-cols-3 gap-3 text-sm">
          <div><label className="label">Admission No</label>
            <input className="input" required value={form.admission_no} onChange={e => setForm({ ...form, admission_no: e.target.value })} /></div>
          <div><label className="label">Full Name</label>
            <input className="input" required value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} /></div>
          <div><label className="label">Gender</label>
            <select className="input" value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })}>
              <option value="M">Male</option><option value="F">Female</option><option value="O">Other</option>
            </select></div>
          <div><label className="label">Roll No</label>
            <input className="input" type="number" value={form.roll_no} onChange={e => setForm({ ...form, roll_no: e.target.value })} /></div>
          <div><label className="label">Father's Name</label>
            <input className="input" value={form.father_name} onChange={e => setForm({ ...form, father_name: e.target.value })} /></div>
          <div><label className="label">Contact</label>
            <input className="input" value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })} /></div>
          <div className="md:col-span-3"><button className="btn btn-primary">Save Student</button></div>
        </form>
      )}

      <div className="card p-4">
        <div className="flex justify-between mb-3">
          <input className="input max-w-xs" placeholder="Search by name or admission no"
            value={q} onChange={e => setQ(e.target.value)} />
          <span className="text-xs text-gray-500 self-center">{filtered.length} student(s)</span>
        </div>
        {error && <div className="text-red-700 text-sm mb-2">{error}</div>}
        <table className="table">
          <thead><tr>
            <th>Adm. No</th><th>Name</th><th>Class</th><th>Roll</th><th>Father</th><th>Contact</th>
          </tr></thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.id}>
                <td>{s.admission_no}</td>
                <td>{s.full_name}</td>
                <td>{s.class_name ? `${s.class_name} ${s.class_section}` : '—'}</td>
                <td>{s.roll_no || '—'}</td>
                <td>{s.father_name || '—'}</td>
                <td>{s.contact || '—'}</td>
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan={6} className="text-center text-gray-500 py-4">No students found.</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
