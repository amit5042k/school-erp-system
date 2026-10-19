'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, fmtDate, fmtMoney, localDate } from '@/lib/api';
import { Flash, PageTitle, useFlash } from '../_ui';

export default function ReconciliationPage() {
  const monthStart = localDate().slice(0, 8) + '01';
  const [f, setF] = useState({ from: monthStart, to: localDate(), mode: '', state: 'unreconciled' });
  const [rows, setRows] = useState<any[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bank, setBank] = useState({ bank_date: localDate(), bank_ref: '' });
  const { msg, flash } = useFlash();

  async function load() {
    try {
      const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
      setRows(await api<any[]>(`/finance/reconciliation?${qs}`)); setPicked(new Set());
    } catch (e: any) { flash(e.message, false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const toggle = (no: string) => setPicked(s => { const n = new Set(s); n.has(no) ? n.delete(no) : n.add(no); return n; });
  const selectable = rows.filter(r => f.state === 'reconciled' ? r.reconciled_on : !r.reconciled_on && r.cheque_status !== 'pending');
  const total = rows.filter(r => picked.has(r.receipt_no)).reduce((a, r) => a + r.total, 0);

  async function act(undo: boolean) {
    if (!picked.size) return flash('Select at least one receipt.', false);
    try {
      const body = undo ? { receipts: [...picked] } : { receipts: [...picked], ...bank };
      const r = await api<any>(`/finance/reconciliation${undo ? '/undo' : ''}`, { method: 'POST', body: JSON.stringify(body) });
      flash(undo ? `Undone for ${r.undone} receipt(s).` : `Reconciled ${r.reconciled} receipt(s).`); load();
    } catch (e: any) { flash(e.message, false); }
  }

  return (
    <Shell>
      <PageTitle crumb="Reconciliation" title="Reconciliation" sub="Match collected receipts against the bank statement." />
      <form className="card p-4 grid md:grid-cols-5 gap-3 text-sm" onSubmit={e => { e.preventDefault(); load(); }}>
        <div><label className="label">Received From</label><input className="input" type="date" value={f.from} onChange={e => setF({ ...f, from: e.target.value })} /></div>
        <div><label className="label">To</label><input className="input" type="date" value={f.to} onChange={e => setF({ ...f, to: e.target.value })} /></div>
        <div><label className="label">Mode</label>
          <select className="input" value={f.mode} onChange={e => setF({ ...f, mode: e.target.value })}>
            <option value="">All</option><option value="cash">Cash</option><option value="cheque">Cheque</option><option value="online">Online</option><option value="card">Card</option>
          </select></div>
        <div><label className="label">Show</label>
          <select className="input" value={f.state} onChange={e => setF({ ...f, state: e.target.value })}>
            <option value="unreconciled">Not reconciled</option><option value="reconciled">Reconciled</option><option value="">All</option>
          </select></div>
        <div className="flex items-end gap-2"><button className="btn btn-primary">Search</button>
          <Link className="btn bg-gray-200" href="/report/fee-reconciliation">Report</Link></div>
      </form>
      <Flash msg={msg} />

      <div className="card p-4 mt-4 grid md:grid-cols-4 gap-3 text-sm items-end">
        <div><label className="label">Bank Statement Date</label><input className="input" type="date" value={bank.bank_date} onChange={e => setBank({ ...bank, bank_date: e.target.value })} /></div>
        <div><label className="label">Bank Reference / UTR</label><input className="input" value={bank.bank_ref} onChange={e => setBank({ ...bank, bank_ref: e.target.value })} /></div>
        <div className="text-gray-600">{picked.size} selected · {fmtMoney(total)}</div>
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={() => act(false)}>Mark Reconciled</button>
          <button className="btn bg-gray-200" onClick={() => act(true)}>Undo</button>
        </div>
      </div>

      <div className="card p-4 mt-4 overflow-x-auto">
        <table className="table text-sm">
          <thead><tr>
            <th><input type="checkbox" checked={!!selectable.length && selectable.every(r => picked.has(r.receipt_no))}
              onChange={e => setPicked(e.target.checked ? new Set(selectable.map(r => r.receipt_no)) : new Set())} /></th>
            <th>Receipt</th><th>Received</th><th>Student</th><th>Mode</th><th>Cheque</th><th className="text-right">Amount</th><th>Bank Date</th><th>Bank Ref</th>
          </tr></thead>
          <tbody>
            {rows.map(r => {
              const locked = r.cheque_status === 'pending';
              return (
                <tr key={r.receipt_no} className={locked ? 'opacity-60' : ''}>
                  <td><input type="checkbox" disabled={locked} checked={picked.has(r.receipt_no)} onChange={() => toggle(r.receipt_no)}
                    title={locked ? 'Cheque not cleared yet' : ''} /></td>
                  <td><Link className="text-brand-600 underline" href={`/finance/receipt/${encodeURIComponent(r.receipt_no)}`}>{r.receipt_no}</Link></td>
                  <td>{fmtDate(r.paid_on)}</td><td>{r.student_name} <span className="text-xs text-gray-500">({r.admission_no})</span></td>
                  <td className="capitalize">{r.mode}</td><td>{r.cheque_no ? `#${r.cheque_no} (${r.cheque_status})` : '—'}</td>
                  <td className="text-right">{fmtMoney(r.total)}</td>
                  <td>{r.reconciled_on ? fmtDate(r.reconciled_on) : '—'}</td><td>{r.bank_ref || '—'}</td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={9} className="text-center py-4 text-gray-500">No receipts for these filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
