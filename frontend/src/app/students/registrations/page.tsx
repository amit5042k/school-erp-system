'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Shell from '@/components/Shell';
import { api, fmtDate, fmtMoney, localDate } from '@/lib/api';
import { Notice, PageHead, useClasses, useFlash } from '../_lib/shared';

type Reg = {
  id: number; reg_no: string; reg_date: string; session: string; prospectus_id: number | null; prospectus_no?: string | null;
  class_id: number | null; class_name?: string; class_section?: string; first_name: string; last_name?: string; gender?: string;
  dob?: string; father_name?: string; mother_name?: string; phone?: string; email?: string; address?: string; last_school?: string;
  registration_fee: number; test_date?: string; test_marks?: number | null; interview_status: string; status: string;
  student_id?: number | null; admission_no?: string | null; remarks?: string;
};
type Prospectus = { id: number; prospectus_no: string; first_name: string; last_name?: string; class_name?: string; class_section?: string };

const BLANK = { prospectus_id: '', reg_date: localDate(), class_id: '', first_name: '', last_name: '', gender: '', dob: '', father_name: '', mother_name: '', phone: '', email: '', address: '', last_school: '', test_date: '' };
const STATUS_BADGE: Record<string, string> = { registered: 'badge-gray', selected: 'badge-green', waitlisted: 'badge-amber', rejected: 'badge-red', admitted: 'badge-green' };

