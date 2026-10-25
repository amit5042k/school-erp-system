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
  const [roleKey, setRoleKey] = useState('teacher');
  const [staffRoles, setStaffRoles] = useState<{ key: string; name: string }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function load() { try { setRows(await api('/users')); } catch (e: any) { setErr(e.message); } }
  useEffect(() => {
    load();
    api<Person[]>('/students').then(setStudents).catch(() => {});
    api<Person[]>('/teachers').then(setTeachers).catch(() => {});
    api<{ roles: { key: string; name: string }[] }>('/roles').then(r => setStaffRoles(r.roles)).catch(() => {});
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
        role, role_key: role === 'teacher' ? roleKey : undefined, full_name: f.full_name.value,
        email: f.email.value, phone: f.phone.value,
        linked_id: role === 'admin' ? null : Number(f.linked_id.value) || null,
      }) });
      f.reset(); setRole('teacher'); setRoleKey('teacher'); setOk('User created.'); load();
    } catch (e: any) { setErr(e.message); }
  }

  async function toggle(u: any) {
    setErr(null); setOk(null);
    try { await api(`/users/${u.id}/active`, { method: 'POST', body: JSON.stringify({ active: !u.active }) }); load(); }
    catch (e: any) { setErr(e.message); }
  }
  async function changeRole(u: any, key: string) {
    setErr(null); setOk(null);
    try { await api(`/users/${u.id}/role`, { method: 'POST', body: JSON.stringify({ role_key: key }) }); setOk(`${u.username} is now ${staffRoles.find(r => r.key === key)?.name || key}.`); load(); }
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
            <option value="teacher">Staff</option><option value="student">Student</option>
            <option value="parent">Parent</option><option value="admin">Super Admin</option>
          </select>
        </div>
        {role === 'teacher' && (
          <div><label className="label">Staff Role</label>
            <select className="input" value={roleKey} onChange={e => setRoleKey(e.target.value)}>
              {(staffRoles.length ? staffRoles : [{ key: 'teacher', name: 'Teacher' }]).map(r => <option key={r.key} value={r.key}>{r.name}</option>)}
            </select>
            <div className="text-[11px] text-gray-500 mt-1">What each role can do is set in <a className="text-brand-600 underline" href="/roles">Roles &amp; Permissions</a>.</div>
          </div>
        )}
        {role !== 'admin' && (
          <div><label className="label">{role === 'teacher' ? 'Linked Staff Record *' : role === 'parent' ? 'Child (Student) *' : 'Linked Student *'}</label>
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
            <tr key={u.id}><td>{u.username}</td><td>{u.full_name}</td><td>
              {u.role === 'teacher' && staffRoles.length ? (
                <select className="input py-0.5 text-xs w-44" value={u.role_key || 'teacher'} onChange={e => changeRole(u, e.target.value)}>
                  {staffRoles.map(r => <option key={r.key} value={r.key}>{r.name}</option>)}
                </select>
              ) : <span className="badge badge-gray">{u.role_name || u.role}</span>}
            </td>
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
