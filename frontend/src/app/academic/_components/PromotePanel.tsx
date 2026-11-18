'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, fmtDateTime } from '@/lib/api';
import { ClassSelect, FlashBox, classLabel, useClasses, useFlash } from './common';

type Result = 'promoted' | 'detained' | 'passed_out';
type Row = { id: number; admission_no: string; full_name: string; roll_no: number | null; result: Result; to_class_id: number | null };
type Preview = { class: { id: number; name: string; section: string }; from_session: string; to_session: string; next_class_name: string | null; students: Row[] };
type Batch = {
  batch_id: string; promoted_at: string; undone_at: string | null; students: number; promoted: number; detained: number;
  passed_out: number; from_session: string; to_session: string; from_class: string | null; promoted_by_name: string | null;
};

const RESULT_LABEL: Record<Result, string> = { promoted: 'Promote', detained: 'Detain', passed_out: 'Passed Out' };

export default function PromotePanel() {
  const { classes } = useClasses();
  const { msg, flash } = useFlash();
  const [classId, setClassId] = useState('');
  const [pv, setPv] = useState<Preview | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [toSession, setToSession] = useState('');
  const [bulkTarget, setBulkTarget] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [batches, setBatches] = useState<Batch[]>([]);

  const loadBatches = () => api<Batch[]>('/academic/promotions').then(setBatches).catch(() => {});
  useEffect(() => { loadBatches(); }, []);

  async function loadPreview(id: string) {
    setClassId(id); setPv(null); setRows([]); setReviewing(false);
    if (!id) return;
    try {
      const p = await api<Preview>(`/academic/promote/preview?class_id=${id}`);
      setPv(p); setRows(p.students); setToSession(p.to_session);
      setPicked(new Set(p.students.map(s => s.id)));
    } catch (e: any) { flash(e.message, false); }
  }

  const patch = (id: number, p: Partial<Row>) => setRows(r => r.map(x => (x.id === id ? { ...x, ...p } : x)));
  const selected = useMemo(() => rows.filter(r => picked.has(r.id)), [rows, picked]);
  const counts = useMemo(() => ({
    promoted: selected.filter(r => r.result === 'promoted').length,
    detained: selected.filter(r => r.result === 'detained').length,
    passed_out: selected.filter(r => r.result === 'passed_out').length,
  }), [selected]);
  const missingTarget = selected.filter(r => r.result === 'promoted' && !r.to_class_id);
  const allPicked = rows.length > 0 && rows.every(r => picked.has(r.id));

  function applyBulk() {
    if (!bulkTarget) return;
    const id = Number(bulkTarget);
    setRows(r => r.map(x => (picked.has(x.id) ? { ...x, result: 'promoted', to_class_id: id } : x)));
  }

  function review() {
    if (!selected.length) return flash('Select at least one student.', false);
    if (!/^\d{4}-\d{2,4}$/.test(toSession)) return flash('Enter the new session, e.g. 2026-27.', false);
    if (missingTarget.length) return flash(`Choose a target class for ${missingTarget.map(r => r.full_name).join(', ')}.`, false);
    setReviewing(true);
  }

  async function commit() {
    setBusy(true);
    try {
      const r = await api<{ promoted: number; detained: number; passed_out: number }>('/academic/promote', {
        method: 'POST',
        body: JSON.stringify({
          from_session: pv?.from_session, to_session: toSession,
          items: selected.map(s => ({ student_id: s.id, result: s.result, to_class_id: s.to_class_id })),
        }),
      });
      flash(`Done: ${r.promoted} promoted, ${r.detained} detained, ${r.passed_out} passed out.${r.promoted ? ' Promoted students have new roll numbers in their new class (in name order); change them on Roll Numbers if needed. Admission numbers stay the same.' : ''}`);
      setReviewing(false);
      loadBatches();
      loadPreview(classId);
    } catch (e: any) { flash(e.message, false); }
    finally { setBusy(false); }
  }

  async function undo(b: Batch) {
    if (!confirm(`Undo the promotion of ${b.students} student(s) from ${b.from_class || 'this class'}? They go back to their previous class and session.`)) return;
    try {
      const r = await api<{ restored: number }>('/academic/promote/undo', { method: 'POST', body: JSON.stringify({ batch_id: b.batch_id }) });
      flash(`Undone: ${r.restored} student(s) restored.`);
      loadBatches();
      if (classId) loadPreview(classId);
    } catch (e: any) { flash(e.message, false); }
  }

  const lastActive = batches.find(b => !b.undone_at);

  return (
    <div>
      <FlashBox msg={msg} />
      <div className="card p-4 mb-4 grid md:grid-cols-4 gap-3 text-sm">
        <div><label className="label">From Class</label><ClassSelect classes={classes} value={classId} onChange={loadPreview} /></div>
        <div><label className="label">Current Session</label><input className="input" readOnly value={pv?.from_session || ''} /></div>
        <div><label className="label">Promote Into Session *</label><input className="input" value={toSession} onChange={e => setToSession(e.target.value)} placeholder="2026-27" /></div>
        {pv && (
          <div className="text-xs text-gray-500 flex items-end">
            {pv.next_class_name === null ? 'This is the final class: students default to Passed Out.'
              : pv.next_class_name ? `Next class: ${pv.next_class_name}` : 'Could not work out the next class from the name; choose a target.'}
          </div>
        )}
      </div>

      {pv && !reviewing && (
        <div className="card p-4 mb-4">
          <div className="flex flex-wrap items-end gap-2 mb-3 text-sm">
            <div className="min-w-[12rem]"><label className="label">Set target class for selected</label>
              <ClassSelect classes={classes} value={bulkTarget} onChange={setBulkTarget} filter={c => c.id !== pv.class.id} />
            </div>
            <button className="btn bg-gray-200" onClick={applyBulk} disabled={!bulkTarget}>Apply</button>
            <div className="flex-1" />
            <span className="text-gray-600">{selected.length} of {rows.length} selected</span>
            <button className="btn btn-primary" onClick={review} disabled={!rows.length}>Review Promotion</button>
          </div>
          <div className="overflow-x-auto">
            <table className="table text-sm">
              <thead><tr>
                <th><input type="checkbox" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(rows.map(r => r.id)))} /></th>
                <th>Roll</th><th>Adm No</th><th>Student</th><th>Result</th><th>Target Class</th>
              </tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className={picked.has(r.id) ? '' : 'opacity-50'}>
                    <td><input type="checkbox" checked={picked.has(r.id)} onChange={() => setPicked(s => { const n = new Set(s); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })} /></td>
                    <td>{r.roll_no ?? '—'}</td><td>{r.admission_no}</td><td>{r.full_name}</td>
                    <td>
                      <select className="input" value={r.result} onChange={e => patch(r.id, { result: e.target.value as Result })}>
                        {(Object.keys(RESULT_LABEL) as Result[]).map(k => <option key={k} value={k}>{RESULT_LABEL[k]}</option>)}
                      </select>
                    </td>
                    <td>
                      {r.result === 'promoted' ? (
                        <ClassSelect classes={classes} value={r.to_class_id ? String(r.to_class_id) : ''}
                          onChange={v => patch(r.id, { to_class_id: v ? Number(v) : null })} filter={c => c.id !== pv.class.id} />
                      ) : <span className="text-gray-500">{r.result === 'detained' ? `Stays in ${classLabel(pv.class)}` : 'Leaves school'}</span>}
                    </td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={6} className="text-center py-4 text-gray-500">No active students in this class.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {pv && reviewing && (
        <div className="card p-4 mb-4 text-sm">
          <h3 className="font-semibold text-brand-700 mb-2">Review: {classLabel(pv.class)} → session {toSession}</h3>
          <p className="mb-3"><b>{counts.promoted}</b> promoted · <b>{counts.detained}</b> detained · <b>{counts.passed_out}</b> passed out</p>
          <ul className="mb-4 max-h-64 overflow-y-auto divide-y border rounded">
            {selected.map(s => (
              <li key={s.id} className="px-3 py-1.5 flex justify-between">
                <span>{s.full_name} <span className="text-gray-500">({s.admission_no})</span></span>
                <span>{s.result === 'promoted' ? `→ ${classLabel(classes.find(c => c.id === s.to_class_id))}` : RESULT_LABEL[s.result]}</span>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={commit} disabled={busy}>{busy ? 'Saving…' : 'Confirm Promotion'}</button>
            <button className="btn bg-gray-200" onClick={() => setReviewing(false)}>Back</button>
          </div>
          <p className="text-xs text-gray-500 mt-2">You can undo this afterwards from the history below, as long as it is the latest promotion.</p>
        </div>
      )}

      <div className="card p-4 overflow-x-auto">
        <h3 className="font-semibold text-brand-700 mb-2">Promotion History</h3>
        <table className="table text-sm">
          <thead><tr><th>Date</th><th>From Class</th><th>Session</th><th>Students</th><th>Promoted / Detained / Passed Out</th><th>By</th><th></th></tr></thead>
          <tbody>
            {batches.map(b => (
              <tr key={b.batch_id} className={b.undone_at ? 'opacity-60' : ''}>
                <td className="whitespace-nowrap">{fmtDateTime(b.promoted_at)}</td>
                <td>{b.from_class || '—'}</td>
                <td className="whitespace-nowrap">{b.from_session || '—'} → {b.to_session}</td>
                <td>{b.students}</td>
                <td>{b.promoted} / {b.detained} / {b.passed_out}</td>
                <td>{b.promoted_by_name || '—'}</td>
                <td>
                  {b.undone_at ? <span className="badge badge-gray">Undone</span>
                    : b === lastActive ? <button className="text-xs text-red-600 hover:underline" onClick={() => undo(b)}>Undo</button>
                    : <span className="badge badge-green">Applied</span>}
                </td>
              </tr>
            ))}
            {!batches.length && <tr><td colSpan={7} className="text-center py-4 text-gray-500">No promotions yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
