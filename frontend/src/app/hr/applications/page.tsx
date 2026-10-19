'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import Shell from '@/components/Shell';
import { api, fmtDate, getToken } from '@/lib/api';
import { Flash, HrHeader, useFlash } from '../_ui';

type App = { id: number; full_name: string; email: string | null; phone: string | null; post_applied: string; subject: string | null;
  qualification: string | null; experience_years: number | null; current_school: string | null; message: string | null;
  resume_name: string | null; status: string; remarks: string | null; created_at: string };

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:5000/api';
const STATUSES = ['new', 'shortlisted', 'interviewed', 'rejected', 'hired'];
const BADGE: Record<string, string> = { new: 'badge-amber', shortlisted: 'badge-green', interviewed: 'badge-green', rejected: 'badge-red', hired: 'badge-gray' };

export default function ApplicationsPage() {
  const [rows, setRows] = useState<App[]>([]);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const { msg, flash } = useFlash();

  const load = () => api<App[]>('/hr/applications').then(setRows).catch(e => flash(e.message, false));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const shown = useMemo(() => rows.filter(a => (!status || a.status === status)
    && (!q || `${a.full_name} ${a.post_applied} ${a.subject || ''} ${a.email || ''} ${a.phone || ''}`.toLowerCase().includes(q.toLowerCase()))), [rows, status, q]);

  async function update(a: App, body: Partial<App>) {
    try { await api(`/hr/applications/${a.id}`, { method: 'PUT', body: JSON.stringify(body) }); load(); }
    catch (e: any) { flash(e.message, false); }
  }
  async function resume(a: App) {
    try {
      const res = await fetch(`${API_BASE}/hr/applications/${a.id}/resume`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not download resume');
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement('a');
      link.href = url; link.download = a.resume_name || `resume-${a.id}`; link.click();
      URL.revokeObjectURL(url);
    } catch (e: any) { flash(e.message, false); }
  }
  const careersUrl = typeof window !== 'undefined' ? `${window.location.origin}/careers` : '/careers';

  return (
    <Shell>
      <HrHeader title="Online Teacher Application Report" subtitle="Applications received through the public careers page."
        links={[{ label: 'Printable report', href: '/report/teacher-applications' }, { label: 'Teacher posts', href: '/hr/teacher-posts' }]} />
      <Flash msg={msg} />
      <div className="card p-4 mb-4 text-sm flex flex-wrap items-center gap-3">
        <span>Share this link to receive applications:</span>
        <code className="bg-gray-100 rounded px-2 py-1">{careersUrl}</code>
        <button className="text-brand-600 hover:underline" onClick={() => navigator.clipboard?.writeText(careersUrl).then(() => flash('Link copied.'))}>Copy</button>
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        <input className="input max-w-xs" placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} />
        <select className="input max-w-[10rem]" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">All statuses</option>{STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>
      <div className="card p-4 overflow-x-auto">
        <table className="table text-sm">
          <thead><tr><th>Received</th><th>Name</th><th>Post</th><th>Experience</th><th>Contact</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {shown.map(a => (
              <Fragment key={a.id}>
                <tr>
                  <td>{fmtDate(a.created_at)}</td>
                  <td className="font-medium">{a.full_name}</td>
                  <td>{a.post_applied}{a.subject && <div className="text-xs text-gray-500">{a.subject}</div>}</td>
                  <td>{a.experience_years != null ? `${a.experience_years} yrs` : '—'}</td>
                  <td className="text-xs">{a.phone && <div>{a.phone}</div>}{a.email && <div>{a.email}</div>}</td>
                  <td>
                    <select className="input text-xs py-1" value={a.status} onChange={e => update(a, { status: e.target.value })}>
                      {STATUSES.map(s => <option key={s}>{s}</option>)}
                    </select>
                    <span className={`badge ${BADGE[a.status]} mt-1`}>{a.status}</span>
                  </td>
                  <td className="whitespace-nowrap text-xs">
                    {a.resume_name && <button className="text-brand-600 hover:underline mr-2" onClick={() => resume(a)}>Resume</button>}
                    <button className="text-gray-600 hover:underline" onClick={() => setOpen(open === a.id ? null : a.id)}>{open === a.id ? 'Hide' : 'Details'}</button>
                  </td>
                </tr>
                {open === a.id && (
                  <tr className="bg-brand-50/50">
                    <td colSpan={7} className="text-sm">
                      <div className="grid md:grid-cols-3 gap-2">
                        <div><span className="text-gray-500">Qualification:</span> {a.qualification || '—'}</div>
                        <div><span className="text-gray-500">Current school:</span> {a.current_school || '—'}</div>
                        <div className="md:col-span-3"><span className="text-gray-500">Message:</span> {a.message || '—'}</div>
                        <div className="md:col-span-3 flex gap-2 items-center">
                          <span className="text-gray-500">Remarks:</span>
                          <input className="input" defaultValue={a.remarks || ''} onBlur={e => e.target.value !== (a.remarks || '') && update(a, { remarks: e.target.value })} />
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {!shown.length && <tr><td colSpan={7} className="text-center py-4 text-gray-500">No applications.</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
