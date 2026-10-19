'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, getUser } from '@/lib/api';
import { ClassSelect, Flash, PageHead, Teacher, useExamLookups, useFlash } from '../_shared';

export default function SubjectTeachersPage() {
  const isAdmin = getUser<any>()?.role === 'admin';
  const { classes } = useExamLookups();
  const { msg, flash } = useFlash();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classId, setClassId] = useState('');
  const [subjects, setSubjects] = useState<string[]>([]);
  const [assign, setAssign] = useState<Record<string, string>>({});

  useEffect(() => { api<Teacher[]>('/teachers').then(setTeachers).catch(() => {}); }, []);

  useEffect(() => {
    if (!classId) return;
    Promise.all([
      api<any[]>(`/exam/class-subjects?class_id=${classId}`),
      api<any[]>(`/exam/subject-teachers?class_id=${classId}`),
    ]).then(([cs, st]) => {
      setSubjects(cs.map(c => c.subject));
      setAssign(Object.fromEntries(st.map(s => [s.subject, String(s.teacher_id)])));
    }).catch(e => flash(e.message, false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  const cls = classes.find(c => String(c.id) === classId);
  const classTeacher = teachers.find(t => t.id === cls?.class_teacher_id);

  async function save() {
    try {
      await api(`/exam/subject-teachers/${classId}`, {
        method: 'PUT',
        body: JSON.stringify({ rows: subjects.map(s => ({ subject: s, teacher_id: assign[s] ? Number(assign[s]) : null })) }),
      });
      flash('Subject teachers saved.');
    } catch (e: any) { flash(e.message, false); }
  }

  return (
    <Shell>
      <PageHead title="Assign Subject Teachers" subtitle="Only the assigned teacher (or the admin) can enter marks for a subject." />
      <Flash msg={msg} />
      <div className="card p-4 mb-4 max-w-sm text-sm">
        <label className="label">Class</label><ClassSelect classes={classes} value={classId} onChange={setClassId} />
        {cls && <div className="text-xs text-gray-500 mt-2">Class teacher: {classTeacher?.full_name || '—'} (can enter marks for subjects with no teacher assigned)</div>}
      </div>
      {classId && (
        <div className="card p-4 overflow-x-auto text-sm">
          <table className="table min-w-max">
            <thead><tr><th>Subject</th><th>Teacher</th></tr></thead>
            <tbody>
              {subjects.map(s => (
                <tr key={s}>
                  <td>{s}</td>
                  <td>
                    <select className="input" disabled={!isAdmin} value={assign[s] || ''} onChange={e => setAssign(a => ({ ...a, [s]: e.target.value }))}>
                      <option value="">— Not assigned —</option>
                      {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name} ({t.employee_no})</option>)}
                    </select>
                  </td>
                </tr>
              ))}
              {!subjects.length && (
                <tr><td colSpan={2} className="text-center py-4 text-gray-500">
                  No subjects set for this class. Add them in <a className="text-brand-600 underline" href="/exams/class-subjects">Class Subjects</a> first.
                </td></tr>
              )}
            </tbody>
          </table>
          {isAdmin && subjects.length > 0 && <button className="btn btn-primary mt-4" onClick={save}>Save</button>}
        </div>
      )}
    </Shell>
  );
}
