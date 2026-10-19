'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Shell from '@/components/Shell';
import { api, getUser } from '@/lib/api';

type Exam = { id: number; name: string; term?: string | null };
type Class = { id: number; name: string; section: string };
type Band = { min_pct: number; grade: string };
type SheetStudent = { id: number; admission_no: string; full_name: string; roll_no: number | null; mark: { marks_obtained: number; max_marks: number; grade: string | null } | null };
type Sheet = { max_marks: number; pass_marks: number | null; locked: boolean; can_edit: boolean; bands: Band[]; students: SheetStudent[] };
type Entry = { marks: string; absent: boolean; grade: string };
type MyMark = { exam_id: number; exam_name: string; subject: string; marks_obtained: number; max_marks: number; grade: string | null };

const autoGrade = (got: number, max: number, bands: Band[]) => {
  if (!(max > 0)) return '';
  const pct = (got / max) * 100;
  return bands.find(b => pct >= b.min_pct)?.grade || '';
};

function StudentMarks() {
  const [rows, setRows] = useState<MyMark[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api<MyMark[]>('/exam/my-marks').then(setRows).catch(e => setErr(e.message)); }, []);
  const byExam = useMemo(() => rows.reduce<Record<string, MyMark[]>>((a, r) => { (a[r.exam_name] ||= []).push(r); return a; }, {}), [rows]);
  return (
    <Shell>
      <h2 className="text-xl font-bold text-brand-700 mb-1">My Marks</h2>
      <p className="text-sm text-gray-500 mb-4">Marks appear after the school publishes them. <Link className="text-brand-600 underline" href="/exams/report-card">View report card</Link></p>
      {err && <div className="text-red-700 text-sm mb-2">{err}</div>}
      {Object.entries(byExam).map(([exam, list]) => {
        const got = list.reduce((a, m) => a + m.marks_obtained, 0), max = list.reduce((a, m) => a + m.max_marks, 0);
        return (
          <div key={exam} className="card p-4 mb-4 overflow-x-auto">
            <h3 className="font-semibold text-brand-700 mb-2">{exam}</h3>
            <table className="table text-sm">
              <thead><tr><th>Subject</th><th>Marks</th><th>Max</th><th>Grade</th></tr></thead>
              <tbody>
                {list.map(m => <tr key={m.subject}><td>{m.subject}</td><td>{m.grade === 'AB' ? 'Absent' : m.marks_obtained}</td><td>{m.max_marks}</td><td>{m.grade || '—'}</td></tr>)}
                <tr className="font-semibold bg-brand-50"><td>Total</td><td>{got}</td><td>{max}</td><td>{max ? `${Math.round((got / max) * 1000) / 10}%` : ''}</td></tr>
              </tbody>
            </table>
          </div>
        );
      })}
      {!rows.length && !err && <div className="card p-6 text-center text-gray-500">No published marks yet.</div>}
    </Shell>
  );
}

