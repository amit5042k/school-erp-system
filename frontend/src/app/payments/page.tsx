'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, downloadCsv, fmtDateTime, fmtMoney } from '@/lib/api';

type Row = {
  id: number; order_id: string; student_id: number; student_name: string; admission_no: string; class_name?: string; class_section?: string;
  amount: number; status: 'pending' | 'paid' | 'failed' | 'conflict' | 'cancelled'; payment_id: string | null; method: string | null;
  receipt_no: string | null; error: string | null; note: string | null; created_at: string; paid_at: string | null; paid_by: string | null;
};

const BADGE: Record<Row['status'], string> = { paid: 'badge-green', pending: 'badge-amber', failed: 'badge-red', conflict: 'badge-red', cancelled: 'badge-gray' };

export default function OnlinePaymentsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [f, setF] = useState({ status: '', from: '', to: '' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const flash = (text: string, ok = true) => setMsg({ ok, text });

  async function load() {
    try {
      const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
      const r = await api<{ enabled: boolean; rows: Row[] }>(`/payments${qs ? `?${qs}` : ''}`);
      setRows(r.rows); setEnabled(r.enabled);
    } catch (e: any) { flash(e.message, false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function reconcile(r: Row) {
    setBusy(r.id); setMsg(null);
    try { const x = await api<any>(`/payments/${r.id}/reconcile`, { method: 'POST' }); flash(`${r.order_id}: ${x.message || x.status}`, x.status === 'paid' || x.status === 'pending'); load(); }
    catch (e: any) { flash(e.message, false); }
    finally { setBusy(null); }
  }
  async function annotate(r: Row, status?: 'cancelled' | 'pending') {
    const note = prompt(status === 'cancelled' ? 'Reason for cancelling this order:' : 'Office note (e.g. "Refunded on 12/11 via Razorpay"):', r.note || '');
    if (note === null) return;
    try { await api(`/payments/${r.id}`, { method: 'PUT', body: JSON.stringify({ note, ...(status ? { status } : {}) }) }); load(); }
    catch (e: any) { flash(e.message, false); }
  }

  const totals = rows.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + r.amount; return a; }, {} as Record<string, number>);

  return (
    <Shell>
      <div className="text-xs text-gray-500 mb-1">Finance › Online Payments</div>
      <h2 className="text-xl font-bold text-brand-700 mb-1">Online Payments</h2>
      <p className="text-sm text-gray-600 mb-3 max-w-3xl">Fees paid by parents through Razorpay (UPI, card, netbanking). Paid orders get a receipt automatically.
        Use <b>Check with Razorpay</b> for orders still pending, e.g. when a parent closed the window after paying.</p>
      {!enabled && (
        <div className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded px-3 py-2 mb-3">
          Online payment is <b>not set up</b>. Add <code>RAZORPAY_KEY_ID</code>, <code>RAZORPAY_KEY_SECRET</code> and <code>RAZORPAY_WEBHOOK_SECRET</code> to
          <code> backend/.env</code> and restart the server. In the Razorpay dashboard, add a webhook to <code>https://&lt;your-api-domain&gt;/api/payments/webhook</code> for
          <i> payment.captured</i>, <i>order.paid</i> and <i>payment.failed</i>.
        </div>
      )}
      {msg && <div className={`text-sm rounded px-3 py-2 mb-3 border ${msg.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>{msg.text}</div>}

      <form className="card p-4 mb-4 grid md:grid-cols-5 gap-3 text-sm" onSubmit={e => { e.preventDefault(); load(); }}>
        <div><label className="label">Status</label>
          <select className="input" value={f.status} onChange={e => setF({ ...f, status: e.target.value })}>
            <option value="">All</option>{Object.keys(BADGE).map(s => <option key={s} value={s}>{s}</option>)}
          </select></div>
        <div><label className="label">From</label><input className="input" type="date" value={f.from} onChange={e => setF({ ...f, from: e.target.value })} /></div>
        <div><label className="label">To</label><input className="input" type="date" value={f.to} onChange={e => setF({ ...f, to: e.target.value })} /></div>
        <div className="flex items-end gap-2 md:col-span-2">
          <button className="btn btn-primary">Search</button>
          <button type="button" className="btn btn-accent" onClick={() => downloadCsv('online-payments', [
            { key: 'created_at', label: 'Created' }, { key: 'order_id', label: 'Order' }, { key: 'payment_id', label: 'Payment' },
            { key: 'admission_no', label: 'Adm No' }, { key: 'student_name', label: 'Student' }, { key: 'amount', label: 'Amount' },
            { key: 'status', label: 'Status' }, { key: 'receipt_no', label: 'Receipt' }, { key: 'method', label: 'Method' }, { key: 'note', label: 'Note' },
          ], rows)}>Download Excel</button>
        </div>
      </form>

      <div className="grid sm:grid-cols-4 gap-3 mb-4 text-sm">
        {(['paid', 'pending', 'conflict', 'failed'] as const).map(s => (
          <div key={s} className="card p-3"><div className="text-gray-500 capitalize">{s === 'conflict' ? 'Needs attention' : s}</div><div className="text-lg font-bold">{fmtMoney(totals[s] || 0)}</div></div>
        ))}
      </div>

      <div className="card p-4 overflow-x-auto">
        <table className="table text-sm min-w-max">
          <thead><tr><th>Created</th><th>Student</th><th className="text-right">Amount</th><th>Status</th><th>Payment / Receipt</th><th>Note</th><th></th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td className="whitespace-nowrap">{fmtDateTime(r.created_at)}<div className="text-[11px] text-gray-500 font-mono">{r.order_id}</div></td>
                <td>{r.student_name} <span className="text-xs text-gray-500">({r.admission_no})</span>
                  <div className="text-[11px] text-gray-500">{r.class_name} {r.class_section}{r.paid_by ? ` · by ${r.paid_by}` : ''}</div></td>
                <td className="text-right">{fmtMoney(r.amount)}</td>
                <td><span className={`badge ${BADGE[r.status]}`}>{r.status === 'conflict' ? 'needs attention' : r.status}</span>
                  {r.error && <div className="text-[11px] text-red-700 max-w-xs">{r.error}</div>}</td>
                <td className="text-xs">
                  {r.payment_id && <div className="font-mono">{r.payment_id}{r.method ? ` · ${r.method}` : ''}</div>}
                  {r.receipt_no && <Link className="text-brand-600 underline" href={`/finance/receipt/${encodeURIComponent(r.receipt_no)}`}>{r.receipt_no}</Link>}
                  {r.paid_at && <div className="text-gray-500">{fmtDateTime(r.paid_at)}</div>}
                </td>
                <td className="text-xs max-w-[14rem]">{r.note || '—'}</td>
                <td className="whitespace-nowrap text-xs">
                  {(r.status === 'pending' || r.status === 'failed') && (
                    <button className="text-brand-600 hover:underline mr-2" disabled={busy === r.id} onClick={() => reconcile(r)}>{busy === r.id ? 'Checking…' : 'Check with Razorpay'}</button>
                  )}
                  {r.status === 'pending' && <button className="text-red-600 hover:underline mr-2" onClick={() => annotate(r, 'cancelled')}>Cancel</button>}
                  <button className="text-gray-600 hover:underline" onClick={() => annotate(r)}>Note</button>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7} className="text-center py-4 text-gray-500">No online payments yet.</td></tr>}
          </tbody>
        </table>
        <p className="text-xs text-gray-500 mt-3">
          <b>Needs attention</b>: money was received but the dues had already changed (for example paid at the counter). Refund it from the Razorpay dashboard
          or post it manually, then add a note here.
        </p>
      </div>
    </Shell>
  );
}
