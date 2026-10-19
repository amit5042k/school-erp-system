'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, fmtDate } from '@/lib/api';
import { ClassSelect, ExamSelect, Flash, PageHead, useExamLookups, useFlash } from '../_shared';

type Block = { id: number; full_name: string; admission_no: string; class_label: string; exam_name: string; reason: string | null; created_at: string };

export default function BlockResultsPage() {
  const { exams, classes } = useExamLookups();
  const { msg, flash } = useFlash();
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [classId, setClassId] = useState('');
  const [examId, setExamId] = useState('');
  const [reason, setReason] = useState('Fee pending');
  const [students, setStudents] = useState<any[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());

  const load = () => api<Block[]>('/exam/blocks').then(setBlocks).catch(e => flash(e.message, false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);
  useEffect(() => {
    setPicked(new Set());
    if (!classId) return setStudents([]);
    api<any[]>('/students').then(s => setStudents(s.filter(x => String(x.class_id) === classId))).catch(() => {});
  }, [classId]);

  const toggle = (id: number) => setPicked(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function block() {
    if (!picked.size) return flash('Select at least one student.', false);
    try {
      await api('/exam/blocks', { method: 'POST', body: JSON.stringify({ student_ids: [...picked], exam_id: examId ? Number(examId) : 0, reason }) });
      flash(`Blocked results for ${picked.size} student(s).`);
      setPicked(new Set());
      load();
    } catch (e: any) { flash(e.message, false); }
  }
  async function unblock(b: Block) {
    if (!confirm(`Unblock results for ${b.full_name} (${b.exam_name})?`)) return;
    try { await api(`/exam/blocks/${b.id}`, { method: 'DELETE' }); load(); }
    catch (e: any) { flash(e.message, false); }
  }

  return (
    <Shell>
      <PageHead title="Block Exam Results" subtitle="Blocked students and their parents cannot see marks or report cards until unblocked (staff still can)." />
      <Flash msg={msg} />

      <div className="card p-4 mb-4 text-sm">
        <div className="grid md:grid-cols-3 gap-3">
          <div><label className="label">Class</label><ClassSelect classes={classes} value={classId} onChange={setClassId} /></div>
          <div><label className="label">Exam</label><ExamSelect exams={exams} value={examId} onChange={setExamId} allowAll="All exams" /></div>
          <div><label className="label">Reason</label><input className="input" value={reason} onChange={e => setReason(e.target.value)} /></div>
        </div>
        {classId && (
          <div className="mt-3 overflow-x-auto">
            <table className="table min-w-max">
              <thead><tr>
                <th><input type="checkbox" aria-label="Select all" checked={students.length > 0 && students.every(s => picked.has(s.id))}
                  onChange={e => setPicked(e.target.checked ? new Set(students.map(s => s.id)) : new Set())} /></th>
                <th>Roll</th><th>Adm No</th><th>Student</th>
              </tr></thead>
              <tbody>
                {students.map(s => (
                  <tr key={s.id}>
                    <td><input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} aria-label={`Select ${s.full_name}`} /></td>
                    <td>{s.roll_no ?? '—'}</td><td>{s.admission_no}</td><td>{s.full_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="btn bg-red-600 text-white hover:bg-red-700 mt-3" onClick={block}>Block {picked.size || ''} Selected</button>
          </div>
        )}
      </div>

      <div className="card p-4 overflow-x-auto text-sm">
        <h3 className="font-semibold text-brand-700 mb-3">Currently Blocked</h3>
        <table className="table min-w-max">
          <thead><tr><th>Student</th><th>Class</th><th>Exam</th><th>Reason</th><th>Blocked On</th><th></th></tr></thead>
          <tbody>
            {blocks.map(b => (
              <tr key={b.id}>
                <td>{b.full_name} <span className="text-xs text-gray-500">({b.admission_no})</span></td>
                <td>{b.class_label}</td><td>{b.exam_name}</td><td>{b.reason || '—'}</td><td>{fmtDate(b.created_at)}</td>
                <td><button className="text-xs text-brand-600 hover:underline" onClick={() => unblock(b)}>Unblock</button></td>
              </tr>
            ))}
            {!blocks.length && <tr><td colSpan={6} className="text-center py-4 text-gray-500">No results are blocked.</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
