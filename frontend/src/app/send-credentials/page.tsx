'use client';

import { useEffect, useMemo, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';

type Role = 'teacher' | 'student' | 'parent';
type Person = { id: number; full_name: string; employee_no?: string; admission_no?: string; class_id?: number; class_name?: string; class_section?: string; phone?: string; contact?: string; email?: string };
type Result = { accounts: number; no_account: number; sent: number; failed: number; not_configured: number; skipped: number; credentials: { name: string; username: string; password: string }[] };

export default function SendCredentialsPage({ searchParams }: { searchParams: { role?: string } }) {
  const [role, setRole] = useState<Role>((['teacher', 'student', 'parent'].includes(searchParams.role || '') ? searchParams.role : 'teacher') as Role);
  const [people, setPeople] = useState<Person[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [classId, setClassId] = useState('');
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [channel, setChannel] = useState<'sms' | 'email' | 'screen'>('sms');
  const [status, setStatus] = useState<{ sms: boolean; email: boolean }>({ sms: false, email: false });
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ sms: boolean; email: boolean }>('/messaging/status').then(s => {
      setStatus(s);
      setChannel(s.sms ? 'sms' : s.email ? 'email' : 'screen');
    }).catch(() => {});
    api<any[]>('/classes').then(setClasses).catch(() => {});
  }, []);
  useEffect(() => {
    setPicked(new Set()); setRes(null);
    api<Person[]>(role === 'teacher' ? '/teachers' : '/students').then(setPeople).catch(e => setErr(e.message));
  }, [role]);

  const shown = useMemo(() => people.filter(p => role === 'teacher' || !classId || String(p.class_id) === classId), [people, role, classId]);
  const allPicked = shown.length > 0 && shown.every(p => picked.has(p.id));
  const toggle = (id: number) => setPicked(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function send() {
    if (!picked.size) return setErr('Select at least one person.');
    if (!confirm(`This creates a NEW temporary password for ${picked.size} account(s). Their old passwords will stop working. Continue?`)) return;
    setBusy(true); setErr(null); setRes(null);
    try {
      setRes(await api<Result>('/admin/send-credentials', { method: 'POST', body: JSON.stringify({ role, ids: [...picked], channel }) }));
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <Shell>
      <div className="text-xs text-gray-500 mb-1 no-print">Users › Send Usernames and Password</div>
      <h2 className="text-xl font-bold text-brand-700 mb-4 no-print">Send Usernames and Password</h2>

      <div className="card p-4 mb-4 grid md:grid-cols-4 gap-3 text-sm no-print">
        <div><label className="label">Send To</label>
          <select className="input" value={role} onChange={e => setRole(e.target.value as Role)}>
            <option value="teacher">Staff</option><option value="student">Students</option><option value="parent">Parents</option>
          </select></div>
        {role !== 'teacher' && (
          <div><label className="label">Class</label>
            <select className="input" value={classId} onChange={e => setClassId(e.target.value)}>
              <option value="">All Classes</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name} {c.section}</option>)}
            </select></div>
        )}
        <div><label className="label">Send By</label>
          <select className="input" value={channel} onChange={e => setChannel(e.target.value as any)}>
            <option value="sms" disabled={!status.sms}>SMS{status.sms ? '' : ' (not configured)'}</option>
            <option value="email" disabled={!status.email}>Email{status.email ? '' : ' (not configured)'}</option>
            <option value="screen">Show on screen (print slips)</option>
          </select></div>
        <div className="flex items-end"><button className="btn btn-primary" onClick={send} disabled={busy}>{busy ? 'Working…' : `Send to ${picked.size} selected`}</button></div>
        <div className="md:col-span-4 text-xs text-gray-500">
          Only people who already have a login are included (create logins in Users &amp; Roles). Each gets a new temporary password and must change it at first sign-in.
        </div>
      </div>

      {err && <div className="text-red-700 text-sm mb-3 no-print">{err}</div>}

      {res && (
        <div className="card p-4 mb-4 text-sm">
          <div className="no-print">
            <b>{res.accounts}</b> login(s) found
            {channel !== 'screen' && <> · sent <b>{res.sent}</b> · failed <b>{res.failed}</b> · no {channel === 'sms' ? 'phone' : 'email'} <b>{res.skipped}</b></>}
            {res.no_account > 0 && <> · <span className="text-amber-700">{res.no_account} selected without a login</span></>}
          </div>
          {res.credentials.length > 0 && (
            <>
              <div className="flex justify-between items-center mt-3 no-print">
                <span className="text-amber-700">Hand these out privately. They are shown only once.</span>
                <button className="btn bg-gray-200 text-sm" onClick={() => window.print()}>Print Slips</button>
              </div>
              <div className="grid md:grid-cols-3 gap-3 mt-3">
                {res.credentials.map(c => (
                  <div key={c.username} className="border border-dashed rounded p-3 print-avoid-break">
                    <div className="font-semibold">{c.name}</div>
                    <div>Username: <span className="font-mono">{c.username}</span></div>
                    <div>Password: <span className="font-mono">{c.password}</span></div>
                    <div className="text-[11px] text-gray-500 mt-1">Change this password after you sign in.</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div className="card p-4 overflow-x-auto no-print">
        <table className="table text-sm">
          <thead><tr>
            <th><input type="checkbox" checked={allPicked} onChange={() => setPicked(s => {
              const n = new Set(s); shown.forEach(p => (allPicked ? n.delete(p.id) : n.add(p.id))); return n; })} /></th>
            <th>{role === 'teacher' ? 'Emp No' : 'Adm No'}</th><th>Name</th>{role !== 'teacher' && <th>Class</th>}<th>Phone</th><th>Email</th>
          </tr></thead>
          <tbody>
            {shown.map(p => (
              <tr key={p.id} onClick={() => toggle(p.id)} className="cursor-pointer">
                <td><input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} onClick={e => e.stopPropagation()} /></td>
                <td>{p.employee_no || p.admission_no}</td><td>{p.full_name}</td>
                {role !== 'teacher' && <td>{p.class_name} {p.class_section}</td>}
                <td>{p.phone || p.contact || '—'}</td><td>{p.email || '—'}</td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={6} className="text-center py-4 text-gray-500">Nobody to show.</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
