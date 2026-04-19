'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, getUser } from '@/lib/api';

type Teacher = { id: number; employee_no: string; full_name: string; subject: string; qualification: string; phone: string; email: string };

export default function TeachersPage() {
  const [rows, setRows] = useState<Teacher[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const user = getUser<any>();
  const isAdmin = user?.role === 'admin';
  const [form, setForm] = useState({ employee_no: '', full_name: '', subject: '', qualification: '', phone: '', email: '' });

  async function load() { try { setRows(await api<Teacher[]>('/teachers')); } catch (e: any) { setError(e.message); } }
  useEffect(() => { load(); }, []);

  async function addTeacher(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api('/teachers', { method: 'POST', body: JSON.stringify(form) });
      setAdding(false);
      setForm({ employee_no: '', full_name: '', subject: '', qualification: '', phone: '', email: '' });
      load();
    } catch (e: any) { setError(e.message); }
  }

  return (
    <Shell>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-brand-700">Teachers / Staff</h2>
        {isAdmin && <button className="btn btn-primary text-sm" onClick={() => setAdding(v => !v)}>{adding ? 'Cancel' : '+ Add Teacher'}</button>}
      </div>

      {adding && (
        <form onSubmit={addTeacher} className="card p-4 mb-4 grid md:grid-cols-3 gap-3 text-sm">
          <div><label className="label">Employee No</label><input className="input" required value={form.employee_no} onChange={e => setForm({ ...form, employee_no: e.target.value })} /></div>
          <div><label className="label">Full Name</label><input className="input" required value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} /></div>
          <div><label className="label">Subject</label><input className="input" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} /></div>
          <div><label className="label">Qualification</label><input className="input" value={form.qualification} onChange={e => setForm({ ...form, qualification: e.target.value })} /></div>
          <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
          <div><label className="label">Email</label><input className="input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
          <div className="md:col-span-3"><button className="btn btn-primary">Save Teacher</button></div>
        </form>
      )}

      <div className="card p-4">
        {error && <div className="text-red-700 text-sm mb-2">{error}</div>}
        <table className="table">
          <thead><tr><th>Emp No</th><th>Name</th><th>Subject</th><th>Qualification</th><th>Phone</th><th>Email</th></tr></thead>
          <tbody>
            {rows.map(t => (
              <tr key={t.id}>
                <td>{t.employee_no}</td><td>{t.full_name}</td><td>{t.subject}</td>
                <td>{t.qualification}</td><td>{t.phone}</td><td>{t.email}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="text-center text-gray-500 py-4">No teachers found.</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
