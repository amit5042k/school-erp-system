'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';

export default function UsersPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function load() { try { setRows(await api('/users')); } catch (e: any) { setErr(e.message); } }
  useEffect(() => { load(); }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const f = e.target as any;
    try {
      await api('/users', { method: 'POST', body: JSON.stringify({
        username: f.username.value, password: f.password.value,
        role: f.role.value, full_name: f.full_name.value,
        email: f.email.value, phone: f.phone.value,
      }) });
      f.reset(); load();
    } catch (e: any) { setErr(e.message); }
  }

  async function toggle(u: any) {
    await api(`/users/${u.id}/active`, { method: 'POST', body: JSON.stringify({ active: !u.active }) });
    load();
  }
  async function reset(u: any) {
    const p = prompt(`Reset password for ${u.username} to:`);
    if (!p) return;
    await api(`/users/${u.id}/reset-password`, { method: 'POST', body: JSON.stringify({ password: p }) });
    alert('Password reset.');
  }

  return (
    <Shell>
      <h2 className="text-xl font-bold text-brand-700 mb-4">Users &amp; Roles</h2>
      {err && <div className="text-red-700 text-sm mb-2">{err}</div>}

      <form onSubmit={add} className="card p-4 mb-4 grid md:grid-cols-3 gap-3 text-sm">
        <div><label className="label">Username *</label><input className="input" name="username" required /></div>
        <div><label className="label">Password *</label><input className="input" name="password" type="password" required /></div>
        <div><label className="label">Role</label>
          <select className="input" name="role"><option>admin</option><option>teacher</option><option>student</option><option>parent</option></select>
        </div>
        <div><label className="label">Full Name *</label><input className="input" name="full_name" required /></div>
        <div><label className="label">Email</label><input className="input" name="email" type="email" /></div>
        <div><label className="label">Phone</label><input className="input" name="phone" /></div>
        <div className="md:col-span-3"><button className="btn btn-primary">Create User</button></div>
      </form>

      <div className="card p-4 overflow-x-auto">
        <table className="table"><thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Email</th><th>Active</th><th></th></tr></thead>
          <tbody>{rows.map(u => (
            <tr key={u.id}><td>{u.username}</td><td>{u.full_name}</td><td><span className="badge badge-gray">{u.role}</span></td>
            <td>{u.email || '—'}</td>
            <td>{u.active ? <span className="badge badge-green">Active</span> : <span className="badge badge-red">Disabled</span>}</td>
            <td>
              <button onClick={() => toggle(u)} className="text-xs text-brand-600 hover:underline mr-2">{u.active ? 'Disable' : 'Enable'}</button>
              <button onClick={() => reset(u)} className="text-xs text-amber-700 hover:underline">Reset Password</button>
            </td></tr>
          ))}
            {!rows.length && <tr><td colSpan={6} className="text-center py-3 text-gray-500">No users.</td></tr>}
          </tbody></table>
      </div>
    </Shell>
  );
}
