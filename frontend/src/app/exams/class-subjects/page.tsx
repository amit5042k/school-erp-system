'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, getUser } from '@/lib/api';
import { ClassSelect, Flash, PageHead, useExamLookups, useFlash } from '../_shared';

type Row = { subject: string; max_marks: number | string; pass_marks: number | string | null; is_optional: boolean };
type Master = { name: string; subject_type?: string };

export default function ClassSubjectsPage() {
  const isAdmin = getUser<any>()?.role === 'admin';
  const { classes } = useExamLookups();
  const { msg, flash } = useFlash();
  const [classId, setClassId] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [masters, setMasters] = useState<Master[]>([]);
  const [copyFrom, setCopyFrom] = useState('');
  const [adding, setAdding] = useState('');

  useEffect(() => { api<Master[]>('/masters/subjects').then(setMasters).catch(() => {}); }, []);

  async function load(id = classId) {
    if (!id) return setRows([]);
    try {
      const data = await api<any[]>(`/exam/class-subjects?class_id=${id}`);
      setRows(data.map(d => ({ subject: d.subject, max_marks: d.max_marks, pass_marks: d.pass_marks ?? '', is_optional: !!d.is_optional })));
    } catch (e: any) { flash(e.message, false); }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [classId]);

  const set = (i: number, patch: Partial<Row>) => setRows(r => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: -1 | 1) => setRows(r => {
    const j = i + d; if (j < 0 || j >= r.length) return r;
    const n = [...r]; [n[i], n[j]] = [n[j], n[i]]; return n;
  });

  function add() {
    if (!adding || rows.some(r => r.subject === adding)) return;
    setRows(r => [...r, { subject: adding, max_marks: 100, pass_marks: 33, is_optional: false }]);
    setAdding('');
  }

  async function save() {
    try {
      await api(`/exam/class-subjects/${classId}`, { method: 'PUT', body: JSON.stringify({ subjects: rows }) });
      flash('Class subjects saved.');
      load();
    } catch (e: any) { flash(e.message, false); }
  }

  async function copy() {
    if (!copyFrom) return;
    if (!confirm('Replace this class\'s subjects with the other class\'s list?')) return;
    try {
      const r = await api<{ count: number }>('/exam/class-subjects/copy', { method: 'POST', body: JSON.stringify({ from_class_id: Number(copyFrom), to_class_id: Number(classId) }) });
      flash(`Copied ${r.count} subjects.`);
      load();
    } catch (e: any) { flash(e.message, false); }
  }

  const available = masters.filter(m => !rows.some(r => r.subject === m.name));

  return (
    <Shell>
      <PageHead title="Class Subjects" subtitle="Subjects studied in each class, their maximum and pass marks, and report card order." />
      <Flash msg={msg} />

      <div className="card p-4 mb-4 grid md:grid-cols-3 gap-3 text-sm">
        <div><label className="label">Class</label><ClassSelect classes={classes} value={classId} onChange={setClassId} /></div>
        {isAdmin && classId && (
          <div className="md:col-span-2 flex items-end gap-2">
            <div className="flex-1"><label className="label">Copy subjects from</label>
              <ClassSelect classes={classes.filter(c => String(c.id) !== classId)} value={copyFrom} onChange={setCopyFrom} /></div>
            <button className="btn bg-gray-200" onClick={copy} disabled={!copyFrom}>Copy</button>
          </div>
        )}
      </div>

      {classId && (
        <div className="card p-4 overflow-x-auto">
          <table className="table text-sm min-w-max">
            <thead><tr><th>Order</th><th>Subject</th><th>Max Marks</th><th>Pass Marks</th><th>Optional</th>{isAdmin && <th></th>}</tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.subject}>
                  <td className="whitespace-nowrap">
                    {isAdmin && <>
                      <button className="px-1 text-gray-500 disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">▲</button>
                      <button className="px-1 text-gray-500 disabled:opacity-30" disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label="Move down">▼</button>
                    </>}
                    <span className="ml-1 text-gray-400">{i + 1}</span>
                  </td>
                  <td>{r.subject}</td>
                  <td><input className="input w-24" type="number" disabled={!isAdmin} value={r.max_marks} onChange={e => set(i, { max_marks: e.target.value })} /></td>
                  <td><input className="input w-24" type="number" disabled={!isAdmin} value={r.pass_marks ?? ''} onChange={e => set(i, { pass_marks: e.target.value })} /></td>
                  <td><input type="checkbox" disabled={!isAdmin} checked={r.is_optional} onChange={e => set(i, { is_optional: e.target.checked })} /></td>
                  {isAdmin && <td><button className="text-xs text-red-600 hover:underline" onClick={() => setRows(x => x.filter((_, j) => j !== i))}>Remove</button></td>}
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={6} className="text-center py-4 text-gray-500">No subjects set for this class yet.</td></tr>}
            </tbody>
          </table>

          {isAdmin && (
            <div className="flex flex-wrap items-end gap-2 mt-4 text-sm">
              <div><label className="label">Add Subject</label>
                <select className="input" value={adding} onChange={e => setAdding(e.target.value)}>
                  <option value="">-- Select --</option>
                  {available.map(m => <option key={m.name} value={m.name}>{m.name}{m.subject_type ? ` (${m.subject_type})` : ''}</option>)}
                </select></div>
              <button className="btn bg-gray-200" onClick={add} disabled={!adding}>Add</button>
              <a href="/masters/subjects" className="text-xs text-brand-600 underline mb-2">Manage subject list</a>
              <div className="flex-1" />
              <button className="btn btn-primary" onClick={save}>Save Class Subjects</button>
            </div>
          )}
          <p className="text-xs text-gray-500 mt-3">Optional subjects appear only for students mapped to them in Student Subject Mapping.</p>
        </div>
      )}
    </Shell>
  );
}
