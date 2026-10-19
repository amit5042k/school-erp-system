'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';
import { ClassSelect, ExamSelect, Flash, PageHead, useExamLookups, useFlash } from '../_shared';

type Row = { id: number; admission_no: string; full_name: string; roll_no: number | null; remark: string };

export default function RemarksPage() {
  const { exams, classes } = useExamLookups();
  const { msg, flash } = useFlash();
  const [examId, setExamId] = useState('');
  const [classId, setClassId] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [bank, setBank] = useState<{ name: string; category?: string }[]>([]);
  const [bulk, setBulk] = useState('');

  useEffect(() => { api<any[]>('/masters/report-card-remarks').then(setBank).catch(() => {}); }, []);

  async function load() {
    if (!examId || !classId) return setRows([]);
    try { setRows(await api<Row[]>(`/exam/remarks?exam_id=${examId}&class_id=${classId}`)); }
    catch (e: any) { flash(e.message, false); }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [examId, classId]);

  const set = (i: number, remark: string) => setRows(r => r.map((x, j) => (j === i ? { ...x, remark } : x)));

  async function save() {
    try {
      await api('/exam/remarks', { method: 'PUT', body: JSON.stringify({ exam_id: Number(examId), rows: rows.map(r => ({ student_id: r.id, remark: r.remark })) }) });
      flash('Remarks saved.');
    } catch (e: any) { flash(e.message, false); }
  }

  return (
    <Shell>
      <PageHead title="Update Student Remarks" subtitle="Teacher's remark printed on the report card for the selected exam." />
      <Flash msg={msg} />
      <div className="card p-4 mb-4 grid md:grid-cols-2 gap-3 text-sm max-w-2xl">
        <div><label className="label">Exam</label><ExamSelect exams={exams} value={examId} onChange={setExamId} /></div>
        <div><label className="label">Class</label><ClassSelect classes={classes} value={classId} onChange={setClassId} /></div>
      </div>
      {examId && classId && (
        <div className="card p-4 overflow-x-auto text-sm">
          <datalist id="remark-bank">{bank.map(b => <option key={b.name} value={b.name} />)}</datalist>
          <div className="flex flex-wrap items-end gap-2 mb-3">
            <div className="flex-1 min-w-[16rem]"><label className="label">Fill blank remarks with</label>
              <input className="input" list="remark-bank" value={bulk} onChange={e => setBulk(e.target.value)} placeholder="Pick from the remarks bank or type" /></div>
            <button className="btn bg-gray-200" disabled={!bulk} onClick={() => setRows(r => r.map(x => ({ ...x, remark: x.remark || bulk })))}>Apply to blanks</button>
            <a className="text-xs text-brand-600 underline mb-2" href="/masters/report-card-remarks">Edit remarks bank</a>
          </div>
          <table className="table min-w-max w-full">
            <thead><tr><th>Roll</th><th>Adm No</th><th>Student</th><th className="w-1/2">Remark</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id}>
                  <td>{r.roll_no ?? '—'}</td><td>{r.admission_no}</td><td>{r.full_name}</td>
                  <td><input className="input w-full" list="remark-bank" maxLength={500} value={r.remark} onChange={e => set(i, e.target.value)} /></td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={4} className="text-center py-4 text-gray-500">No active students in this class.</td></tr>}
            </tbody>
          </table>
          {rows.length > 0 && <button className="btn btn-primary mt-4" onClick={save}>Save Remarks</button>}
        </div>
      )}
    </Shell>
  );
}
