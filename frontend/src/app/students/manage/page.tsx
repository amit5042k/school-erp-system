'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Shell from '@/components/Shell';
import { api, downloadCsv, fileUrl, getUser, localDate } from '@/lib/api';
import { GENDER_LABEL, Notice, PageHead, STATUS_LABEL, StatusBadge, StudentRow, classLabel, useClasses, useFlash } from '../_lib/shared';

type StatusEdit = { status: string; reason: string; date: string };

export default function ManageStudentPage({ searchParams }: { searchParams: { highlight?: string } }) {
  const isAdmin = getUser<any>()?.role === 'admin';
  const classes = useClasses();
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [q, setQ] = useState('');
  const [classId, setClassId] = useState('');
  const [status, setStatus] = useState('active');
  const [gender, setGender] = useState('');
  const [editing, setEditing] = useState<Record<number, StatusEdit>>({});
  const { msg, flash } = useFlash();
  const highlight = Number(searchParams.highlight) || null;

  const load = () => api<StudentRow[]>('/students').then(setRows).catch(e => flash(e.message, false));
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const shown = useMemo(() => rows.filter(r => {
    const t = q.trim().toLowerCase();
    if (t && !`${r.admission_no} ${r.full_name} ${r.father_name || ''} ${r.contact || ''}`.toLowerCase().includes(t)) return false;
    if (classId && String(r.class_id) !== classId) return false;
    if (status && (r.status || 'active') !== status) return false;
    if (gender && r.gender !== gender) return false;
    return true;
  }).sort((a, b) => classLabel(a).localeCompare(classLabel(b)) || (a.roll_no || 999) - (b.roll_no || 999) || a.full_name.localeCompare(b.full_name)),
  [rows, q, classId, status, gender]);

  async function saveStatus(s: StudentRow) {
    const e = editing[s.id];
    try {
      const r = await api<{ logins_disabled: number; logins_enabled: number }>(`/stu/students/${s.id}/status`, { method: 'POST', body: JSON.stringify(e) });
      const logins = r.logins_disabled ? ` ${r.logins_disabled} login(s) disabled.` : r.logins_enabled ? ` ${r.logins_enabled} login(s) re-enabled.` : '';
      flash(`${s.full_name} is now ${STATUS_LABEL[e.status].toLowerCase()}.${logins}`);
      setEditing(x => { const n = { ...x }; delete n[s.id]; return n; });
      load();
    } catch (err: any) { flash(err.message, false); }
  }

  function exportCsv() {
    downloadCsv(`students-${localDate()}`, [
      { key: 'admission_no', label: 'Admission No' }, { key: 'full_name', label: 'Name' }, { key: 'cls', label: 'Class' },
      { key: 'roll_no', label: 'Roll No' }, { key: 'gender', label: 'Gender' }, { key: 'dob', label: 'DOB' },
      { key: 'father_name', label: 'Father' }, { key: 'mother_name', label: 'Mother' }, { key: 'contact', label: 'Contact' },
      { key: 'email', label: 'Email' }, { key: 'category', label: 'Category' }, { key: 'status', label: 'Status' }, { key: 'address', label: 'Address' },
    ], shown.map(s => ({ ...s, cls: classLabel(s), status: STATUS_LABEL[s.status || 'active'] })));
  }

  return (
    <Shell>
      <PageHead crumb="Student › Manage Student" title="Manage Student" subtitle={`${shown.length} of ${rows.length} student(s)`}>
        {isAdmin && <Link href="/students/admission" className="btn btn-primary text-sm">+ Admission</Link>}
        <Link href="/students/search" className="btn bg-gray-200 text-sm">Advance Search</Link>
        <button className="btn btn-accent text-sm" onClick={exportCsv}>Download Excel</button>
      </PageHead>
      <Notice msg={msg} />

      <div className="card p-4 mb-4 grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
        <div className="col-span-2"><label className="label">Search</label>
          <input className="input" placeholder="Name, admission no, father or phone" value={q} onChange={e => setQ(e.target.value)} /></div>
        <div><label className="label">Class</label>
          <select className="input" value={classId} onChange={e => setClassId(e.target.value)}>
            <option value="">All Classes</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name} {c.section}</option>)}
          </select></div>
        <div><label className="label">Status</label>
          <select className="input" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">All</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></div>
        <div><label className="label">Gender</label>
          <select className="input" value={gender} onChange={e => setGender(e.target.value)}>
            <option value="">All</option><option value="M">Male</option><option value="F">Female</option><option value="O">Other</option>
          </select></div>
      </div>

      <div className="card p-4 overflow-x-auto">
        <table className="table">
          <thead><tr>
            <th></th><th>Adm No</th><th>Name</th><th>Class</th><th>Roll</th><th>Gender</th><th>Father</th><th>Contact</th><th>Status</th><th>Actions</th>
          </tr></thead>
          <tbody>
            {shown.map(s => {
              const e = editing[s.id];
              return (
                <tr key={s.id} className={s.id === highlight ? 'bg-amber-50' : ''}>
                  <td>
                    <div className="w-8 h-8 rounded-full bg-brand-50 overflow-hidden grid place-items-center text-[10px] text-brand-700 font-bold">
                      {s.photo_url
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={fileUrl(s.photo_url)} alt="" className="w-full h-full object-cover" />
                        : s.full_name.split(' ').map(w => w[0]).slice(0, 2).join('')}
                    </div>
                  </td>
                  <td className="whitespace-nowrap">{s.admission_no}</td>
                  <td className="font-medium">{s.full_name}</td>
                  <td className="whitespace-nowrap">{classLabel(s)}</td>
                  <td>{s.roll_no || '—'}</td>
                  <td>{GENDER_LABEL[s.gender || ''] || '—'}</td>
                  <td>{s.father_name || '—'}</td>
                  <td>{s.contact || '—'}</td>
                  <td>
                    <StatusBadge status={s.status} />
                    {s.status_reason && <div className="text-[11px] text-gray-500 max-w-[10rem] truncate" title={s.status_reason}>{s.status_reason}</div>}
                  </td>
                  <td className="text-xs whitespace-nowrap">
                    {e ? (
                      <div className="flex flex-col gap-1 min-w-[14rem]">
                        <select className="input" value={e.status} onChange={x => setEditing(m => ({ ...m, [s.id]: { ...e, status: x.target.value } }))}>
                          {['active', 'inactive', 'left', 'passed_out'].filter(k => k !== (s.status || 'active')).map(k => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}
                        </select>
                        {e.status !== 'active' && (
                          <input className="input" placeholder="Reason *" value={e.reason} onChange={x => setEditing(m => ({ ...m, [s.id]: { ...e, reason: x.target.value } }))} />
                        )}
                        <input className="input" type="date" value={e.date} onChange={x => setEditing(m => ({ ...m, [s.id]: { ...e, date: x.target.value } }))} />
                        <div className="text-[11px] text-gray-500">
                          {e.status === 'active' ? 'Logins switched off earlier will be switched back on.' : 'Student and parent logins will be switched off.'}
                        </div>
                        <div className="flex gap-2">
                          <button className="btn btn-primary text-xs py-1" onClick={() => saveStatus(s)}>Save</button>
                          <button className="text-gray-500 hover:underline" onClick={() => setEditing(m => { const n = { ...m }; delete n[s.id]; return n; })}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-x-2 gap-y-1">
                        {isAdmin && <Link className="text-brand-600 hover:underline" href={`/students/admission?edit=${s.id}`}>Edit</Link>}
                        {isAdmin && s.status !== 'tc_issued' && (
                          <button className="text-amber-700 hover:underline" onClick={() => setEditing(m => ({
                            ...m, [s.id]: { status: (s.status || 'active') === 'active' ? 'inactive' : 'active', reason: '', date: localDate() },
                          }))}>Status</button>
                        )}
                        <Link className="text-brand-600 hover:underline" href={`/students/documents?student=${s.id}`}>Documents</Link>
                        {isAdmin && (s.status || 'active') === 'active' && <Link className="text-red-600 hover:underline" href={`/students/tc?student=${s.id}`}>Issue TC</Link>}
                        {isAdmin && s.status === 'tc_issued' && <Link className="text-red-600 hover:underline" href={`/students/tc?student=${s.id}`}>View TC</Link>}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {!shown.length && <tr><td colSpan={10} className="text-center text-gray-500 py-4">No students match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
