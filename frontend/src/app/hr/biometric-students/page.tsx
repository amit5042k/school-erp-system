'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, localDate } from '@/lib/api';
import { Flash, HrHeader, useFlash } from '../_ui';

type Settings = { enabled: boolean; present_until: string; ignore_after: string; mapped_students: number };
type Student = { id: number; admission_no: string; full_name: string; roll_no: string | null; biometric_id: string | null; class: string | null };
type ClassRow = { id: number; name: string; section: string };

const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return localDate(d); };

export default function BiometricStudentsPage() {
  const { msg, flash } = useFlash();
  const [cfg, setCfg] = useState<Settings | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [classId, setClassId] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [from, setFrom] = useState(daysAgo(7));
  const [to, setTo] = useState(localDate());
  const [busy, setBusy] = useState(false);

  const loadCfg = () => api<Settings>('/biometric/students/settings').then(setCfg).catch(e => flash(e.message, false));
  useEffect(() => {
    loadCfg();
    api<ClassRow[]>('/classes').then(c => { setClasses(c); if (c[0]) setClassId(String(c[0].id)); }).catch(() => {});
    /* eslint-disable-next-line */
  }, []);
  useEffect(() => {
    if (!classId) return;
    setEdits({});
    api<Student[]>(`/biometric/students/mapping?class_id=${classId}`).then(setStudents).catch(e => flash(e.message, false));
    /* eslint-disable-next-line */
  }, [classId]);

  async function saveCfg() {
    if (!cfg) return;
    try { await api('/biometric/students/settings', { method: 'PUT', body: JSON.stringify(cfg) }); flash('Settings saved.'); loadCfg(); }
    catch (e: any) { flash(e.message, false); }
  }
  async function saveMapping() {
    const items = Object.entries(edits).map(([id, v]) => ({ student_id: Number(id), biometric_id: v }));
    if (!items.length) return flash('No changes to save.', false);
    setBusy(true);
    try {
      const r = await api<{ saved: number; student_days_marked?: number }>('/biometric/students/mapping', { method: 'PUT', body: JSON.stringify({ items }) });
      flash(`Saved ${r.saved} ID(s).${r.student_days_marked ? ` ${r.student_days_marked} day(s) of attendance filled from earlier punches.` : ''}`);
      setEdits({});
      setStudents(await api<Student[]>(`/biometric/students/mapping?class_id=${classId}`));
      loadCfg();
    } catch (e: any) { flash(e.message, false); }
    finally { setBusy(false); }
  }
  async function apply() {
    setBusy(true);
    try {
      const r = await api<{ days: number; marked: number; kept: number }>('/biometric/students/apply', { method: 'POST', body: JSON.stringify({ from, to }) });
      flash(`${r.marked} attendance entries filled from punches. ${r.kept} already marked by teachers were left unchanged.`);
    } catch (e: any) { flash(e.message, false); }
    finally { setBusy(false); }
  }
  const fillByAdmission = () => setEdits(Object.fromEntries(students.filter(s => !s.biometric_id).map(s => [s.id, s.admission_no])));

  return (
    <Shell>
      <HrHeader title="Student Biometric Attendance" subtitle="Mark students present or late from their first punch on the biometric device"
        links={[{ label: 'Devices', href: '/hr/biometric-devices' }, { label: 'Live Punches', href: '/hr/biometric-live' }]} />
      <Flash msg={msg} />
      {cfg && (
        <div className="card p-4 mb-4 text-sm">
          <label className="flex items-center gap-2 font-medium mb-3">
            <input type="checkbox" checked={cfg.enabled} onChange={e => setCfg({ ...cfg, enabled: e.target.checked })} />
            Mark student attendance from punches
          </label>
          <div className="flex flex-wrap gap-4 items-end">
            <div><label className="label">Present if first punch by</label><input className="input" type="time" value={cfg.present_until} onChange={e => setCfg({ ...cfg, present_until: e.target.value })} /></div>
            <div><label className="label">Late until (later punches ignored)</label><input className="input" type="time" value={cfg.ignore_after} onChange={e => setCfg({ ...cfg, ignore_after: e.target.value })} /></div>
            <button className="btn btn-primary" onClick={saveCfg}>Save Settings</button>
          </div>
          <ul className="text-xs text-gray-500 mt-3 list-disc pl-5 space-y-0.5">
            <li>First punch by {cfg.present_until} → Present; after that until {cfg.ignore_after} → Late.</li>
            <li>No punch → the day is left blank for the class teacher to mark.</li>
            <li>Attendance a teacher has marked or changed is never overwritten.</li>
            <li>{cfg.mapped_students} student(s) have a biometric ID.</li>
          </ul>
        </div>
      )}

      <div className="card p-4 mb-4 text-sm">
        <div className="font-semibold text-brand-700 mb-2">Fill attendance from past punches</div>
        <div className="flex flex-wrap gap-3 items-end">
          <div><label className="label">From</label><input className="input" type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} /></div>
          <div><label className="label">To</label><input className="input" type="date" value={to} max={localDate()} onChange={e => setTo(e.target.value)} /></div>
          <button className="btn bg-gray-200" disabled={busy || !cfg?.enabled} onClick={apply}>Apply</button>
          {!cfg?.enabled && <span className="text-xs text-gray-500">Turn the setting on first.</span>}
        </div>
      </div>

      <div className="card p-4 text-sm">
        <div className="flex flex-wrap gap-3 items-end mb-3">
          <div><label className="label">Class</label>
            <select className="input" value={classId} onChange={e => setClassId(e.target.value)}>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name} {c.section}</option>)}
            </select></div>
          <button className="btn bg-gray-200 text-xs" onClick={fillByAdmission}>Use admission no. for blank IDs</button>
          <button className="btn btn-primary ml-auto" disabled={busy || !Object.keys(edits).length} onClick={saveMapping}>Save IDs ({Object.keys(edits).length})</button>
        </div>
        <table className="table text-sm">
          <thead><tr><th>Roll</th><th>Student</th><th>Admission No</th><th>Biometric ID (as enrolled on device)</th></tr></thead>
          <tbody>
            {students.map(s => (
              <tr key={s.id}>
                <td>{s.roll_no || '—'}</td><td>{s.full_name}</td><td>{s.admission_no}</td>
                <td><input className={`input w-40 ${s.id in edits ? 'border-amber-400' : ''}`} value={edits[s.id] ?? s.biometric_id ?? ''}
                  onChange={e => setEdits({ ...edits, [s.id]: e.target.value })} /></td>
              </tr>
            ))}
            {!students.length && <tr><td colSpan={4} className="text-center py-6 text-gray-500">No students in this class.</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
