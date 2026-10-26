'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, fmtDate, fmtMoney } from '@/lib/api';

type Due = { fee_id: number; label: string; balance: number; fine: number; due_date: string | null };
type Order = { key_id: string; order_id: string; amount: number; amount_paise: number; currency: string; name: string; description: string; prefill: Record<string, string> };

declare global { interface Window { Razorpay?: any } }

function loadCheckout(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('No browser'));
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load the payment window. Check your internet connection.'));
    document.body.appendChild(s);
  });
}

/** "Pay Online" for a student's or parent's own dues. Renders nothing when online payment isn't set up. */
export default function PayOnline({ studentId, onPaid }: { studentId?: number; onPaid?: () => void }) {
  const [enabled, setEnabled] = useState(false);
  const [dues, setDues] = useState<Due[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; receipt?: string } | null>(null);

  async function load() {
    try {
      const r = await api<{ enabled: boolean; dues: Due[] }>(`/payments/dues${studentId ? `?student_id=${studentId}` : ''}`);
      setEnabled(r.enabled); setDues(r.dues); setPicked(new Set(r.dues.map(d => d.fee_id)));
    } catch { setEnabled(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [studentId]);

  if (!enabled || !dues.length) return null;
  const chosen = dues.filter(d => picked.has(d.fee_id));
  const total = chosen.reduce((a, d) => a + d.balance + d.fine, 0);
  const toggle = (id: number) => setPicked(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function pay() {
    if (!chosen.length) return setMsg({ ok: false, text: 'Tick at least one fee to pay.' });
    setBusy(true); setMsg(null);
    try {
      await loadCheckout();
      const o = await api<Order>('/payments/order', { method: 'POST', body: JSON.stringify({ student_id: studentId, fee_ids: chosen.map(d => d.fee_id) }) });
      const rzp = new window.Razorpay({
        key: o.key_id, order_id: o.order_id, amount: o.amount_paise, currency: o.currency, name: o.name, description: o.description,
        prefill: o.prefill, theme: { color: '#1e56a8' },
        handler: async (resp: any) => {
          try {
            const v = await api<{ status: string; receipt_no: string | null; error?: string }>('/payments/verify', { method: 'POST', body: JSON.stringify(resp) });
            if (v.status === 'paid') {
              setMsg({ ok: true, text: `Payment received. Receipt ${v.receipt_no}.`, receipt: v.receipt_no || undefined });
              setOpen(false); load(); onPaid?.();
            } else setMsg({ ok: false, text: v.error || 'Payment received but needs checking by the school office. You will not be charged twice.' });
          } catch (e: any) { setMsg({ ok: false, text: `${e.message}. If money was deducted, the school will confirm it automatically.` }); }
          finally { setBusy(false); }
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      rzp.on?.('payment.failed', (r: any) => { setMsg({ ok: false, text: r?.error?.description || 'Payment failed. No money was taken.' }); setBusy(false); });
      rzp.open();
    } catch (e: any) { setMsg({ ok: false, text: e.message }); setBusy(false); }
  }

  return (
    <div className="card p-4 mt-4 border-green-200 bg-green-50/40">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-semibold text-green-800">Pay fees online</div>
          <div className="text-xs text-gray-600">UPI, debit/credit card or netbanking. Your receipt is created instantly.</div>
        </div>
        {!open && <button className="btn bg-green-600 text-white hover:bg-green-700" onClick={() => setOpen(true)}>Pay Online</button>}
      </div>
      {msg && (
        <div className={`text-sm rounded px-3 py-2 mt-3 border ${msg.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {msg.text} {msg.receipt && <Link className="underline ml-1" href={`/finance/receipt/${encodeURIComponent(msg.receipt)}`}>View receipt</Link>}
        </div>
      )}
      {open && (
        <div className="mt-3">
          <table className="table text-sm">
            <thead><tr><th></th><th>Fee</th><th>Due Date</th><th className="text-right">Balance</th><th className="text-right">Late Fine</th></tr></thead>
            <tbody>
              {dues.map(d => (
                <tr key={d.fee_id} onClick={() => toggle(d.fee_id)} className="cursor-pointer">
                  <td><input type="checkbox" checked={picked.has(d.fee_id)} onChange={() => toggle(d.fee_id)} onClick={e => e.stopPropagation()} /></td>
                  <td>{d.label}</td><td>{d.due_date ? fmtDate(d.due_date) : '—'}</td>
                  <td className="text-right">{fmtMoney(d.balance)}</td><td className="text-right">{d.fine ? fmtMoney(d.fine) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <div className="text-sm">Total: <b className="text-lg">{fmtMoney(total)}</b></div>
            <button className="btn bg-green-600 text-white hover:bg-green-700" onClick={pay} disabled={busy || !chosen.length}>{busy ? 'Opening…' : `Pay ${fmtMoney(total)}`}</button>
            <button className="btn bg-gray-200" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
