'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';

type Exam = { id: number; name: string };
type Student = { id: number; full_name: string; admission_no: string; class_id: number; class_name: string; class_section: string };
type Class = { id: number; name: string; section: string };
type Mark = { exam_id: number; student_id: number; subject: string; marks_obtained: number; max_marks: number; grade: string };

export default function MarksPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [examId, setExamId] = useState('');
  const [classId, setClassId] = useState('');
  const [subject, setSubject] = useState('Mathematics');
  const [rows, setRows] = useState<Record<number, Partial<Mark>>>({});
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    api<Exam[]>('/exams').then(setExams);
    api<Class[]>('/classes').then(setClasses);
    api<Student[]>('/students').then(setStudents);
  }, []);

  useEffect(() => {
    if (!examId) return;
    api<any[]>(`/marks?exam_id=${examId}${classId ? `&class_id=${classId}` : ''}`).then(data => {
      const map: Record<number, any> = {};
      for (const m of data) if (m.subject === subject) map[m.student_id] = m;
      setRows(map);
    });
  }, [examId, classId, subject]);

  const filteredStudents = classId ? students.filter(s => s.class_id === Number(classId)) : students;

  function setVal(sid: number, field: string, val: any) {
    setRows(prev => ({ ...prev, [sid]: { ...(prev[sid] || {}), [field]: val } }));
  }

  async function save() {
    if (!examId) return setMsg('Pick an exam first');
    try {
      for (const s of filteredStudents) {
        const m = rows[s.id];
        if (!m || m.marks_obtained == null || m.marks_obtained === ('' as any)) continue;
        await api('/marks', {
          method: 'POST',
          body: JSON.stringify({
            exam_id: Number(examId), student_id: s.id, subject,
            marks_obtained: Number(m.marks_obtained), max_marks: Number(m.max_marks || 100), grade: m.grade || null,
          }),
        });
      }
      setMsg('Marks saved.');
      setTimeout(() => setMsg(null), 2500);
    } catch (e: any) { setMsg(e.message); }
  }

  return (
    <Shell>
      <h2 className="text-xl font-bold text-brand-700 mb-4">Marks Entry</h2>

      <div className="card p-4 mb-4 grid md:grid-cols-4 gap-3">
        <div><label className="label">Exam</label>
          <select className="input" value={examId} onChange={e => setExamId(e.target.value)}>
            <option value="">-- Select --</option>
            {exams.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select></div>
        <div><label className="label">Class</label>
          <select className="input" value={classId} onChange={e => setClassId(e.target.value)}>
            <option value="">All</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name} {c.section}</option>)}
          </select></div>
        <div><label className="label">Subject</label>
          <input className="input" value={subject} onChange={e => setSubject(e.target.value)} /></div>
        <div className="flex items-end"><button className="btn btn-primary" onClick={save}>Save Marks</button></div>
      </div>

      {msg && <div className="text-sm bg-green-50 border border-green-200 text-green-700 rounded px-3 py-2 mb-3">{msg}</div>}

      <div className="card p-4 overflow-x-auto">
        <table className="table min-w-max">
          <thead><tr>
            <th>Adm. No</th><th>Student</th><th>Class</th><th>Marks</th><th>Max</th><th>Grade</th>
          </tr></thead>
          <tbody>
            {filteredStudents.map(s => {
              const m = rows[s.id] || {};
              return (
                <tr key={s.id}>
                  <td>{s.admission_no}</td>
                  <td>{s.full_name}</td>
                  <td>{s.class_name} {s.class_section}</td>
                  <td><input className="input max-w-[6rem]" type="number" value={m.marks_obtained ?? ''} onChange={e => setVal(s.id, 'marks_obtained', e.target.value)} /></td>
                  <td><input className="input max-w-[6rem]" type="number" value={m.max_marks ?? 100} onChange={e => setVal(s.id, 'max_marks', e.target.value)} /></td>
                  <td><input className="input max-w-[6rem]" value={m.grade ?? ''} onChange={e => setVal(s.id, 'grade', e.target.value)} /></td>
                </tr>
              );
            })}
            {!filteredStudents.length && <tr><td colSpan={6} className="text-center py-4 text-gray-500">No students.</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
