'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Shell from '@/components/Shell';
import { api, getUser } from '@/lib/api';

type ClassRow = { id: number; name: string; section: string };
type Teacher = { id: number; full_name: string; employee_no: string };
type Slot = {
  id: number; class_id: number; day: string; period: number; subject: string; teacher_id: number | null; teacher_name?: string | null;
  start_time: string | null; end_time: string | null; class_name?: string; class_section?: string;
};
type Editing = { day: string; period: number; subject: string; teacher_id: string; id?: number };

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function TimetablePage() {
  const user = getUser<any>();
  const isAdmin = user?.role === 'admin';
  const isStaff = isAdmin || user?.role === 'teacher';
  const [view, setView] = useState<'class' | 'teacher'>(user?.role === 'teacher' ? 'teacher' : 'class');
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [classId, setClassId] = useState('');
  const [teacherId, setTeacherId] = useState(user?.role === 'teacher' && user.linkedId ? String(user.linkedId) : '');
  const [rows, setRows] = useState<Slot[]>([]);
  const [extraPeriods, setExtraPeriods] = useState(0);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [timing, setTiming] = useState<{ period: number; start: string; end: string } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const flash = (text: string, ok = true) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 4000); };

  useEffect(() => {
    api<ClassRow[]>('/classes').then(async c => {
      setClasses(c);
      if (user?.role === 'student' || user?.role === 'parent') {
        const own = await api<any[]>('/students').catch(() => []);
        if (own[0]?.class_id) return setClassId(String(own[0].class_id));
      }
      if (c[0]) setClassId(String(c[0].id));
    }).catch(() => {});
    if (isStaff) api<Teacher[]>('/teachers').then(setTeachers).catch(() => {});
    if (isAdmin) api<{ name: string }[]>('/masters/subjects').then(r => setSubjects(r.map(s => s.name))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    try {
      if (view === 'class' && classId) setRows(await api<Slot[]>(`/timetable/class/${classId}`));
      else if (view === 'teacher' && teacherId) setRows(await api<Slot[]>(`/academic/timetable/teacher/${teacherId}`));
      else setRows([]);
    } catch (e: any) { flash(e.message, false); }
  }, [view, classId, teacherId]);
  useEffect(() => { load(); setEditing(null); setTiming(null); setExtraPeriods(0); }, [load]);

  const periods = useMemo(() => {
    const max = Math.max(0, ...rows.map(r => r.period));
    const base = view === 'class' && isAdmin ? Math.max(max, 8) : max;
    return Array.from({ length: base + extraPeriods }, (_, i) => i + 1);
  }, [rows, extraPeriods, view, isAdmin]);

  const timeOf = (p: number) => rows.find(r => r.period === p && r.start_time);
  const cells = (d: string, p: number) => rows.filter(r => r.day === d && r.period === p);
  const editable = isAdmin && view === 'class';

  async function saveSlot() {
    if (!editing) return;
    if (!editing.subject) return flash('Choose a subject.', false);
    const t = timeOf(editing.period);
    try {
      await api('/timetable', { method: 'POST', body: JSON.stringify({
        class_id: Number(classId), day: editing.day, period: editing.period, subject: editing.subject,
        teacher_id: editing.teacher_id ? Number(editing.teacher_id) : null, start_time: t?.start_time || null, end_time: t?.end_time || null,
      }) });
      setEditing(null); flash('Period saved.'); load();
    } catch (e: any) { flash(e.message, false); }
  }

  async function deleteSlot() {
    if (!editing?.id) return;
    try { await api(`/timetable/${editing.id}`, { method: 'DELETE' }); setEditing(null); flash('Period cleared.'); load(); }
    catch (e: any) { flash(e.message, false); }
  }

  async function saveTiming() {
    if (!timing) return;
    try {
      const r = await api<{ updated: number }>('/academic/timetable/period-times', { method: 'POST', body: JSON.stringify({
        class_id: Number(classId), period: timing.period, start_time: timing.start, end_time: timing.end,
      }) });
      setTiming(null);
      flash(r.updated ? `Timing saved for period ${timing.period}.` : 'Add at least one subject in this period first; timings are stored with its slots.', !!r.updated);
      load();
    } catch (e: any) { flash(e.message, false); }
  }

  const cls = classes.find(c => String(c.id) === classId);
  const teacher = teachers.find(t => String(t.id) === teacherId);
  const heading = view === 'class' ? (cls ? `${cls.name} ${cls.section}` : '') : teacher?.full_name || '';

  return (
    <Shell>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4 no-print">
        <h2 className="text-xl font-bold text-brand-700">Time Table</h2>
        <button className="btn bg-gray-200 text-sm" onClick={() => window.print()} disabled={!rows.length && !editable}>Print</button>
      </div>
      <h2 className="print-only text-lg font-bold mb-2">Time Table — {heading}</h2>

      {msg && (
        <div className={`text-sm rounded px-3 py-2 mb-3 border no-print ${msg.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>{msg.text}</div>
      )}

      <div className="card p-4 mb-4 grid md:grid-cols-4 gap-3 text-sm no-print">
        {isStaff && (
          <div><label className="label">View</label>
            <select className="input" value={view} onChange={e => setView(e.target.value as 'class' | 'teacher')}>
              <option value="class">Class-wise</option><option value="teacher">Teacher-wise</option>
            </select></div>
        )}
        {view === 'class' ? (
          <div><label className="label">Select Class</label>
            <select className="input" value={classId} onChange={e => setClassId(e.target.value)}>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name} {c.section}</option>)}
            </select></div>
        ) : (
          <div><label className="label">Select Teacher</label>
            <select className="input" value={teacherId} onChange={e => setTeacherId(e.target.value)}>
              <option value="">-- Select --</option>
              {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select></div>
        )}
        {editable && (
          <div className="flex items-end gap-2">
            <button className="btn bg-gray-200" onClick={() => setExtraPeriods(n => n + 1)}>+ Add Period</button>
          </div>
        )}
        {editable && <div className="md:col-span-4 text-xs text-gray-500">Click a cell to set its subject and teacher. Click a period heading to set its timing.</div>}
      </div>

      {editing && (
        <div className="card p-4 mb-4 grid md:grid-cols-5 gap-3 text-sm no-print border-2 border-brand-200">
          <div className="md:col-span-5 font-semibold text-brand-700">{editing.day}, Period {editing.period}</div>
          <div><label className="label">Subject *</label>
            <input className="input" list="tt-subjects" value={editing.subject} onChange={e => setEditing({ ...editing, subject: e.target.value })} />
            <datalist id="tt-subjects">{subjects.map(s => <option key={s} value={s} />)}</datalist></div>
          <div><label className="label">Teacher</label>
            <select className="input" value={editing.teacher_id} onChange={e => setEditing({ ...editing, teacher_id: e.target.value })}>
              <option value="">— None —</option>
              {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select></div>
          <div className="flex items-end gap-2 md:col-span-3">
            <button className="btn btn-primary" onClick={saveSlot}>Save</button>
            {editing.id && <button className="btn bg-red-600 text-white hover:bg-red-700" onClick={deleteSlot}>Clear Period</button>}
            <button className="btn bg-gray-200" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      )}

      {timing && (
        <div className="card p-4 mb-4 grid md:grid-cols-5 gap-3 text-sm no-print border-2 border-brand-200">
          <div className="md:col-span-5 font-semibold text-brand-700">Period {timing.period} timing for {heading}</div>
          <div><label className="label">Start</label><input className="input" type="time" value={timing.start} onChange={e => setTiming({ ...timing, start: e.target.value })} /></div>
          <div><label className="label">End</label><input className="input" type="time" value={timing.end} onChange={e => setTiming({ ...timing, end: e.target.value })} /></div>
          <div className="flex items-end gap-2 md:col-span-3">
            <button className="btn btn-primary" onClick={saveTiming}>Save Timing</button>
            <button className="btn bg-gray-200" onClick={() => setTiming(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="card p-4 overflow-x-auto">
        <table className="table min-w-[720px] text-sm">
          <thead><tr>
            <th>Day</th>
            {periods.map(p => {
              const t = timeOf(p);
              return (
                <th key={p} className={editable ? 'cursor-pointer hover:bg-brand-700' : ''} title={editable ? 'Set timing' : undefined}
                  onClick={() => editable && setTiming({ period: p, start: t?.start_time || '', end: t?.end_time || '' })}>
                  Period {p}
                  {t && <div className="text-[10px] font-normal opacity-80">{t.start_time}–{t.end_time}</div>}
                </th>
              );
            })}
          </tr></thead>
          <tbody>
            {DAYS.map(d => (
              <tr key={d}>
                <td className="font-medium bg-brand-50">{d}</td>
                {periods.map(p => {
                  const here = cells(d, p);
                  const cell = here[0];
                  const active = editing?.day === d && editing.period === p;
                  return (
                    <td key={p} className={`${editable ? 'cursor-pointer hover:bg-brand-50' : ''} ${active ? 'bg-amber-50' : ''}`}
                      onClick={() => editable && setEditing({ day: d, period: p, subject: cell?.subject || '', teacher_id: cell?.teacher_id ? String(cell.teacher_id) : '', id: cell?.id })}>
                      {here.length ? here.map(c => (
                        <div key={c.id} className="mb-1 last:mb-0">
                          <div className="font-medium">{c.subject}</div>
                          <div className="text-xs text-gray-500">{view === 'teacher' ? `${c.class_name} ${c.class_section}` : c.teacher_name || ''}</div>
                        </div>
                      )) : <span className="text-gray-300">{editable ? '+' : '—'}</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
            {!periods.length && <tr><td colSpan={2} className="text-center py-4 text-gray-500">No time table configured.</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
