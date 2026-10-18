'use client';

import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { ClassSelect, FlashBox, classLabel, useClasses, useFlash, useStudents } from './common';

export default function SwapPanel() {
  const { classes, reload: reloadClasses } = useClasses();
  const { students, reload: reloadStudents } = useStudents();
  const { msg, flash } = useFlash();
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);

  const from = classes.find(c => String(c.id) === fromId);
  const to = classes.find(c => String(c.id) === toId);
  const inFrom = useMemo(() => students.filter(s => String(s.class_id) === fromId && (s.status || 'active') === 'active'), [students, fromId]);
  const count = (id?: number) => students.filter(s => s.class_id === id && (s.status || 'active') === 'active').length;
  const allPicked = inFrom.length > 0 && inFrom.every(s => picked.has(s.id));

  async function swap() {
    if (!to) return flash('Choose the section to move students into.', false);
    if (!picked.size) return flash('Select at least one student.', false);
    setBusy(true);
    try {
      const r = await api<{ moved: number }>('/academic/swap', { method: 'POST', body: JSON.stringify({ student_ids: [...picked], to_class_id: to.id }) });
      flash(`${r.moved} student(s) moved to ${classLabel(to)}. Their roll numbers were cleared; allot new ones in Roll No Allocation.`);
      setPicked(new Set());
      reloadStudents(); reloadClasses();
    } catch (e: any) { flash(e.message, false); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <FlashBox msg={msg} />
      <div className="card p-4 mb-4 grid md:grid-cols-4 gap-3 text-sm">
        <div><label className="label">From Section</label>
          <ClassSelect classes={classes} value={fromId} onChange={v => { setFromId(v); setToId(''); setPicked(new Set()); }} /></div>
        <div><label className="label">To Section</label>
          <ClassSelect classes={classes} value={toId} onChange={setToId} placeholder={from ? '-- Select Section --' : 'Choose "From" first'}
            filter={c => !!from && c.name === from.name && c.id !== from.id} /></div>
        <div className="flex items-end"><button className="btn btn-primary" onClick={swap} disabled={busy || !to || !picked.size}>
          {busy ? 'Moving…' : `Move ${picked.size} student(s)`}</button></div>
        {from && (
          <div className="md:col-span-4 text-gray-600">
            {classLabel(from)}: <b>{count(from.id)}</b> → <b>{count(from.id) - picked.size}</b>
            {to && <> · {classLabel(to)}: <b>{count(to.id)}</b> → <b>{count(to.id) + picked.size}</b></>}
          </div>
        )}
        {from && !classes.some(c => c.name === from.name && c.id !== from.id) && (
          <div className="md:col-span-4 text-amber-700 text-xs">{from.name} has only one section. Add another in Manage Section first.</div>
        )}
      </div>

      {from && (
        <div className="card p-4 overflow-x-auto">
          <table className="table text-sm">
            <thead><tr>
              <th><input type="checkbox" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(inFrom.map(s => s.id)))} /></th>
              <th>Roll</th><th>Adm No</th><th>Student</th><th>Gender</th>
            </tr></thead>
            <tbody>
              {inFrom.map(s => (
                <tr key={s.id} className="cursor-pointer" onClick={() => setPicked(p => { const n = new Set(p); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n; })}>
                  <td><input type="checkbox" readOnly checked={picked.has(s.id)} /></td>
                  <td>{s.roll_no ?? '—'}</td><td>{s.admission_no}</td><td>{s.full_name}</td><td>{s.gender || '—'}</td>
                </tr>
              ))}
              {!inFrom.length && <tr><td colSpan={5} className="text-center py-4 text-gray-500">No active students in this section.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
