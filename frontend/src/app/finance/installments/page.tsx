'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Shell from '@/components/Shell';
import { api, fmtDate, fmtMoney } from '@/lib/api';
import { Flash, PageTitle, StudentPicker, useClassesAndStudents, useFlash } from '../_ui';

type Inst = { id: number; session: string; name: string; due_date: string; sort_order: number; fee_count: number };
type Head = { id: number; name: string; is_transport?: string };
type Tab = 'installments' | 'structure' | 'generate';

export default function InstallmentsPage({ searchParams }: { searchParams: { tab?: string } }) {
  const [tab, setTab] = useState<Tab>((['installments', 'structure', 'generate'].includes(searchParams.tab || '') ? searchParams.tab : 'installments') as Tab);
  const [session, setSession] = useState('');
  const [insts, setInsts] = useState<Inst[]>([]);
  const [heads, setHeads] = useState<Head[]>([]);
  const { classes } = useClassesAndStudents();
  const { msg, flash } = useFlash();

  useEffect(() => {
    api<any>('/settings').then(s => setSession(s.academic_year || '')).catch(() => {});
    api<Head[]>('/masters/fee-heads').then(setHeads).catch(() => {});
  }, []);
  const loadInsts = () => session && api<Inst[]>(`/finance/installments?session=${encodeURIComponent(session)}`).then(setInsts).catch(e => flash(e.message, false));
  useEffect(() => { loadInsts(); /* eslint-disable-next-line */ }, [session]);

  return (
    <Shell>
      <PageTitle crumb="Installment Settings" title="Installment Settings"
        sub="1. Define installments with due dates → 2. Set each class's fee per head and installment → 3. Generate fee demands for students." />
      <div className="flex flex-wrap items-end gap-3 mb-3">
        <div><label className="label">Session</label><input className="input w-32" value={session} onChange={e => setSession(e.target.value)} /></div>
        <div className="flex gap-2 border-b flex-1">
          {([['installments', '1. Installments'], ['structure', '2. Fee Structure'], ['generate', '3. Generate Fee Demands']] as [Tab, string][]).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`px-3 py-2 text-sm rounded-t border-b-2 -mb-px ${tab === k ? 'border-brand-600 text-brand-700 font-semibold bg-brand-50' : 'border-transparent text-gray-600 hover:text-brand-600'}`}>{l}</button>
          ))}
        </div>
        <Link className="text-xs text-brand-600 underline" href="/masters/fee-heads">Fee Categories</Link>
      </div>
      <Flash msg={msg} />
      {tab === 'installments' && <Installments session={session} insts={insts} reload={loadInsts} flash={flash} />}
      {tab === 'structure' && <Structure session={session} insts={insts} heads={heads} classes={classes} flash={flash} />}
      {tab === 'generate' && <Generate session={session} insts={insts} classes={classes} flash={flash} />}
    </Shell>
  );
}

type Flasher = (t: string, ok?: boolean) => void;

