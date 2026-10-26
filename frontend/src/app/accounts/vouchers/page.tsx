'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, downloadCsv, fmtDate, localDate } from '@/lib/api';
import { Flash, PageTitle, VTYPES, inr, useFlash, useLedgers, vtypeLabel } from '../_ui';

type Row = { id: number; vtype: string; voucher_no: string; date: string; narration: string | null; reference: string | null; status: string; source_type: string | null; amount: number; ledgers: string };

export default function VoucherList() {
  const fyStart = (() => { const t = localDate(); const y = Number(t.slice(0, 4)), m = Number(t.slice(5, 7)); return `${m >= 4 ? y : y - 1}-04-01`; })();
  const [f, setF] = useState({ from: fyStart, to: localDate(), vtype: '', status: 'active', source: '', ledger_id: '', q: '' });
  const [rows, setRows] = useState<Row[]>([]);
  const { ledgers } = useLedgers(true);
  const { msg, flash } = useFlash();

  async function load(filters = f) {
    try {
      const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
      setRows(await api<Row[]>(`/accounts/vouchers?${qs}`));
    } catch (e: any) { flash(e.message, false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  const set = (k: keyof typeof f, v: string) => setF(x => ({ ...x, [k]: v }));
  const total = rows.filter(r => r.status === 'active').reduce((a, r) => a + (r.amount || 0), 0);

  return (
    <Shell>
      <PageTitle crumb="Voucher List" title="Vouchers" sub="Search, view, print, edit or cancel vouchers."
        right={<div className="flex gap-2"><Link href="/accounts/voucher?type=payment" className="btn btn-primary text-sm">+ New Voucher</Link>
          <button className="btn btn-accent text-sm" onClick={() => downloadCsv(`vouchers-${f.from}-${f.to}`, [
            { key: 'date', label: 'Date' }, { key: 'voucher_no', label: 'Voucher No' }, { key: 'vtype', label: 'Type' }, { key: 'ledgers', label: 'Ledgers' },
            { key: 'narration', label: 'Narration' }, { key: 'reference', label: 'Reference' }, { key: 'amount', label: 'Amount' }, { key: 'status', label: 'Status' }], rows)}>Download Excel</button></div>} />
      <Flash msg={msg} />
      <form className="card p-4 grid md:grid-cols-4 lg:grid-cols-8 gap-3 text-sm mb-4" onSubmit={e => { e.preventDefault(); load(); }}>
        <div><label className="label">From</label><input className="input" type="date" value={f.from} onChange={e => set('from', e.target.value)} /></div>
        <div><label className="label">To</label><input className="input" type="date" value={f.to} onChange={e => set('to', e.target.value)} /></div>
        <div><label className="label">Type</label><select className="input" value={f.vtype} onChange={e => set('vtype', e.target.value)}>
          <option value="">All</option>{VTYPES.map(v => <option key={v.key} value={v.key}>{v.label}</option>)}</select></div>
        <div><label className="label">Status</label><select className="input" value={f.status} onChange={e => set('status', e.target.value)}>
          <option value="">All</option><option value="active">Active</option><option value="cancelled">Cancelled</option></select></div>
        <div><label className="label">Entered</label><select className="input" value={f.source} onChange={e => set('source', e.target.value)}>
          <option value="">All</option><option value="manual">By hand</option><option value="auto">From Fees/Payroll</option></select></div>
        <div className="lg:col-span-2"><label className="label">Ledger</label><select className="input" value={f.ledger_id} onChange={e => set('ledger_id', e.target.value)}>
          <option value="">Any</option>{ledgers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
        <div><label className="label">Search</label><input className="input" placeholder="No., narration, ref" value={f.q} onChange={e => set('q', e.target.value)} /></div>
        <div className="flex items-end"><button className="btn btn-primary">Search</button></div>
      </form>

      <div className="card p-4 overflow-x-auto">
        <div className="text-xs text-gray-500 mb-2">{rows.length} voucher(s) · active total ₹{inr(total)}{rows.length === 500 ? ' · showing the latest 500, narrow the dates to see more' : ''}</div>
        <table className="table text-sm min-w-max">
          <thead><tr><th>Date</th><th>Voucher No</th><th>Type</th><th>Ledgers</th><th>Narration</th><th className="text-right">Amount ₹</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className={r.status === 'cancelled' ? 'opacity-60' : ''}>
                <td className="whitespace-nowrap">{fmtDate(r.date)}</td>
                <td className="whitespace-nowrap font-mono text-xs">{r.voucher_no}</td>
                <td>{vtypeLabel(r.vtype)}{r.source_type && <span className="badge badge-gray ml-1" title="Posted automatically">auto</span>}</td>
                <td className="text-xs max-w-[16rem] truncate" title={r.ledgers}>{r.ledgers}</td>
                <td className="text-xs max-w-[20rem] truncate" title={r.narration || ''}>{r.narration || '—'}{r.reference ? ` · ${r.reference}` : ''}</td>
                <td className="text-right">{inr(r.amount)}</td>
                <td><span className={`badge ${r.status === 'active' ? 'badge-green' : 'badge-red'}`}>{r.status}</span></td>
                <td><Link className="text-brand-600 hover:underline text-xs" href={`/accounts/vouchers/${r.id}`}>View</Link></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={8} className="text-center py-4 text-gray-500">No vouchers for these filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
