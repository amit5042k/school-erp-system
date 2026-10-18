'use client';

import { useEffect, useMemo, useState } from 'react';
import Shell from '@/components/Shell';
import { api, fileUrl, fmtDate } from '@/lib/api';
import { ClassSelect, PageTitle, useClasses, useStudents, type Student } from '../_components/common';

type Staff = {
  id: number; employee_no: string; full_name: string; designation?: string | null; department?: string | null; subject?: string | null;
  phone?: string | null; dob?: string | null; blood_group?: string | null; address?: string | null; photo_url?: string | null; status?: string | null;
};
type School = { school_name: string; address?: string | null; phone?: string | null; website?: string | null; academic_year?: string | null; logo_url?: string | null };
type Card = {
  id: number; name: string; photo?: string | null; idLabel: string; idNo: string; line1: [string, string]; rows: [string, string][];
};

const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

function studentCard(s: Student): Card {
  return {
    id: s.id, name: s.full_name, photo: s.photo_url, idLabel: 'Adm No', idNo: s.admission_no,
    line1: ['Class', `${s.class_name || '—'} ${s.class_section || ''}`.trim()],
    rows: [
      ['Roll No', s.roll_no != null ? String(s.roll_no) : '—'], ['Father', s.father_name || '—'],
      ['DOB', s.dob ? fmtDate(s.dob) : '—'], ['Blood Group', s.blood_group || '—'],
      ['Contact', s.contact || '—'], ['Address', s.address || '—'],
    ],
  };
}
function staffCard(t: Staff): Card {
  return {
    id: t.id, name: t.full_name, photo: t.photo_url, idLabel: 'Emp No', idNo: t.employee_no,
    line1: ['Designation', t.designation || t.subject || '—'],
    rows: [
      ['Department', t.department || '—'], ['DOB', t.dob ? fmtDate(t.dob) : '—'], ['Blood Group', t.blood_group || '—'],
      ['Contact', t.phone || '—'], ['Address', t.address || '—'],
    ],
  };
}

function IdCard({ c, school, kind }: { c: Card; school: School | null; kind: 'student' | 'staff' }) {
  return (
    <div className="id-card print-avoid-break">
      <div className="id-card-head">
        {school?.logo_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={fileUrl(school.logo_url)} alt="" className="id-card-logo" />
          : <div className="id-card-logo id-card-logo-fallback">{initials(school?.school_name || 'SE')}</div>}
        <div className="min-w-0">
          <div className="id-card-school">{school?.school_name || 'School'}</div>
          <div className="id-card-addr">{[school?.address, school?.phone].filter(Boolean).join(' · ')}</div>
        </div>
      </div>
      <div className="id-card-band">{kind === 'student' ? 'STUDENT IDENTITY CARD' : 'STAFF IDENTITY CARD'} · {school?.academic_year || ''}</div>
      <div className="id-card-body">
        <div className="id-card-photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {c.photo ? <img src={fileUrl(c.photo)} alt="" /> : <span>{initials(c.name)}</span>}
        </div>
        <div className="id-card-info">
          <div className="id-card-name">{c.name}</div>
          <div><b>{c.idLabel}:</b> {c.idNo}</div>
          <div><b>{c.line1[0]}:</b> {c.line1[1]}</div>
          {c.rows.map(([k, v]) => <div key={k} className="id-card-row"><b>{k}:</b> {v}</div>)}
        </div>
      </div>
      <div className="id-card-foot"><span>{school?.website || ''}</span><span className="id-card-sign">Principal</span></div>
    </div>
  );
}

