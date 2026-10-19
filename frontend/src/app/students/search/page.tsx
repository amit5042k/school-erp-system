'use client';

import Link from 'next/link';
import { useState } from 'react';
import Shell from '@/components/Shell';
import { api, downloadCsv, fmtDate, getUser, localDate } from '@/lib/api';
import { GENDER_LABEL, Notice, PageHead, STATUS_LABEL, StatusBadge, StudentRow, classLabel, useClasses, useFlash, useMaster } from '../_lib/shared';

const EMPTY = {
  q: '', name: '', admission_no: '', father_name: '', mother_name: '', contact: '', address: '', aadhaar_no: '',
  class_id: '', gender: '', status: '', category: '', religion: '', house: '', blood_group: '', session: '',
  adm_from: '', adm_to: '', dob_from: '', dob_to: '', custom_field: '', custom_value: '',
};

export default function AdvanceSearchPage() {
  const isAdmin = getUser<any>()?.role === 'admin';
  const classes = useClasses();
  const houses = useMaster('student-houses');
  const categories = useMaster('student-categories');
  const customFields = useMaster('student-custom-fields');
  const [f, setF] = useState<Record<string, string>>(EMPTY);
  const [rows, setRows] = useState<StudentRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const { msg, flash } = useFlash();
  const set = (k: string, v: string) => setF(x => ({ ...x, [k]: v }));

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    try {
      const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v !== '')).toString();
      setRows(await api<StudentRow[]>(`/stu/search${qs ? `?${qs}` : ''}`));
    } catch (err: any) { flash(err.message, false); }
    finally { setBusy(false); }
  }

  const text = (k: string, label: string, type = 'text') => (
    <div><label className="label">{label}</label><input className="input" type={type} value={f[k]} onChange={e => set(k, e.target.value)} /></div>
  );
  const select = (k: string, label: string, options: { value: string; label: string }[]) => (
    <div><label className="label">{label}</label>
      <select className="input" value={f[k]} onChange={e => set(k, e.target.value)}>
        <option value="">Any</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select></div>
  );
  const names = (list: { name: string }[]) => list.map(x => ({ value: x.name, label: x.name }));

  return (
    <Shell>
      <PageHead crumb="Student › Advance Search" title="Advance Search" subtitle="Combine any fields to find students" />
      <Notice msg={msg} />
      <form onSubmit={search} className="card p-4 mb-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div className="col-span-2">{text('q', 'Any of name / adm no / parents / phone')}</div>
        {text('name', 'Student Name')}
        {text('admission_no', 'Admission No')}
        {text('father_name', "Father's Name")}
        {text('mother_name', "Mother's Name")}
        {text('contact', 'Contact No')}
        {text('aadhaar_no', 'Aadhaar No')}
        {select('class_id', 'Class', classes.map(c => ({ value: String(c.id), label: `${c.name} ${c.section}` })))}
        {select('gender', 'Gender', Object.entries(GENDER_LABEL).map(([value, label]) => ({ value, label })))}
        {select('status', 'Status', Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })))}
        {select('category', 'Category', names(categories))}
        {select('religion', 'Religion', ['Hindu', 'Sikh', 'Muslim', 'Christian', 'Jain', 'Buddhist', 'Other'].map(r => ({ value: r, label: r })))}
        {select('house', 'House', names(houses))}
        {select('blood_group', 'Blood Group', ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(b => ({ value: b, label: b })))}
        {text('session', 'Session')}
        {text('adm_from', 'Admitted From', 'date')}
        {text('adm_to', 'Admitted To', 'date')}
        {text('dob_from', 'Born From', 'date')}
        {text('dob_to', 'Born To', 'date')}
        <div className="col-span-2">{text('address', 'Address contains')}</div>
        {select('custom_field', 'Custom Field', customFields.map(c => ({ value: String(c.id), label: c.name })))}
        {text('custom_value', 'Custom Field Value')}
        <div className="col-span-2 md:col-span-4 flex gap-2">
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Searching…' : 'Search'}</button>
          <button type="button" className="btn bg-gray-200" onClick={() => { setF(EMPTY); setRows(null); }}>Clear</button>
        </div>
      </form>

      {rows && (
        <div className="card p-4 overflow-x-auto">
          <div className="flex justify-between items-center mb-2">
            <div className="text-xs text-gray-500">{rows.length} student(s) found</div>
            {rows.length > 0 && (
              <button className="btn btn-accent text-xs" onClick={() => downloadCsv(`student-search-${localDate()}`, [
                { key: 'admission_no', label: 'Admission No' }, { key: 'full_name', label: 'Name' }, { key: 'cls', label: 'Class' },
                { key: 'gender', label: 'Gender' }, { key: 'dob', label: 'DOB' }, { key: 'father_name', label: 'Father' },
                { key: 'contact', label: 'Contact' }, { key: 'category', label: 'Category' }, { key: 'status', label: 'Status' },
              ], rows.map(r => ({ ...r, cls: classLabel(r) })))}>Download Excel</button>
            )}
          </div>
          <table className="table">
            <thead><tr><th>Adm No</th><th>Name</th><th>Class</th><th>Gender</th><th>DOB</th><th>Father</th><th>Contact</th><th>Category</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map(s => (
                <tr key={s.id}>
                  <td>{s.admission_no}</td><td className="font-medium">{s.full_name}</td><td>{classLabel(s)}</td>
                  <td>{GENDER_LABEL[s.gender || ''] || '—'}</td><td>{fmtDate(s.dob)}</td><td>{s.father_name || '—'}</td>
                  <td>{s.contact || '—'}</td><td>{s.category || '—'}</td><td><StatusBadge status={s.status} /></td>
                  <td className="text-xs">{isAdmin && <Link className="text-brand-600 hover:underline" href={`/students/admission?edit=${s.id}`}>Edit</Link>}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={10} className="text-center text-gray-500 py-4">No students match.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
