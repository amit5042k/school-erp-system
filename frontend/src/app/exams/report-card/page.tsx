'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, fileUrl, fmtDate, getUser } from '@/lib/api';
import { ClassSelect, Exam, Flash, PageHead, useExamLookups, useFlash } from '../_shared';

type Mark = { marks: number; max: number; grade: string | null };
type SubjectRow = { subject: string; exams: Record<number, Mark>; total: number; max_total: number; pct: number | null; grade: string | null };
type Card = {
  student: any; subjects: SubjectRow[]; total: number; max_total: number; pct: number | null; grade: string | null; grade_remark: string | null;
  result: string; rank: number | null; attendance: { working_days: number | null; days_present: number | null } | null;
  remark: string; health: any;
};
type Data = {
  settings: Record<string, string>; school: { name: string; address?: string; phone?: string; email?: string; logo_url?: string; session?: string };
  class: any; exams: Exam[]; bands: { min_pct: number; max_pct: number; grade: string; remark?: string }[]; cards: Card[];
};

const fmt = (n: number | null | undefined) => (n == null ? '—' : Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ''));

function ReportCard({ d, c, last }: { d: Data; c: Card; last: boolean }) {
  const s = d.settings;
  const sigs = [s.signature_1, s.signature_2, s.signature_3].filter(Boolean);
  const showMarks = (m?: Mark) => (!m ? '—' : m.grade === 'AB' ? 'AB' : `${fmt(m.marks)}`);
  return (
    <div className={`card p-6 mb-6 bg-white text-[13px] text-gray-900 ${last ? '' : 'print-break'}`} style={{ maxWidth: '210mm', margin: '0 auto 1.5rem' }}>
      <div className="flex items-center gap-4 border-b-2 border-brand-700 pb-3">
        {d.school.logo_url && /* eslint-disable-next-line @next/next/no-img-element */
          <img src={fileUrl(d.school.logo_url)} alt="" className="w-16 h-16 object-contain" />}
        <div className="flex-1 text-center">
          <div className="text-xl font-bold text-brand-700 uppercase tracking-wide">{d.school.name || 'School'}</div>
          {d.school.address && <div className="text-xs text-gray-600">{d.school.address}</div>}
          {(d.school.phone || d.school.email) && <div className="text-xs text-gray-600">{[d.school.phone, d.school.email].filter(Boolean).join(' · ')}</div>}
          <div className="mt-1 font-semibold">{s.sub_header || 'Progress Report'}{d.school.session ? ` — Session ${d.school.session}` : ''}</div>
        </div>
        {d.school.logo_url && <div className="w-16" />}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1 my-3">
        <div><span className="text-gray-500">Name:</span> <b>{c.student.full_name}</b></div>
        <div><span className="text-gray-500">Admission No:</span> {c.student.admission_no}</div>
        <div><span className="text-gray-500">Class:</span> {c.student.class_name} {c.student.class_section}</div>
        <div><span className="text-gray-500">Roll No:</span> {c.student.roll_no ?? '—'}</div>
        <div><span className="text-gray-500">Father:</span> {c.student.father_name || '—'}</div>
        <div><span className="text-gray-500">Mother:</span> {c.student.mother_name || '—'}</div>
        <div><span className="text-gray-500">Date of Birth:</span> {c.student.dob ? fmtDate(c.student.dob) : '—'}</div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border border-gray-400 text-center">
          <thead className="bg-brand-50">
            <tr>
              <th className="border border-gray-400 px-2 py-1 text-left" rowSpan={2}>Subject</th>
              {d.exams.map(e => <th key={e.id} className="border border-gray-400 px-2 py-1">{e.name}</th>)}
              <th className="border border-gray-400 px-2 py-1" colSpan={3}>Overall</th>
            </tr>
            <tr>
              {d.exams.map(e => <th key={e.id} className="border border-gray-400 px-2 py-1 font-normal text-xs">Marks / Grade</th>)}
              <th className="border border-gray-400 px-2 py-1 font-normal text-xs">Total</th>
              <th className="border border-gray-400 px-2 py-1 font-normal text-xs">%</th>
              <th className="border border-gray-400 px-2 py-1 font-normal text-xs">Grade</th>
            </tr>
          </thead>
          <tbody>
            {c.subjects.map(r => (
              <tr key={r.subject}>
                <td className="border border-gray-400 px-2 py-1 text-left">{r.subject}</td>
                {d.exams.map(e => {
                  const m = r.exams[e.id];
                  return <td key={e.id} className="border border-gray-400 px-2 py-1">{showMarks(m)}{m ? <span className="text-gray-500">/{fmt(m.max)}</span> : null}{m?.grade && m.grade !== 'AB' ? <span className="ml-1 font-semibold">{m.grade}</span> : null}</td>;
                })}
                <td className="border border-gray-400 px-2 py-1">{r.max_total ? `${fmt(r.total)}/${fmt(r.max_total)}` : '—'}</td>
                <td className="border border-gray-400 px-2 py-1">{r.pct == null ? '—' : `${fmt(r.pct)}`}</td>
                <td className="border border-gray-400 px-2 py-1 font-semibold">{r.grade || '—'}</td>
              </tr>
            ))}
            {!c.subjects.length && <tr><td colSpan={d.exams.length + 4} className="border border-gray-400 py-3 text-gray-500">No marks entered.</td></tr>}
            <tr className="bg-brand-50 font-semibold">
              <td className="border border-gray-400 px-2 py-1 text-left">Grand Total</td>
              {d.exams.map(e => {
                const got = c.subjects.reduce((a, r) => a + (r.exams[e.id]?.marks || 0), 0);
                const max = c.subjects.reduce((a, r) => a + (r.exams[e.id]?.max || 0), 0);
                return <td key={e.id} className="border border-gray-400 px-2 py-1">{max ? `${fmt(got)}/${fmt(max)}` : '—'}</td>;
              })}
              <td className="border border-gray-400 px-2 py-1">{c.max_total ? `${fmt(c.total)}/${fmt(c.max_total)}` : '—'}</td>
              <td className="border border-gray-400 px-2 py-1">{c.pct == null ? '—' : fmt(c.pct)}</td>
              <td className="border border-gray-400 px-2 py-1">{c.grade || '—'}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 mt-4 print-avoid-break">
        <table className="w-full border border-gray-400 text-left">
          <tbody>
            <tr><td className="border border-gray-400 px-2 py-1 text-gray-600 w-1/2">Percentage</td><td className="border border-gray-400 px-2 py-1 font-semibold">{c.pct == null ? '—' : `${fmt(c.pct)}%`}</td></tr>
            <tr><td className="border border-gray-400 px-2 py-1 text-gray-600">Overall Grade</td><td className="border border-gray-400 px-2 py-1 font-semibold">{c.grade || '—'}{c.grade_remark ? ` (${c.grade_remark})` : ''}</td></tr>
            {c.rank != null && <tr><td className="border border-gray-400 px-2 py-1 text-gray-600">Rank in Class</td><td className="border border-gray-400 px-2 py-1 font-semibold">{c.rank}</td></tr>}
            <tr><td className="border border-gray-400 px-2 py-1 text-gray-600">Attendance</td><td className="border border-gray-400 px-2 py-1">
              {c.attendance && c.attendance.working_days ? `${c.attendance.days_present ?? 0} / ${c.attendance.working_days} days` : '—'}
            </td></tr>
            <tr><td className="border border-gray-400 px-2 py-1 text-gray-600">Result</td><td className="border border-gray-400 px-2 py-1 font-bold">{c.result || '—'}</td></tr>
          </tbody>
        </table>
        <table className="w-full border border-gray-400 text-left">
          <tbody>
            <tr><td className="border border-gray-400 px-2 py-1 text-gray-600 w-1/2">Height</td><td className="border border-gray-400 px-2 py-1">{c.health?.height_cm ? `${fmt(c.health.height_cm)} cm` : '—'}</td></tr>
            <tr><td className="border border-gray-400 px-2 py-1 text-gray-600">Weight</td><td className="border border-gray-400 px-2 py-1">{c.health?.weight_kg ? `${fmt(c.health.weight_kg)} kg` : '—'}</td></tr>
            <tr><td className="border border-gray-400 px-2 py-1 text-gray-600">Vision (L / R)</td><td className="border border-gray-400 px-2 py-1">{c.health ? `${c.health.vision_left || '—'} / ${c.health.vision_right || '—'}` : '—'}</td></tr>
            <tr><td className="border border-gray-400 px-2 py-1 text-gray-600">Dental</td><td className="border border-gray-400 px-2 py-1">{c.health?.dental || '—'}</td></tr>
            <tr><td className="border border-gray-400 px-2 py-1 text-gray-600">Blood Group</td><td className="border border-gray-400 px-2 py-1">{c.health?.blood_group || c.student.blood_group || '—'}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="mt-4 border border-gray-400 p-2 min-h-[3rem] print-avoid-break">
        <span className="text-gray-600">Remarks: </span>{c.remark || ''}
      </div>

      {d.bands.length > 0 && (
        <div className="mt-3 text-[11px] text-gray-600 print-avoid-break">
          <b>Grading Scale:</b> {d.bands.map(b => `${b.grade} (${fmt(b.min_pct)}–${fmt(b.max_pct)}%)`).join(' · ')}
        </div>
      )}

      <div className="flex justify-between gap-6 mt-12 print-avoid-break">
        {sigs.map(sg => (
          <div key={sg} className="flex-1 text-center">
            <div className="border-t border-gray-500 pt-1 text-xs">{sg}</div>
          </div>
        ))}
      </div>
      {s.footer_note && <div className="text-[11px] text-gray-500 text-center mt-4">{s.footer_note}</div>}
    </div>
  );
}