export default function IdCardsPage({ searchParams }: { searchParams: { type?: string } }) {
  const [kind, setKind] = useState<'student' | 'staff'>(searchParams.type === 'staff' ? 'staff' : 'student');
  const { classes } = useClasses();
  const { students } = useStudents();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [school, setSchool] = useState<School | null>(null);
  const [classId, setClassId] = useState('');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [chooseMode, setChooseMode] = useState(false);

  useEffect(() => {
    api<School>('/settings').then(setSchool).catch(() => {});
    api<Staff[]>('/teachers').then(setStaff).catch(() => {});
  }, []);
  useEffect(() => { setPicked(new Set()); setChooseMode(false); }, [kind, classId]);

  const cards = useMemo(() => {
    const term = q.trim().toLowerCase();
    const match = (...v: (string | null | undefined)[]) => !term || v.some(x => (x || '').toLowerCase().includes(term));
    return kind === 'student'
      ? students.filter(s => (s.status || 'active') === 'active' && (!classId || String(s.class_id) === classId) && match(s.full_name, s.admission_no)).map(studentCard)
      : staff.filter(t => (t.status || 'active') === 'active' && match(t.full_name, t.employee_no, t.designation)).map(staffCard);
  }, [kind, students, staff, classId, q]);

  const printing = chooseMode ? cards.filter(c => picked.has(c.id)) : cards;

  return (
    <Shell>
      <style>{`
        .id-grid { display: grid; grid-template-columns: repeat(auto-fill, 85.6mm); gap: 6mm; justify-content: center; }
        .id-card { width: 85.6mm; height: 54mm; border: 0.3mm solid #1e3a8a; border-radius: 3mm; overflow: hidden; background: #fff;
          font-size: 2.35mm; line-height: 1.25; color: #111; display: flex; flex-direction: column; font-family: inherit; }
        .id-card-head { display: flex; gap: 2mm; align-items: center; padding: 1.5mm 2.5mm; background: #1e3a8a; color: #fff; }
        .id-card-logo { width: 8mm; height: 8mm; border-radius: 50%; object-fit: cover; background: #fff; flex: none; }
        .id-card-logo-fallback { display: grid; place-items: center; color: #1e3a8a; font-weight: 700; font-size: 2.6mm; }
        .id-card-school { font-weight: 700; font-size: 3.1mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .id-card-addr { font-size: 1.9mm; opacity: .9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .id-card-band { background: #f59e0b; color: #111; text-align: center; font-weight: 700; font-size: 1.9mm; letter-spacing: .3mm; padding: .5mm 0; }
        .id-card-body { flex: 1; display: flex; gap: 2.5mm; padding: 1.8mm 2.5mm 0; min-height: 0; }
        .id-card-photo { width: 19mm; height: 23mm; border: .3mm solid #cbd5e1; border-radius: 1mm; overflow: hidden; flex: none;
          display: grid; place-items: center; background: #eef2ff; color: #1e3a8a; font-weight: 700; font-size: 5mm; }
        .id-card-photo img { width: 100%; height: 100%; object-fit: cover; }
        .id-card-info { min-width: 0; flex: 1; }
        .id-card-name { font-weight: 700; font-size: 3mm; color: #1e3a8a; margin-bottom: .6mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .id-card-info > div { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .id-card-foot { display: flex; justify-content: space-between; align-items: flex-end; padding: 0 2.5mm 1.5mm; font-size: 1.9mm; color: #475569; }
        .id-card-sign { border-top: .25mm solid #475569; padding-top: .4mm; min-width: 18mm; text-align: center; }
        @media print {
          @page { size: A4; margin: 10mm; }
          .id-grid { grid-template-columns: repeat(2, 85.6mm); gap: 4mm 6mm; }
          .id-card { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <PageTitle crumb="Student › ID Cards" title="Generate ID Card" subtitle="Printable CR80 cards, 10 per A4 sheet" />

      <div className="card p-4 mb-4 grid md:grid-cols-5 gap-3 text-sm no-print">
        <div><label className="label">Card Type</label>
          <select className="input" value={kind} onChange={e => setKind(e.target.value as 'student' | 'staff')}>
            <option value="student">Students</option><option value="staff">Staff</option>
          </select></div>
        {kind === 'student' && <div><label className="label">Class</label><ClassSelect classes={classes} value={classId} onChange={setClassId} placeholder="All Classes" /></div>}
        <div><label className="label">Search</label><input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder="Name or number" /></div>
        <div className="flex items-end">
          <label className="flex items-center gap-2"><input type="checkbox" checked={chooseMode} onChange={e => setChooseMode(e.target.checked)} /> Choose individuals</label>
        </div>
        <div className="flex items-end"><button className="btn btn-primary" disabled={!printing.length} onClick={() => window.print()}>Print {printing.length} card(s)</button></div>
        <div className="md:col-span-5 text-xs text-gray-500">
          Photos come from each {kind === 'student' ? 'student' : 'staff'} profile; without one, initials are shown. The school logo is set in Settings › School Settings.
          In the print dialog, turn on &quot;Background graphics&quot; for the coloured header.
        </div>
      </div>

      {chooseMode && (
        <div className="card p-3 mb-4 text-sm no-print max-h-60 overflow-y-auto">
          <div className="flex gap-3 mb-2">
            <button className="text-brand-600 hover:underline" onClick={() => setPicked(new Set(cards.map(c => c.id)))}>Select all</button>
            <button className="text-gray-600 hover:underline" onClick={() => setPicked(new Set())}>Clear</button>
          </div>
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-1">
            {cards.map(c => (
              <label key={c.id} className="flex items-center gap-2">
                <input type="checkbox" checked={picked.has(c.id)} onChange={() => setPicked(s => { const n = new Set(s); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })} />
                {c.name} <span className="text-gray-400">({c.idNo})</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="id-grid">
        {printing.map(c => <IdCard key={c.id} c={c} school={school} kind={kind} />)}
      </div>
      {!printing.length && <div className="text-center text-gray-500 text-sm py-8 no-print">No cards to show.</div>}
    </Shell>
  );
}
