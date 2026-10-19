'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, getUser } from '@/lib/api';
import { ClassSelect, Flash, PageHead, useExamLookups, useFlash } from '../_shared';

type Stu = { id: number; admission_no: string; full_name: string; roll_no: number | null; subjects: string[] };

export default function SubjectMappingPage() {
  const isAdmin = getUser<any>()?.role === 'admin';
  const { classes } = useExamLookups();
  const { msg, flash } = useFlash();
  const [classId, setClassId] = useState('');
  const [session, setSession] = useState('');
  const [optional, setOptional] = useState<string[]>([]);
  const [students, setStudents] = useState<Stu[]>([]);

  async function load() {
    if (!classId) return;
    try {
      const d = await api<{ session: string; optional: string[]; students: Stu[] }>(`/exam/student-subjects?class_id=${classId}${session ? `&session=${encodeURIComponent(session)}` : ''}`);
      setSession(d.session); setOptional(d.optional); setStudents(d.students);
    } catch (e: any) { flash(e.message, false); }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [classId]);

  const toggle = (id: number, sub: string) => setStudents(list => list.map(s => s.id !== id ? s : {
    ...s, subjects: s.subjects.includes(sub) ? s.subjects.filter(x => x !== sub) : [...s.subjects, sub],
  }));
  const toggleAll = (sub: string) => {
    const all = students.every(s => s.subjects.includes(sub));
    setStudents(list => list.map(s => ({ ...s, subjects: all ? s.subjects.filter(x => x !== sub) : Array.from(new Set([...s.subjects, sub])) })));
  };

  async function save() {
    try {
      await api(`/exam/student-subjects/${classId}`, { method: 'PUT', body: JSON.stringify({ session, rows: students.map(s => ({ student_id: s.id, subjects: s.subjects })) }) });
      flash('Subject mapping saved.');
    } catch (e: any) { flash(e.message, false); }
  }

  return (
    <Shell>
      <PageHead title="Student Subject Mapping" subtitle="Choose which optional / elective subjects each student takes." />
      <Flash msg={msg} />
      <div className="card p-4 mb-4 grid md:grid-cols-3 gap-3 text-sm">
        <div><label className="label">Class</label><ClassSelect classes={classes} value={classId} onChange={setClassId} /></div>
        <div><label className="label">Session</label><input className="input" value={session} onChange={e => setSession(e.target.value)} placeholder="Current session" /></div>
        <div className="flex items-end gap-2">
          <button className="btn bg-gray-200" onClick={load} disabled={!classId}>Load</button>
          <a href="/report/exam-subject-mapping" className="text-xs text-brand-600 underline mb-2">Mapping report</a>
        </div>
      </div>
      {classId && (
        <div className="card p-4 overflow-x-auto text-sm">
          {!optional.length ? (
            <div className="text-gray-500">
              This class has no optional subjects. Mark subjects as Optional in <a className="text-brand-600 underline" href="/exams/class-subjects">Class Subjects</a>;
              compulsory subjects apply to every student automatically.
            </div>
          ) : (
            <>
              <table className="table min-w-max">
                <thead><tr>
                  <th>Roll</th><th>Adm No</th><th>Student</th>
                  {optional.map(o => (
                    <th key={o} className="text-center">
                      <div>{o}</div>
                      {isAdmin && <button className="text-[11px] underline font-normal" onClick={() => toggleAll(o)}>all / none</button>}
                    </th>
                  ))}
                </tr></thead>
                <tbody>
                  {students.map(s => (
                    <tr key={s.id}>
                      <td>{s.roll_no ?? '—'}</td><td>{s.admission_no}</td><td>{s.full_name}</td>
                      {optional.map(o => (
                        <td key={o} className="text-center">
                          <input type="checkbox" disabled={!isAdmin} checked={s.subjects.includes(o)} onChange={() => toggle(s.id, o)} aria-label={`${s.full_name} takes ${o}`} />
                        </td>
                      ))}
                    </tr>
                  ))}
                  {!students.length && <tr><td colSpan={3 + optional.length} className="text-center py-4 text-gray-500">No active students in this class.</td></tr>}
                </tbody>
              </table>
              {isAdmin && <button className="btn btn-primary mt-4" onClick={save}>Save Mapping</button>}
            </>
          )}
        </div>
      )}
    </Shell>
  );
}
