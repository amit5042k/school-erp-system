'use client';

import { useState } from 'react';
import Shell from '@/components/Shell';
import { api, downloadCsv } from '@/lib/api';
import { ClassSelect, ExamSelect, Flash, PageHead, useExamLookups, useFlash } from '../_shared';

type Data = {
  exam: { id: number; name: string }; class: { name: string; section: string };
  subjects: { subject: string; max_marks: number }[];
  students: { id: number; roll_no: number | null; admission_no: string; full_name: string; marks: Record<string, { marks: number; max: number; grade: string | null }>; total: number; max_total: number; pct: number | null; grade: string | null }[];
};

const cellText = (m?: { marks: number; grade: string | null }) => (!m ? '' : m.grade === 'AB' ? 'AB' : String(m.marks));

export default function AwardListPage() {
  const { exams, classes } = useExamLookups();
  const { msg, flash } = useFlash();
  const [examId, setExamId] = useState('');
  const [classId, setClassId] = useState('');
  const [data, setData] = useState<Data | null>(null);

  async function load() {
    if (!examId || !classId) return flash('Choose an exam and a class.', false);
    try { setData(await api<Data>(`/exam/award-list?exam_id=${examId}&class_id=${classId}`)); }
    catch (e: any) { flash(e.message, false); }
  }

  function excel() {
    if (!data) return;
    const cols = [
      { key: 'roll_no', label: 'Roll No' }, { key: 'admission_no', label: 'Adm No' }, { key: 'full_name', label: 'Student' },
      ...data.subjects.map(s => ({ key: `s:${s.subject}`, label: `${s.subject} (${s.max_marks})` })),
      { key: 'total', label: 'Total' }, { key: 'pct', label: '%' }, { key: 'grade', label: 'Grade' },
    ];
    const rows = data.students.map(s => ({ ...s, ...Object.fromEntries(data.subjects.map(x => [`s:${x.subject}`, cellText(s.marks[x.subject])])) }));
    downloadCsv(`award-list-${data.exam.name}-${data.class.name}-${data.class.section}`.replace(/\s+/g, '-'), cols, rows);
  }

  return (
    <Shell>
      <PageHead title="Download Award List" subtitle="Subject-wise marks sheet of a class for an exam." />
      <Flash msg={msg} />
      <div className="card p-4 mb-4 grid md:grid-cols-3 gap-3 text-sm no-print">
        <div><label className="label">Exam</label><ExamSelect exams={exams} value={examId} onChange={setExamId} /></div>
        <div><label className="label">Class</label><ClassSelect classes={classes} value={classId} onChange={setClassId} /></div>
        <div className="flex items-end gap-2">
          <button className="btn btn-primary" onClick={load}>Show</button>
          {data && <><button className="btn btn-accent" onClick={excel}>Download Excel</button><button className="btn bg-gray-200" onClick={() => window.print()}>Print</button></>}
        </div>
      </div>
      {data && (
        <div className="card p-4 overflow-x-auto text-sm">
          <div className="text-center mb-3">
            <div className="font-bold text-brand-700 text-lg">Award List — {data.exam.name}</div>
            <div>Class {data.class.name} {data.class.section}</div>
          </div>
          <table className="w-full border border-gray-400 text-center min-w-max">
            <thead className="bg-brand-50">
              <tr>
                <th className="border border-gray-400 px-2 py-1">Roll</th>
                <th className="border border-gray-400 px-2 py-1">Adm No</th>
                <th className="border border-gray-400 px-2 py-1 text-left">Student</th>
                {data.subjects.map(s => <th key={s.subject} className="border border-gray-400 px-2 py-1">{s.subject}<div className="font-normal text-xs">/{s.max_marks}</div></th>)}
                <th className="border border-gray-400 px-2 py-1">Total</th>
                <th className="border border-gray-400 px-2 py-1">%</th>
                <th className="border border-gray-400 px-2 py-1">Grade</th>
              </tr>
            </thead>
            <tbody>
              {data.students.map(s => (
                <tr key={s.id}>
                  <td className="border border-gray-400 px-2 py-1">{s.roll_no ?? ''}</td>
                  <td className="border border-gray-400 px-2 py-1">{s.admission_no}</td>
                  <td className="border border-gray-400 px-2 py-1 text-left">{s.full_name}</td>
                  {data.subjects.map(x => <td key={x.subject} className="border border-gray-400 px-2 py-1">{cellText(s.marks[x.subject]) || '—'}</td>)}
                  <td className="border border-gray-400 px-2 py-1">{s.max_total ? `${s.total}/${s.max_total}` : '—'}</td>
                  <td className="border border-gray-400 px-2 py-1">{s.pct ?? '—'}</td>
                  <td className="border border-gray-400 px-2 py-1 font-semibold">{s.grade || '—'}</td>
                </tr>
              ))}
              {!data.students.length && <tr><td colSpan={data.subjects.length + 6} className="py-4 text-gray-500">No active students in this class.</td></tr>}
            </tbody>
          </table>
          <div className="flex justify-between mt-12 text-xs print-avoid-break">
            <div className="border-t border-gray-500 pt-1 w-48 text-center">Subject Teacher</div>
            <div className="border-t border-gray-500 pt-1 w-48 text-center">Class Teacher</div>
            <div className="border-t border-gray-500 pt-1 w-48 text-center">Principal</div>
          </div>
        </div>
      )}
    </Shell>
  );
}
