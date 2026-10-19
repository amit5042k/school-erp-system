'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, localDate } from '@/lib/api';
import { ClassSelect, ExamSelect, Flash, PageHead, useExamLookups, useFlash } from '../_shared';

type Row = { id: number; admission_no: string; full_name: string; roll_no: number | null; working_days: string; days_present: string; result: string; rank: string };
const RESULTS = ['Pass', 'Promoted', 'Detained', 'Compartment', 'Absent', 'Withheld'];
const s = (v: any) => (v == null ? '' : String(v));

export default function TermDetailsPage() {
  const { exams, classes } = useExamLookups();
  const { msg, flash } = useFlash();
  const [examId, setExamId] = useState('');
  const [classId, setClassId] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(localDate());

  async function load() {
    if (!examId || !classId) return setRows([]);
    try {
      const d = await api<any[]>(`/exam/term-details?exam_id=${examId}&class_id=${classId}`);
      setRows(d.map(x => ({ id: x.id, admission_no: x.admission_no, full_name: x.full_name, roll_no: x.roll_no,
        working_days: s(x.term?.working_days), days_present: s(x.term?.days_present), result: s(x.term?.result), rank: s(x.term?.rank) })));
    } catch (e: any) { flash(e.message, false); }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [examId, classId]);

  const set = (i: number, patch: Partial<Row>) => setRows(r => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function fillAttendance() {
    if (!from || !to) return flash('Choose the attendance date range first.', false);
    try {
      const d = await api<{ working_days: number; present: Record<number, number> }>(`/exam/attendance-summary?class_id=${classId}&from=${from}&to=${to}`);
      setRows(r => r.map(x => ({ ...x, working_days: String(d.working_days), days_present: String(d.present[x.id] || 0) })));
      flash(`Filled from attendance: ${d.working_days} working day(s). Review and Save.`);
    } catch (e: any) { flash(e.message, false); }
  }
  async function autoRank() {
    try {
      const r = await api<{ ranked: number }>('/exam/auto-rank', { method: 'POST', body: JSON.stringify({ exam_id: Number(examId), class_id: Number(classId) }) });
      flash(`Ranked ${r.ranked} student(s) by percentage.`);
      load();
    } catch (e: any) { flash(e.message, false); }
  }
  async function save() {
    try {
      await api('/exam/term-details', { method: 'PUT', body: JSON.stringify({ exam_id: Number(examId), rows: rows.map(r => ({ student_id: r.id, working_days: r.working_days, days_present: r.days_present, result: r.result, rank: r.rank })) }) });
      flash('Saved.');
    } catch (e: any) { flash(e.message, false); }
  }

  return (
    <Shell>
      <PageHead title="Update Attendance & Result Details" subtitle="Attendance, result and rank printed on each report card for an exam." />
      <Flash msg={msg} />
      <div className="card p-4 mb-4 grid md:grid-cols-4 gap-3 text-sm">
        <div><label className="label">Exam</label><ExamSelect exams={exams} value={examId} onChange={v => {
          setExamId(v);
          const e = exams.find(x => String(x.id) === v);
          if (e?.end_date) setTo(e.end_date);
        }} /></div>
        <div><label className="label">Class</label><ClassSelect classes={classes} value={classId} onChange={setClassId} /></div>
        <div><label className="label">Attendance From</label><input className="input" type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div><label className="label">Attendance To</label><input className="input" type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
      </div>
      {examId && classId && (
        <div className="card p-4 overflow-x-auto text-sm">
          <div className="flex flex-wrap gap-2 mb-3">
            <button className="btn bg-gray-200" onClick={fillAttendance}>Fill attendance from register</button>
            <button className="btn bg-gray-200" onClick={autoRank}>Calculate ranks</button>
            <button className="btn bg-gray-200" onClick={() => setRows(r => r.map(x => ({ ...x, result: x.result || 'Pass' })))}>Mark blank results as Pass</button>
          </div>
          <table className="table min-w-max">
            <thead><tr><th>Roll</th><th>Adm No</th><th>Student</th><th>Working Days</th><th>Days Present</th><th>Result</th><th>Rank</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id}>
                  <td>{r.roll_no ?? '—'}</td><td>{r.admission_no}</td><td>{r.full_name}</td>
                  <td><input className="input w-24" type="number" min={0} value={r.working_days} onChange={e => set(i, { working_days: e.target.value })} /></td>
                  <td><input className="input w-24" type="number" min={0} value={r.days_present} onChange={e => set(i, { days_present: e.target.value })} /></td>
                  <td>
                    <select className="input" value={r.result} onChange={e => set(i, { result: e.target.value })}>
                      <option value="">— Auto —</option>
                      {RESULTS.map(x => <option key={x}>{x}</option>)}
                    </select>
                  </td>
                  <td><input className="input w-20" type="number" min={1} value={r.rank} onChange={e => set(i, { rank: e.target.value })} /></td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={7} className="text-center py-4 text-gray-500">No active students in this class.</td></tr>}
            </tbody>
          </table>
          {rows.length > 0 && <button className="btn btn-primary mt-4" onClick={save}>Save</button>}
          <p className="text-xs text-gray-500 mt-2">&quot;Auto&quot; prints Pass, or the subjects below the passing mark, on the report card.</p>
        </div>
      )}
    </Shell>
  );
}
