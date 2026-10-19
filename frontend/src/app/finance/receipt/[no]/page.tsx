'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, fmtDate, fmtDateTime, fmtMoney, getUser } from '@/lib/api';
import { Flash, Letterhead, amountInWords, useFlash } from '../../_ui';

type Receipt = {
  receipt_no: string; paid_on: string; mode: string; cheque_no?: string; cheque_bank?: string; cheque_date?: string; cheque_status?: string;
  reversed: number; reversed_on?: string; reverse_reason?: string; amount: number; fine: number; total: number; remarks?: string;
  received_by_name?: string; student: any; school: any; balance_after: number;
  items: { term: string; head: string | null; due_date: string | null; amount: number; fine: number }[];
};

export default function ReceiptPage({ params }: { params: { no: string } }) {
  const no = decodeURIComponent(params.no);
  const isAdmin = getUser<any>()?.role === 'admin';
  const [r, setR] = useState<Receipt | null>(null);
  const { msg, flash } = useFlash();

  const load = () => api<Receipt>(`/finance/receipt/${encodeURIComponent(no)}`).then(setR).catch(e => flash(e.message, false));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [no]);

  async function cancel() {
    const reason = prompt('Reason for cancelling this receipt (the amounts will be added back to the dues):');
    if (!reason) return;
    try { await api(`/finance/receipt/${encodeURIComponent(no)}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }); flash('Receipt cancelled.'); load(); }
    catch (e: any) { flash(e.message, false); }
  }

  return (
    <Shell>
      <div className="flex flex-wrap gap-2 mb-3 no-print">
        <button className="btn btn-primary" onClick={() => window.print()}>Print Receipt</button>
        {isAdmin && <Link className="btn bg-gray-200" href={`/finance/collect${r ? `?student_id=${r.student.id}` : ''}`}>Back to Fee Submission</Link>}
        {r && <Link className="btn bg-gray-200" href={`/finance/ledger?student_id=${r.student.id}`}>Student Ledger</Link>}
        {isAdmin && r && !r.reversed && <button className="btn bg-red-600 text-white hover:bg-red-700" onClick={cancel}>Cancel Receipt</button>}
      </div>
      <Flash msg={msg} />
      {r && (
        <div className="card p-6 max-w-2xl mx-auto text-sm print-avoid-break">
          <Letterhead school={r.school} title="Fee Receipt" />
          {!!r.reversed && (
            <div className="text-center text-red-700 font-bold border border-red-300 rounded py-1 mb-3">
              {r.cheque_status === 'bounced' ? 'CHEQUE BOUNCED' : 'CANCELLED'} on {fmtDate(r.reversed_on)}{r.reverse_reason ? ` — ${r.reverse_reason}` : ''}
            </div>
          )}
          <div className="grid grid-cols-2 gap-y-1 mb-3">
            <div><span className="text-gray-500">Receipt No:</span> <b>{r.receipt_no}</b></div>
            <div className="text-right"><span className="text-gray-500">Date:</span> {fmtDateTime(r.paid_on)}</div>
            <div><span className="text-gray-500">Student:</span> <b>{r.student.full_name}</b></div>
            <div className="text-right"><span className="text-gray-500">Adm No:</span> {r.student.admission_no}</div>
            <div><span className="text-gray-500">Class:</span> {r.student.class_name} {r.student.class_section}</div>
            <div className="text-right"><span className="text-gray-500">Father:</span> {r.student.father_name || '—'}</div>
          </div>
          <table className="w-full border text-sm">
            <thead><tr className="bg-gray-100"><th className="border px-2 py-1 text-left">#</th><th className="border px-2 py-1 text-left">Particulars</th>
              <th className="border px-2 py-1 text-right">Fee</th><th className="border px-2 py-1 text-right">Fine</th><th className="border px-2 py-1 text-right">Total</th></tr></thead>
            <tbody>
              {r.items.map((it, i) => (
                <tr key={i}>
                  <td className="border px-2 py-1">{i + 1}</td>
                  <td className="border px-2 py-1">{it.head ? `${it.head} — ${it.term}` : it.term}</td>
                  <td className="border px-2 py-1 text-right">{fmtMoney(it.amount)}</td>
                  <td className="border px-2 py-1 text-right">{fmtMoney(it.fine)}</td>
                  <td className="border px-2 py-1 text-right">{fmtMoney(it.amount + it.fine)}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="border px-2 py-1" colSpan={2}>Total</td>
                <td className="border px-2 py-1 text-right">{fmtMoney(r.amount)}</td>
                <td className="border px-2 py-1 text-right">{fmtMoney(r.fine)}</td>
                <td className="border px-2 py-1 text-right">{fmtMoney(r.total)}</td>
              </tr>
            </tbody>
          </table>
          <div className="mt-2 italic">{amountInWords(r.total)}</div>
          <div className="grid grid-cols-2 gap-y-1 mt-3">
            <div><span className="text-gray-500">Mode:</span> <span className="capitalize">{r.mode}</span>
              {r.cheque_no && <> — Cheque #{r.cheque_no}, {r.cheque_bank}{r.cheque_date ? `, ${fmtDate(r.cheque_date)}` : ''} ({r.cheque_status})</>}</div>
            <div className="text-right"><span className="text-gray-500">Balance due after this receipt:</span> {fmtMoney(r.balance_after)}</div>
            {r.remarks && <div className="col-span-2"><span className="text-gray-500">Remarks:</span> {r.remarks}</div>}
          </div>
          <div className="flex justify-between mt-10 text-xs text-gray-600">
            <div>Received by: {r.received_by_name || '—'}</div>
            <div className="border-t border-gray-400 pt-1 w-40 text-center">Authorised Signatory</div>
          </div>
          {r.mode === 'cheque' && <div className="text-[11px] text-gray-500 mt-3">Cheque payments are subject to realisation.</div>}
        </div>
      )}
    </Shell>
  );
}