export default function ReportCardPage() {
  const user = getUser<any>();
  const staff = user?.role === 'admin' || user?.role === 'teacher';
  const { exams, classes } = useExamLookups();
  const { msg, flash } = useFlash();
  const [classId, setClassId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [students, setStudents] = useState<any[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!staff || !classId) { setStudents([]); return; }
    api<any[]>('/students').then(s => setStudents(s.filter(x => String(x.class_id) === classId))).catch(() => {});
  }, [classId, staff]);

  const togglePick = (id: number) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));

  async function generate() {
    if (!picked.length) return flash('Choose at least one exam.', false);
    if (staff && !classId && !studentId) return flash('Choose a class.', false);
    // Keep exam columns in the order they were held.
    const ordered = exams.filter(e => picked.includes(e.id)).sort((a, b) => String(a.start_date || '').localeCompare(String(b.start_date || '')) || a.id - b.id);
    const qs = new URLSearchParams({ exam_ids: ordered.map(e => e.id).join(',') });
    if (staff && studentId) qs.set('student_id', studentId);
    else if (staff) qs.set('class_id', classId);
    setBusy(true); setData(null);
    try { setData(await api<Data>(`/exam/report-card?${qs}`)); }
    catch (e: any) { flash(e.message, false); }
    finally { setBusy(false); }
  }

  return (
    <Shell>
      <PageHead title="Report Card" subtitle="Generate printable report cards for a class or one student." />
      <Flash msg={msg} />

      <div className="card p-4 mb-4 text-sm no-print">
        <div className="grid md:grid-cols-3 gap-3">
          {staff && <div><label className="label">Class</label><ClassSelect classes={classes} value={classId} onChange={v => { setClassId(v); setStudentId(''); }} /></div>}
          {staff && (
            <div><label className="label">Student</label>
              <select className="input" value={studentId} onChange={e => setStudentId(e.target.value)} disabled={!classId}>
                <option value="">Whole class</option>
                {students.map(s => <option key={s.id} value={s.id}>{s.roll_no ? `${s.roll_no}. ` : ''}{s.full_name} ({s.admission_no})</option>)}
              </select></div>
          )}
        </div>
        <div className="mt-3">
          <div className="label">Exams to include (one column each)</div>
          <div className="flex flex-wrap gap-3">
            {exams.map(e => (
              <label key={e.id} className="inline-flex items-center gap-1">
                <input type="checkbox" checked={picked.includes(e.id)} onChange={() => togglePick(e.id)} /> {e.name}
              </label>
            ))}
            {!exams.length && <span className="text-gray-500">No exams yet.</span>}
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button className="btn btn-primary" onClick={generate} disabled={busy}>{busy ? 'Generating…' : 'Generate'}</button>
          {data && data.cards.length > 0 && <button className="btn bg-gray-200" onClick={() => window.print()}>Print {data.cards.length > 1 ? `all ${data.cards.length}` : ''}</button>}
        </div>
        {!staff && <p className="text-xs text-gray-500 mt-2">Report cards appear here once the school publishes the result.</p>}
      </div>

      {data && data.cards.map((c, i) => <ReportCard key={c.student.id} d={data} c={c} last={i === data.cards.length - 1} />)}
      {data && !data.cards.length && <div className="card p-6 text-center text-gray-500">No students found.</div>}
    </Shell>
  );
}
