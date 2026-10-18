'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';

type Role = 'admin' | 'teacher' | 'student' | 'parent';
type Person = { id: number; full_name: string; admission_no?: string; employee_no?: string };

export default function UsersPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [students, setStudents] = useState<Person[]>([]);
  const [teachers, setTeachers] = useState<Person[]>([]);
  const [role, setRole] = useState<Role>('teacher');
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function load() { try { setRows(await api('/users')); } catch (e: any) { setErr(e.message); } }
  useEffect(() => {
    load();
    api<Person[]>('/students').then(setStudents).catch(() => {});
    api<Person[]>('/teachers').then(setTeachers).catch(() => {});
  }, []);

  const people = role === 'teacher' ? teachers : role === 'admin' ? [] : students;
  const nameOf = (u: any) => {
    if (!u.linked_id) return '—';
    const list = u.role === 'teacher' ? teachers : students;
    const p = list.find(x => x.id === u.linked_id);
    return p ? `${p.admission_no || p.employee_no} — ${p.full_name}` : `#${u.linked_id}`;
  };

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const f = e.target as any;
    setErr(null); setOk(null);
    try {
      await api('/users', { method: 'POST', body: JSON.stringify({
        username: f.username.value, password: f.password.value,
        role, full_name: f.full_name.value,
        email: f.email.value, phone: f.phone.value,
        linked_id: role === 'admin' ? null : Number(f.linked_id.value) || null,
      }) });
      f.reset(); setRole('teacher'); setOk('User created.'); load();
    } catch (e: any) { setErr(e.message); }
  }

  async function toggle(u: any) {
    setErr(null); setOk(null);
    try { await api(`/users/${u.id}/active`, { method: 'POST', body: JSON.stringify({ active: !u.active }) }); load(); }
    catch (e: any) { setErr(e.message); }
  }
  async function reset(u: any) {
    const p = prompt(`New password for ${u.username} (at least 6 characters):`);
    if (!p) return;
    setErr(null); setOk(null);
    try {
      await api(`/users/${u.id}/reset-password`, { method: 'POST', body: JSON.stringify({ password: p }) });
      setOk(`Password reset for ${u.username}.`);
    } catch (e: any) { setErr(e.message); }
  }

  return (
    <Shell>
      <h2 className="text-xl font-bold text-brand-700 mb-4">Users &amp; Roles</h2>
      {err && <div className="text-red-700 text-sm mb-2">{err}</div>}
      {ok && <div className="text-green-700 text-sm mb-2">{ok}</div>}

      <form onSubmit={add} className="card p-4 mb-4 grid md:grid-cols-3 gap-3 text-sm">
        <div><label className="label">Username *</label><input className="input" name="username" required /></div>
        <div><label className="label">Password * (min 6)</label><input className="input" name="password" type="password" minLength={6} required /></div>
        <div><label className="label">Role</label>
          <select className="input" name="role" value={role} onChange={e => setRole(e.target.value as Role)}>
            <option value="admin">admin</option><option value="teacher">teacher</option>
            <option value="student">student</option><option value="parent">parent</option>
          </select>
        </div>
        {role !== 'admin' && (
          <div><label className="label">{role === 'teacher' ? 'Linked Teacher *' : role === 'parent' ? 'Child (Student) *' : 'Linked Student *'}</label>
            <select className="input" name="linked_id" required>
              <option value="">-- Select --</option>
              {people.map(p => <option key={p.id} value={p.id}>{p.admission_no || p.employee_no} — {p.full_name}</option>)}
            </select>
          </div>
        )}
        <div><label className="label">Full Name *</label><input className="input" name="full_name" required /></div>
        <div><label className="label">Email</label><input className="input" name="email" type="email" /></div>
        <div><label className="label">Phone</label><input className="input" name="phone" /></div>
        <div className="md:col-span-3"><button className="btn btn-primary">Create User</button></div>
      </form>

      <div className="card p-4 overflow-x-auto">
        <table className="table"><thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Linked To</th><th>Email</th><th>Active</th><th></th></tr></thead>
          <tbody>{rows.map(u => (
            <tr key={u.id}><td>{u.username}</td><td>{u.full_name}</td><td><span className="badge badge-gray">{u.role}</span></td>
            <td className="text-xs">{nameOf(u)}</td>
            <td>{u.email || '—'}</td>
            <td>{u.active ? <span className="badge badge-green">Active</span> : <span className="badge badge-red">Disabled</span>}</td>
            <td className="whitespace-nowrap">
              <button onClick={() => toggle(u)} className="text-xs text-brand-600 hover:underline mr-2">{u.active ? 'Disable' : 'Enable'}</button>
              <button onClick={() => reset(u)} className="text-xs text-amber-700 hover:underline">Reset Password</button>
            </td></tr>
          ))}
            {!rows.length && <tr><td colSpan={7} className="text-center py-3 text-gray-500">No users.</td></tr>}
          </tbody></table>
      </div>
    </Shell>
  );
}