function Installments({ session, insts, reload, flash }: { session: string; insts: Inst[]; reload: () => void; flash: Flasher }) {
  const [draft, setDraft] = useState({ name: '', due_date: '' });
  const [edit, setEdit] = useState<Record<number, Inst>>({});
  async function add(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api('/finance/installments', { method: 'POST', body: JSON.stringify({ ...draft, session, sort_order: insts.length + 1 }) });
      setDraft({ name: '', due_date: '' }); flash('Installment added.'); reload();
    } catch (e: any) { flash(e.message, false); }
  }
  async function save(i: Inst) {
    try { await api(`/finance/installments/${i.id}`, { method: 'PUT', body: JSON.stringify(i) }); setEdit(x => { const n = { ...x }; delete n[i.id]; return n; }); flash('Saved. Unpaid fees of this installment now use the new due date.'); reload(); }
    catch (e: any) { flash(e.message, false); }
  }
  async function remove(i: Inst) {
    if (!confirm(`Delete ${i.name}? Its fee structure amounts are removed too.`)) return;
    try { await api(`/finance/installments/${i.id}`, { method: 'DELETE' }); reload(); } catch (e: any) { flash(e.message, false); }
  }
  return (
    <div className="card p-4 text-sm">
      <form onSubmit={add} className="grid md:grid-cols-4 gap-3 mb-4">
        <div><label className="label">Installment Name *</label><input className="input" required placeholder="e.g. Quarter 1 / April" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></div>
        <div><label className="label">Due Date *</label><input className="input" type="date" required value={draft.due_date} onChange={e => setDraft({ ...draft, due_date: e.target.value })} /></div>
        <div className="flex items-end"><button className="btn btn-primary">Add Installment</button></div>
      </form>
      <table className="table">
        <thead><tr><th>Order</th><th>Installment</th><th>Due Date</th><th>Fees Generated</th><th></th></tr></thead>
        <tbody>
          {insts.map(i => {
            const ed = edit[i.id];
            return (
              <tr key={i.id}>
                <td>{ed ? <input className="input w-16" type="number" value={ed.sort_order} onChange={e => setEdit(x => ({ ...x, [i.id]: { ...ed, sort_order: Number(e.target.value) } }))} /> : i.sort_order}</td>
                <td>{ed ? <input className="input" value={ed.name} onChange={e => setEdit(x => ({ ...x, [i.id]: { ...ed, name: e.target.value } }))} /> : i.name}</td>
                <td>{ed ? <input className="input" type="date" value={ed.due_date} onChange={e => setEdit(x => ({ ...x, [i.id]: { ...ed, due_date: e.target.value } }))} /> : fmtDate(i.due_date)}</td>
                <td>{i.fee_count}</td>
                <td className="whitespace-nowrap text-xs">
                  {ed ? <><button className="btn btn-primary text-xs py-1 mr-1" onClick={() => save(ed)}>Save</button>
                    <button className="text-gray-500 hover:underline" onClick={() => setEdit(x => { const n = { ...x }; delete n[i.id]; return n; })}>Cancel</button></>
                    : <><button className="text-brand-600 hover:underline mr-2" onClick={() => setEdit(x => ({ ...x, [i.id]: i }))}>Edit</button>
                      <button className="text-red-600 hover:underline disabled:opacity-40" disabled={i.fee_count > 0} title={i.fee_count ? 'Fees already generated' : ''} onClick={() => remove(i)}>Delete</button></>}
                </td>
              </tr>
            );
          })}
          {!insts.length && <tr><td colSpan={5} className="text-center py-4 text-gray-500">No installments for {session || 'this session'} yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function Structure({ session, insts, heads, classes, flash }: { session: string; insts: Inst[]; heads: Head[]; classes: { id: number; name: string; section: string }[]; flash: Flasher }) {
  const [classId, setClassId] = useState('');
  const [grid, setGrid] = useState<Record<string, string>>({});
  const [copyTo, setCopyTo] = useState<Set<number>>(new Set());
  const key = (h: string, i: number) => `${h}|${i}`;

  async function load() {
    if (!classId) return;
    try {
      const rows = await api<any[]>(`/finance/structure?class_id=${classId}&session=${encodeURIComponent(session)}`);
      setGrid(Object.fromEntries(rows.map(r => [key(r.head, r.installment_id), String(r.amount)])));
    } catch (e: any) { flash(e.message, false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [classId, session]);

  const totals = useMemo(() => {
    const byInst: Record<number, number> = {};
    for (const i of insts) byInst[i.id] = heads.reduce((a, h) => a + (Number(grid[key(h.name, i.id)]) || 0), 0);
    return byInst;
  }, [grid, insts, heads]);

  async function save() {
    const rows = heads.flatMap(h => insts.map(i => ({ head: h.name, installment_id: i.id, amount: grid[key(h.name, i.id)] ?? '' })));
    try { await api('/finance/structure', { method: 'PUT', body: JSON.stringify({ session, class_id: Number(classId), rows }) }); flash('Fee structure saved.'); load(); }
    catch (e: any) { flash(e.message, false); }
  }
  async function copy() {
    if (!copyTo.size) return flash('Tick the classes to copy to.', false);
    if (!confirm(`Replace the fee structure of ${copyTo.size} class(es) with this one?`)) return;
    try { await api('/finance/structure/copy', { method: 'POST', body: JSON.stringify({ session, from_class_id: Number(classId), to_class_ids: [...copyTo] }) }); flash('Copied.'); setCopyTo(new Set()); }
    catch (e: any) { flash(e.message, false); }
  }

  if (!insts.length) return <div className="card p-4 text-sm text-gray-600">Add installments first (tab 1).</div>;
  return (
    <div className="card p-4 text-sm overflow-x-auto">
      <div className="flex flex-wrap gap-3 items-end mb-3">
        <div><label className="label">Class</label>
          <select className="input" value={classId} onChange={e => setClassId(e.target.value)}>
            <option value="">-- Select --</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name} {c.section}</option>)}
          </select></div>
        {classId && <button className="btn btn-primary" onClick={save}>Save Fee Structure</button>}
      </div>
      {classId && (
        <>
          <table className="table">
            <thead><tr><th>Fee Head</th>{insts.map(i => <th key={i.id}>{i.name}<div className="text-[10px] font-normal opacity-80">{fmtDate(i.due_date)}</div></th>)}</tr></thead>
            <tbody>
              {heads.map(h => (
                <tr key={h.id}>
                  <td>{h.name}{h.is_transport === 'Yes' && <div className="text-[10px] text-gray-500">0 = each student&apos;s route fare</div>}</td>
                  {insts.map(i => (
                    <td key={i.id}><input className="input w-28" type="number" min={0} step="0.01" value={grid[key(h.name, i.id)] ?? ''}
                      onChange={e => setGrid(g => ({ ...g, [key(h.name, i.id)]: e.target.value }))} /></td>
                  ))}
                </tr>
              ))}
              <tr className="font-semibold bg-brand-50"><td>Total</td>{insts.map(i => <td key={i.id}>{fmtMoney(totals[i.id])}</td>)}</tr>
            </tbody>
          </table>
          <div className="mt-4 border-t pt-3">
            <div className="font-semibold mb-1">Copy this structure to other classes</div>
            <div className="flex flex-wrap gap-3">
              {classes.filter(c => String(c.id) !== classId).map(c => (
                <label key={c.id} className="flex items-center gap-1"><input type="checkbox" checked={copyTo.has(c.id)}
                  onChange={() => setCopyTo(s => { const n = new Set(s); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })} />{c.name} {c.section}</label>
              ))}
            </div>
            <button className="btn bg-gray-200 mt-2" onClick={copy}>Copy</button>
          </div>
        </>
      )}
    </div>
  );
}

function Generate({ session, insts, classes, flash }: { session: string; insts: Inst[]; classes: { id: number; name: string; section: string }[]; flash: Flasher }) {
  const [scope, setScope] = useState<'class' | 'student'>('class');
  const [classId, setClassId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [instId, setInstId] = useState('');
  const [preview, setPreview] = useState<any>(null);

  const body = (dry: boolean) => JSON.stringify({ session, dry_run: dry, installment_id: instId ? Number(instId) : null,
    ...(scope === 'class' ? { class_id: Number(classId) } : { student_id: Number(studentId) }) });

  async function run(dry: boolean) {
    if (scope === 'class' ? !classId : !studentId) return flash(`Choose a ${scope}.`, false);
    try {
      const r = await api<any>('/finance/generate', { method: 'POST', body: body(dry) });
      if (dry) setPreview(r);
      else { setPreview(null); flash(`Created ${r.created} fee demand(s) totalling ${fmtMoney(r.total_amount)} for ${r.students} student(s); ${r.discounts_applied} discount(s) applied.`); }
    } catch (e: any) { flash(e.message, false); }
  }

  return (
    <div className="card p-4 text-sm">
      <div className="grid md:grid-cols-4 gap-3">
        <div><label className="label">Generate For</label>
          <select className="input" value={scope} onChange={e => { setScope(e.target.value as any); setPreview(null); }}>
            <option value="class">Whole class (active students)</option><option value="student">One student</option>
          </select></div>
        {scope === 'class' ? (
          <div><label className="label">Class</label>
            <select className="input" value={classId} onChange={e => { setClassId(e.target.value); setPreview(null); }}>
              <option value="">-- Select --</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name} {c.section}</option>)}
            </select></div>
        ) : <StudentPicker value={studentId} onChange={v => { setStudentId(v); setPreview(null); }} />}
        <div><label className="label">Installment</label>
          <select className="input" value={instId} onChange={e => { setInstId(e.target.value); setPreview(null); }}>
            <option value="">All installments</option>
            {insts.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select></div>
      </div>
      <div className="flex gap-2 mt-4">
        <button className="btn bg-gray-200" onClick={() => run(true)}>Preview</button>
        <button className="btn btn-primary" onClick={() => run(false)} disabled={!preview || !preview.created}>Generate Fees</button>
      </div>
      {preview && (
        <div className="mt-3 p-3 bg-brand-50 rounded">
          Will create <b>{preview.created}</b> fee demand(s) for {preview.students} student(s), totalling <b>{fmtMoney(preview.total_amount)}</b> before discounts.
          {preview.already_existed > 0 && <> {preview.already_existed} already exist and will be skipped.</>}
          {preview.skipped_no_transport > 0 && <> {preview.skipped_no_transport} transport fee(s) skipped (student has no route).</>}
        </div>
      )}
      <p className="text-xs text-gray-500 mt-3">Generating is safe to repeat: fees that already exist for a student, head and installment are never duplicated. Assigned discounts are applied automatically.</p>
    </div>
  );
}
