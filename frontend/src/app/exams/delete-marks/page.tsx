'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, getUser } from '@/lib/api';
import { ClassSelect, ExamSelect, Flash, PageHead, classLabel, useExamLookups, useFlash } from '../_shared';

export default function DeleteMarksPage() {
  const isAdmin = getUser<any>()?.role === 'admin';
  const { exams, classes } = useExamLookups();
  const { msg, flash } = useFlash();
  const [examId, setExamId] = useState('');
  const [classId, setClassId] = useState('');
  const [counts, setCounts] = useState<{ subject: string; count: number }[]>([]);

  async function load() {
    if (!examId || !classId) return setCounts([]);
    try { setCounts(await api(`/exam/marks-count?exam_id=${examId}&class_id=${classId}`)); }
    catch (e: any) { flash(e.message, false); }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [examId, classId]);

  async function remove(subject: string, count: number) {
    const exam = exams.find(e => String(e.id) === examId)?.name;
    const typed = prompt(`This permanently deletes ${count} ${subject} mark(s) for ${classLabel(classes, classId)} in ${exam}.\nType DELETE to confirm.`);
    if (typed !== 'DELETE') return;
    try {
      const r = await api<{ deleted: number }>(`/exam/marks?exam_id=${examId}&class_id=${classId}&subject=${encodeURIComponent(subject)}`, { method: 'DELETE' });
      flash(`Deleted ${r.deleted} mark(s).`);
      load();
    } catch (e: any) { flash(e.message, false); }
  }

  if (!isAdmin) return <Shell><PageHead title="Delete Marks Entry" /><div className="card p-6 text-gray-500">Only the admin can delete marks.</div></Shell>;

  return (
    <Shell>
      <PageHead title="Delete Marks Entry" subtitle="Remove all marks of one subject for a class in an exam, e.g. to re-enter them." />
      <Flash msg={msg} />
      <div className="card p-4 mb-4 grid md:grid-cols-2 gap-3 text-sm max-w-2xl">
        <div><label className="label">Exam</label><ExamSelect exams={exams} value={examId} onChange={setExamId} /></div>
        <div><label className="label">Class</label><ClassSelect classes={classes} value={classId} onChange={setClassId} /></div>
      </div>
      {examId && classId && (
        <div className="card p-4 overflow-x-auto text-sm max-w-2xl">
          <table className="table">
            <thead><tr><th>Subject</th><th>Marks Entered</th><th></th></tr></thead>
            <tbody>
              {counts.map(c => (
                <tr key={c.subject}>
                  <td>{c.subject}</td><td>{c.count}</td>
                  <td><button className="text-xs text-red-600 hover:underline" onClick={() => remove(c.subject, c.count)}>Delete</button></td>
                </tr>
              ))}
              {!counts.length && <tr><td colSpan={3} className="text-center py-4 text-gray-500">No marks entered for this class in this exam.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
