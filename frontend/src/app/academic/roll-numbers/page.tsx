'use client';

import { useEffect, useMemo, useState } from 'react';
import Shell from '@/components/Shell';
import { api, downloadCsv } from '@/lib/api';
import { ClassSelect, FlashBox, PageTitle, classLabel, useClasses, useFlash, useStudents, type Student } from '../_components/common';

type Mode = 'name' | 'admission' | 'gender';
const MODES: { key: Mode; label: string }[] = [
  { key: 'name', label: 'By name (A–Z)' },
  { key: 'admission', label: 'By admission no' },
  { key: 'gender', label: 'Girls first, then boys (by name)' },
];

const byName = (a: Student, b: Student) => a.full_name.localeCompare(b.full_name, 'en', { sensitivity: 'base' });
const byAdm = (a: Student, b: Student) => a.admission_no.localeCompare(b.admission_no, 'en', { numeric: true });
const girl = (s: Student) => /^f/i.test(s.gender || '');

export default function RollNumbersPage() {
  const { classes } = useClasses();
  const { students, reload } = useStudents();
  const { msg, flash } = useFlash();
  const [classId, setClassId] = useState('');
  const [mode, setMode] = useState<Mode>('name');
  const [start, setStart] = useState(1);
  const [rolls, setRolls] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState<number[]>([]);

  const inClass = useMemo(() => students.filter(s => String(s.class_id) === classId && (s.status || 'active') === 'active'), [students, classId]);
  useEffect(() => {
    setRolls(Object.fromEntries(inClass.map(s => [s.id, s.roll_no == null ? '' : String(s.roll_no)])));
    setOrder([...inClass].sort((a, b) => (a.roll_no ?? Infinity) - (b.roll_no ?? Infinity) || byName(a, b)).map(s => s.id));
  }, [inClass]);

  // Order only changes on load or auto-allocate, so rows don't jump while a number is being typed.
  const ordered = useMemo(() => order.map(id => inClass.find(s => s.id === id)).filter((s): s is Student => !!s), [order, inClass]);

  const dupes = useMemo(() => {
    const seen = new Map<string, number>();
    for (const v of Object.values(rolls)) if (v) seen.set(v, (seen.get(v) || 0) + 1);
    return new Set([...seen].filter(([, n]) => n > 1).map(([v]) => v));
  }, [rolls]);
  const changed = inClass.some(s => (s.roll_no == null ? '' : String(s.roll_no)) !== (rolls[s.id] ?? ''));

  function auto() {
    const list = [...inClass].sort(mode === 'admission' ? byAdm : mode === 'gender'
      ? (a, b) => Number(girl(b)) - Number(girl(a)) || byName(a, b) : byName);
    setRolls(Object.fromEntries(list.map((s, i) => [s.id, String(start + i)])));
    setOrder(list.map(s => s.id));
  }

  async function save() {
    if (dupes.size) return flash(`Roll number(s) ${[...dupes].join(', ')} are used more than once.`, false);
    setBusy(true);
    try {
      await api('/academic/roll-numbers', { method: 'POST', body: JSON.stringify({
        class_id: Number(classId), items: inClass.map(s => ({ student_id: s.id, roll_no: rolls[s.id] ?? '' })),
      }) });
      flash('Roll numbers saved.');
      reload();
    } catch (e: any) { flash(e.message, false); }
    finally { setBusy(false); }
  }

  const cls = classes.find(c => String(c.id) === classId);

  return (
    <Shell>
      <PageTitle crumb="Examination › Roll No Allocation" title="Roll No Allocation" subtitle="Assign roll numbers class-wise" />
      <FlashBox msg={msg} />
      <div className="card p-4 mb-4 grid md:grid-cols-5 gap-3 text-sm no-print">
        <div><label className="label">Class</label><ClassSelect classes={classes} value={classId} onChange={setClassId} /></div>
        <div><label className="label">Allocation Order</label>
          <select className="input" value={mode} onChange={e => setMode(e.target.value as Mode)}>
            {MODES.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select></div>
        <div><label className="label">Start From</label><input className="input" type="number" min={1} value={start} onChange={e => setStart(Math.max(1, Number(e.target.value) || 1))} /></div>
        <div className="flex items-end gap-2">
          <button className="btn bg-gray-200" onClick={auto} disabled={!inClass.length}>Auto Allocate</button>
          <button className="btn btn-primary" onClick={save} disabled={busy || !changed}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
        <div className="flex items-end gap-2">
          <button className="btn bg-gray-200" disabled={!inClass.length} onClick={() => window.print()}>Print</button>
          <button className="btn btn-accent" disabled={!inClass.length} onClick={() => downloadCsv(`roll-numbers-${classLabel(cls)}`,
            [{ key: 'roll', label: 'Roll No' }, { key: 'admission_no', label: 'Adm No' }, { key: 'full_name', label: 'Name' }, { key: 'gender', label: 'Gender' }],
            ordered.map(s => ({ ...s, roll: rolls[s.id] })))}>Excel</button>
        </div>
      </div>

      {classId && (
        <div className="card p-4 overflow-x-auto">
          <h3 className="font-semibold text-brand-700 mb-2">{classLabel(cls)} — {inClass.length} students</h3>
          <table className="table text-sm">
            <thead><tr><th className="w-28">Roll No</th><th>Adm No</th><th>Student</th><th>Gender</th><th>Father</th></tr></thead>
            <tbody>
              {ordered.map(s => (
                <tr key={s.id}>
                  <td>
                    <input className={`input w-20 no-print ${dupes.has(rolls[s.id]) ? 'border-red-500 bg-red-50' : ''}`} type="number" min={1}
                      value={rolls[s.id] ?? ''} onChange={e => setRolls(r => ({ ...r, [s.id]: e.target.value }))} />
                    <span className="print-only">{rolls[s.id]}</span>
                  </td>
                  <td>{s.admission_no}</td><td>{s.full_name}</td><td>{s.gender || '—'}</td><td>{s.father_name || '—'}</td>
                </tr>
              ))}
              {!inClass.length && <tr><td colSpan={5} className="text-center py-4 text-gray-500">No active students in this class.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