export default function RegistrationsPage() {
  const classes = useClasses();
  const [rows, setRows] = useState<Reg[]>([]);
  const [prospectus, setProspectus] = useState<Prospectus[]>([]);
  const [form, setForm] = useState<Record<string, any>>(BLANK);
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState('');
  const [edit, setEdit] = useState<Record<number, { test_date: string; test_marks: string; interview_status: string; remarks: string }>>({});
  const { msg, flash } = useFlash();

  const load = () => {
    api<Reg[]>('/stu/registrations').then(setRows).catch(e => flash(e.message, false));
    api<Prospectus[]>('/prospectus').then(setProspectus).catch(() => {});
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const unregistered = useMemo(() => prospectus.filter(p => !rows.some(r => r.prospectus_id === p.id)), [prospectus, rows]);
  const shown = rows.filter(r => !filter || r.status === filter);
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  async function add(e: React.FormEvent) {
    e.preventDefault();
    try {
      const body: Record<string, any> = {};
      for (const [k, v] of Object.entries(form)) if (v !== '') body[k] = v;
      if (body.prospectus_id) body.prospectus_id = Number(body.prospectus_id);
      if (body.class_id) body.class_id = Number(body.class_id);
      const r = await api<{ reg_no: string }>('/stu/registrations', { method: 'POST', body: JSON.stringify(body) });
      flash(`Registration ${r.reg_no} saved.`);
      setForm(BLANK); setAdding(false); load();
    } catch (err: any) { flash(err.message, false); }
  }

  async function saveResult(r: Reg) {
    const e = edit[r.id];
    try {
      await api(`/stu/registrations/${r.id}`, { method: 'PUT', body: JSON.stringify({ ...e, test_marks: e.test_marks === '' ? null : Number(e.test_marks) }) });
      setEdit(x => { const n = { ...x }; delete n[r.id]; return n; });
      flash(`${r.reg_no} updated.`); load();
    } catch (err: any) { flash(err.message, false); }
  }

  async function remove(r: Reg) {
    if (!confirm(`Delete registration ${r.reg_no}?`)) return;
    try { await api(`/stu/registrations/${r.id}`, { method: 'DELETE' }); load(); }
    catch (err: any) { flash(err.message, false); }
  }

  const fromProspectus = !!form.prospectus_id;
  const input = (k: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div><label className="label">{label}{props.required ? ' *' : ''}</label><input className="input" value={form[k]} onChange={e => set(k, e.target.value)} {...props} /></div>
  );

  return (
    <Shell>
      <PageHead crumb="Student › Add Student Registrations" title="Student Registrations" subtitle="Applicants after prospectus: test, interview and admission">
        <button className="btn btn-primary text-sm" onClick={() => setAdding(v => !v)}>{adding ? 'Cancel' : '+ Add Registration'}</button>
        <Link href="/report/student-registrations" className="btn bg-gray-200 text-sm">Registrations Report</Link>
        <Link href="/report/registrations-prospectus" className="btn bg-gray-200 text-sm">Registrations & Prospectus</Link>
      </PageHead>
      <Notice msg={msg} />

      {adding && (
        <form onSubmit={add} className="card p-4 mb-4 grid md:grid-cols-4 gap-3 text-sm">
          <div className="md:col-span-2"><label className="label">From Prospectus</label>
            <select className="input" value={form.prospectus_id} onChange={e => set('prospectus_id', e.target.value)}>
              <option value="">Walk-in (no prospectus)</option>
              {unregistered.map(p => (
                <option key={p.id} value={p.id}>{p.prospectus_no} — {[p.first_name, p.last_name].filter(Boolean).join(' ')}{p.class_name ? ` (${p.class_name} ${p.class_section || ''})` : ''}</option>
              ))}
            </select>
            {fromProspectus && <div className="text-[11px] text-gray-500 mt-1">Details are copied from the prospectus; fill a field here only to override it.</div>}
          </div>
          {input('reg_date', 'Registration Date', { type: 'date' })}
          {input('test_date', 'Entrance Test Date', { type: 'date' })}
          <div><label className="label">Class Applied</label>
            <select className="input" value={form.class_id} onChange={e => set('class_id', e.target.value)}>
              <option value="">{fromProspectus ? 'As on prospectus' : '-- Select --'}</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name} {c.section}</option>)}
            </select></div>
          {input('first_name', 'First Name', { required: !fromProspectus })}
          {input('last_name', 'Last Name')}
          <div><label className="label">Gender</label>
            <select className="input" value={form.gender} onChange={e => set('gender', e.target.value)}>
              <option value="">{fromProspectus ? 'As on prospectus' : '—'}</option>
              <option value="M">Male</option><option value="F">Female</option><option value="O">Other</option>
            </select></div>
          {input('dob', 'Date of Birth', { type: 'date' })}
          {input('father_name', "Father's Name")}
          {input('mother_name', "Mother's Name")}
          {input('phone', 'Phone')}
          {input('email', 'Email', { type: 'email' })}
          {input('last_school', 'Last School')}
          <div className="md:col-span-2">{input('address', 'Address')}</div>
          <div className="md:col-span-4"><button className="btn btn-primary">Save Registration</button></div>
        </form>
      )}

      <div className="card p-4 overflow-x-auto">
        <div className="flex flex-wrap gap-2 mb-3 text-sm">
          {['', 'registered', 'selected', 'waitlisted', 'rejected', 'admitted'].map(s => (
            <button key={s} className={`btn text-xs py-1 ${filter === s ? 'btn-primary' : 'bg-gray-200'}`} onClick={() => setFilter(s)}>
              {s ? s[0].toUpperCase() + s.slice(1) : 'All'} ({s ? rows.filter(r => r.status === s).length : rows.length})
            </button>
          ))}
        </div>
        <table className="table text-sm">
          <thead><tr><th>Reg No</th><th>Date</th><th>Applicant</th><th>Class</th><th>Father / Phone</th><th>Fee</th><th>Test</th><th>Interview</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {shown.map(r => {
              const e = edit[r.id];
              return (
                <tr key={r.id}>
                  <td className="whitespace-nowrap">{r.reg_no}{r.prospectus_no && <div className="text-[11px] text-gray-500">{r.prospectus_no}</div>}</td>
                  <td>{fmtDate(r.reg_date)}</td>
                  <td className="font-medium">{[r.first_name, r.last_name].filter(Boolean).join(' ')}</td>
                  <td>{r.class_name ? `${r.class_name} ${r.class_section}` : '—'}</td>
                  <td>{r.father_name || '—'}<div className="text-[11px] text-gray-500">{r.phone}</div></td>
                  <td>{fmtMoney(r.registration_fee)}</td>
                  <td>{e ? (
                    <div className="flex flex-col gap-1">
                      <input className="input" type="date" value={e.test_date} onChange={x => setEdit(m => ({ ...m, [r.id]: { ...e, test_date: x.target.value } }))} />
                      <input className="input w-24" type="number" placeholder="Marks" value={e.test_marks} onChange={x => setEdit(m => ({ ...m, [r.id]: { ...e, test_marks: x.target.value } }))} />
                    </div>
                  ) : <>{fmtDate(r.test_date)}{r.test_marks != null && <div className="text-[11px]">Marks: {r.test_marks}</div>}</>}</td>
                  <td>{e ? (
                    <div className="flex flex-col gap-1">
                      <select className="input" value={e.interview_status} onChange={x => setEdit(m => ({ ...m, [r.id]: { ...e, interview_status: x.target.value } }))}>
                        {['pending', 'selected', 'waitlisted', 'rejected'].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <input className="input" placeholder="Remarks" value={e.remarks} onChange={x => setEdit(m => ({ ...m, [r.id]: { ...e, remarks: x.target.value } }))} />
                    </div>
                  ) : r.interview_status}</td>
                  <td><span className={`badge ${STATUS_BADGE[r.status] || 'badge-gray'}`}>{r.status}</span>{r.admission_no && <div className="text-[11px]">{r.admission_no}</div>}</td>
                  <td className="text-xs whitespace-nowrap">
                    {e ? (
                      <>
                        <button className="btn btn-primary text-xs py-1 mr-1" onClick={() => saveResult(r)}>Save</button>
                        <button className="text-gray-500 hover:underline" onClick={() => setEdit(m => { const n = { ...m }; delete n[r.id]; return n; })}>Cancel</button>
                      </>
                    ) : r.status !== 'admitted' && (
                      <div className="flex flex-col gap-1">
                        <button className="text-brand-600 hover:underline text-left" onClick={() => setEdit(m => ({ ...m, [r.id]: {
                          test_date: r.test_date || '', test_marks: r.test_marks == null ? '' : String(r.test_marks), interview_status: r.interview_status, remarks: r.remarks || '',
                        } }))}>Test / Interview</button>
                        {r.status !== 'rejected' && <Link className="text-green-700 hover:underline" href={`/students/admission?registration=${r.id}`}>Admit</Link>}
                        <button className="text-red-600 hover:underline text-left" onClick={() => remove(r)}>Delete</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {!shown.length && <tr><td colSpan={10} className="text-center text-gray-500 py-4">No registrations.</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