function StaffMarks() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [examId, setExamId] = useState('');
  const [classId, setClassId] = useState('');
  const [subject, setSubject] = useState('');
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [entries, setEntries] = useState<Record<number, Entry>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const flash = (text: string, ok = true) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 3500); };

  useEffect(() => {
    api<Exam[]>('/exams').then(setExams).catch(() => {});
    api<Class[]>('/classes').then(setClasses).catch(() => {});
  }, []);

  useEffect(() => {
    setSubject(''); setSheet(null);
    if (!classId) return setSubjects([]);
    api<{ subject: string }[]>(`/exam/class-subjects?class_id=${classId}`).then(async cs => {
      if (cs.length) return setSubjects(cs.map(c => c.subject));
      const all = await api<{ name: string }[]>('/masters/subjects');
      setSubjects(all.map(s => s.name));
    }).catch(() => {});
  }, [classId]);

  useEffect(() => {
    if (!examId || !classId || !subject) return setSheet(null);
    api<Sheet>(`/exam/marks-sheet?exam_id=${examId}&class_id=${classId}&subject=${encodeURIComponent(subject)}`).then(d => {
      setSheet(d);
      const e: Record<number, Entry> = {};
      for (const s of d.students) e[s.id] = {
        marks: s.mark && s.mark.grade !== 'AB' ? String(s.mark.marks_obtained) : '',
        absent: s.mark?.grade === 'AB',
        grade: s.mark?.grade && s.mark.grade !== 'AB' ? s.mark.grade : '',
      };
      setEntries(e);
    }).catch(e => flash(e.message, false));
  }, [examId, classId, subject]);

  const max = sheet?.max_marks || 100;
  const readOnly = !sheet || sheet.locked || !sheet.can_edit;
  const set = (id: number, patch: Partial<Entry>) => setEntries(e => ({ ...e, [id]: { ...e[id], ...patch } }));

  async function save() {
    if (!sheet) return;
    for (const s of sheet.students) {
      const e = entries[s.id];
      if (e && !e.absent && e.marks !== '' && !(Number(e.marks) >= 0 && Number(e.marks) <= max)) {
        return flash(`${s.full_name}: marks must be between 0 and ${max}.`, false);
      }
    }
    setBusy(true);
    try {
      const rows = sheet.students.map(s => {
        const e = entries[s.id];
        return e.absent ? { student_id: s.id, absent: true, max_marks: max } : { student_id: s.id, marks_obtained: e.marks, max_marks: max, grade: e.grade || null };
      });
      const r = await api<{ saved: number }>('/exam/marks/bulk', { method: 'POST', body: JSON.stringify({ exam_id: Number(examId), class_id: Number(classId), subject, rows }) });
      flash(`Saved marks for ${r.saved} student(s).`);
    } catch (e: any) { flash(e.message, false); }
    finally { setBusy(false); }
  }

  const entered = sheet ? sheet.students.filter(s => entries[s.id]?.absent || entries[s.id]?.marks !== '').length : 0;

  return (
    <Shell>
      <div className="text-xs text-gray-500 mb-1"><Link href="/exams" className="hover:underline">Examinations</Link> › Marks Entry</div>
      <h2 className="text-xl font-bold text-brand-700 mb-4">Marks Entry</h2>

      <div className="card p-4 mb-4 grid md:grid-cols-4 gap-3 text-sm">
        <div><label className="label">Exam</label>
          <select className="input" value={examId} onChange={e => setExamId(e.target.value)}>
            <option value="">-- Select --</option>
            {exams.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select></div>
        <div><label className="label">Class</label>
          <select className="input" value={classId} onChange={e => setClassId(e.target.value)}>
            <option value="">-- Select --</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name} {c.section}</option>)}
          </select></div>
        <div><label className="label">Subject</label>
          <select className="input" value={subject} onChange={e => setSubject(e.target.value)} disabled={!classId}>
            <option value="">-- Select --</option>
            {subjects.map(s => <option key={s}>{s}</option>)}
          </select></div>
        <div className="flex items-end"><button className="btn btn-primary" onClick={save} disabled={readOnly || busy}>{busy ? 'Saving…' : 'Save Marks'}</button></div>
      </div>

      {msg && <div className={`text-sm rounded px-3 py-2 mb-3 border ${msg.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>{msg.text}</div>}
      {sheet?.locked && <div className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded px-3 py-2 mb-3">The result for this exam is published, so marks are locked. Ask the admin to unpublish it to make changes.</div>}
      {sheet && !sheet.can_edit && !sheet.locked && <div className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded px-3 py-2 mb-3">You are not the subject teacher for {subject} in this class, so you can only view these marks.</div>}

      {sheet && (
        <div className="card p-4 overflow-x-auto">
          <div className="text-xs text-gray-500 mb-2">Max marks {max}{sheet.pass_marks != null ? ` · pass ${sheet.pass_marks}` : ''} · {entered}/{sheet.students.length} entered · grades fill in automatically (type one to override)</div>
          <table className="table min-w-max text-sm">
            <thead><tr><th>Roll</th><th>Adm. No</th><th>Student</th><th>Marks (/{max})</th><th>Absent</th><th>Grade</th></tr></thead>
            <tbody>
              {sheet.students.map(s => {
                const e = entries[s.id] || { marks: '', absent: false, grade: '' };
                const n = Number(e.marks);
                const invalid = e.marks !== '' && !(n >= 0 && n <= max);
                const auto = e.absent ? 'AB' : e.marks !== '' && !invalid ? autoGrade(n, max, sheet.bands) : '';
                const fail = sheet.pass_marks != null && e.marks !== '' && !e.absent && n < sheet.pass_marks;
                return (
                  <tr key={s.id}>
                    <td>{s.roll_no ?? '—'}</td>
                    <td>{s.admission_no}</td>
                    <td>{s.full_name}</td>
                    <td><input className={`input max-w-[6rem] ${invalid ? 'border-red-500' : fail ? 'text-red-700' : ''}`} type="number" min={0} max={max} step="0.5"
                      disabled={readOnly || e.absent} value={e.marks} onChange={ev => set(s.id, { marks: ev.target.value })} aria-label={`Marks for ${s.full_name}`} /></td>
                    <td><input type="checkbox" disabled={readOnly} checked={e.absent} onChange={ev => set(s.id, { absent: ev.target.checked, marks: '' })} aria-label={`${s.full_name} absent`} /></td>
                    <td><input className="input max-w-[5rem]" disabled={readOnly || e.absent} placeholder={auto} value={e.absent ? 'AB' : e.grade} onChange={ev => set(s.id, { grade: ev.target.value })} /></td>
                  </tr>
                );
              })}
              {!sheet.students.length && <tr><td colSpan={6} className="text-center py-4 text-gray-500">No students take this subject in this class.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {!sheet && <div className="card p-6 text-center text-gray-500 text-sm">Choose an exam, class and subject to enter marks.</div>}
    </Shell>
  );
}

export default function MarksPage() {
  const role = getUser<any>()?.role;
  return role === 'student' || role === 'parent' ? <StudentMarks /> : <StaffMarks />;
}
