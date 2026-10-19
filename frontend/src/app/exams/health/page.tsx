'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';
import { ClassSelect, Flash, PageHead, useExamLookups, useFlash } from '../_shared';

const FIELDS = ['height_cm', 'weight_kg', 'vision_left', 'vision_right', 'dental', 'blood_group', 'notes'] as const;
type Field = typeof FIELDS[number];
type Row = { id: number; admission_no: string; full_name: string; roll_no: number | null } & Record<Field, string>;
const BLOOD = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export default function HealthPage() {
  const { classes } = useExamLookups();
  const { msg, flash } = useFlash();
  const [classId, setClassId] = useState('');
  const [term, setTerm] = useState('Term 1');
  const [terms, setTerms] = useState<string[]>(['Term 1', 'Term 2']);
  const [session, setSession] = useState('');
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    api<{ name: string }[]>('/masters/exam-types').then(t => { if (t.length) setTerms(['Term 1', 'Term 2', ...t.map(x => x.name)]); }).catch(() => {});
  }, []);

  async function load() {
    if (!classId || !term) return setRows([]);
    try {
      const d = await api<any[]>(`/exam/health?class_id=${classId}&term=${encodeURIComponent(term)}${session ? `&session=${encodeURIComponent(session)}` : ''}`);
      setRows(d.map(x => {
        const r: any = { id: x.id, admission_no: x.admission_no, full_name: x.full_name, roll_no: x.roll_no };
        for (const f of FIELDS) r[f] = x.health?.[f] == null ? '' : String(x.health[f]);
        return r as Row;
      }));
    } catch (e: any) { flash(e.message, false); }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [classId, term]);

  const set = (i: number, f: Field, v: string) => setRows(r => r.map((x, j) => (j === i ? { ...x, [f]: v } : x)));

  async function save() {
    try {
      await api('/exam/health', { method: 'PUT', body: JSON.stringify({ term, session: session || undefined, rows: rows.map(r => ({ student_id: r.id, ...Object.fromEntries(FIELDS.map(f => [f, r[f]])) })) }) });
      flash('Health details saved.');
    } catch (e: any) { flash(e.message, false); }
  }

  return (
    <Shell>
      <PageHead title="Update Health Status" subtitle="Height, weight, vision and dental check results. The latest entry prints on the report card." />
      <Flash msg={msg} />
      <div className="card p-4 mb-4 grid md:grid-cols-4 gap-3 text-sm">
        <div><label className="label">Class</label><ClassSelect classes={classes} value={classId} onChange={setClassId} /></div>
        <div><label className="label">Term</label>
          <select className="input" value={term} onChange={e => setTerm(e.target.value)}>{Array.from(new Set(terms)).map(t => <option key={t}>{t}</option>)}</select></div>
        <div><label className="label">Session</label><input className="input" placeholder="Current session" value={session} onChange={e => setSession(e.target.value)} /></div>
        <div className="flex items-end"><button className="btn bg-gray-200" onClick={load}>Load</button></div>
      </div>
      {classId && (
        <div className="card p-4 overflow-x-auto text-sm">
          <table className="table min-w-max">
            <thead><tr><th>Roll</th><th>Student</th><th>Height (cm)</th><th>Weight (kg)</th><th>Vision L</th><th>Vision R</th><th>Dental</th><th>Blood Group</th><th>Notes</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id}>
                  <td>{r.roll_no ?? '—'}</td><td>{r.full_name}</td>
                  <td><input className="input w-20" type="number" value={r.height_cm} onChange={e => set(i, 'height_cm', e.target.value)} /></td>
                  <td><input className="input w-20" type="number" value={r.weight_kg} onChange={e => set(i, 'weight_kg', e.target.value)} /></td>
                  <td><input className="input w-20" placeholder="6/6" value={r.vision_left} onChange={e => set(i, 'vision_left', e.target.value)} /></td>
                  <td><input className="input w-20" placeholder="6/6" value={r.vision_right} onChange={e => set(i, 'vision_right', e.target.value)} /></td>
                  <td><input className="input w-28" placeholder="Healthy" value={r.dental} onChange={e => set(i, 'dental', e.target.value)} /></td>
                  <td>
                    <select className="input w-24" value={r.blood_group} onChange={e => set(i, 'blood_group', e.target.value)}>
                      <option value="">—</option>{BLOOD.map(b => <option key={b}>{b}</option>)}
                    </select>
                  </td>
                  <td><input className="input w-40" value={r.notes} onChange={e => set(i, 'notes', e.target.value)} /></td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={9} className="text-center py-4 text-gray-500">No active students in this class.</td></tr>}
            </tbody>
          </table>
          {rows.length > 0 && <button className="btn btn-primary mt-4" onClick={save}>Save</button>}
        </div>
      )}
    </Shell>
  );
}
