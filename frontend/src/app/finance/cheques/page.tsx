'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, fmtDate, fmtMoney } from '@/lib/api';
import { Flash, PageTitle, useFlash } from '../_ui';

export default function ChequesPage() {
  const [status, setStatus] = useState('pending');
  const [rows, setRows] = useState<any[]>([]);
  const { msg, flash } = useFlash();

  const load = () => api<any[]>(`/finance/cheques${status ? `?status=${status}` : ''}`).then(setRows).catch(e => flash(e.message, false));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);

  async function clear(r: any) {
    try { await api(`/finance/cheques/${encodeURIComponent(r.receipt_no)}/clear`, { method: 'POST', body: '{}' }); flash(`Cheque #${r.cheque_no} marked cleared.`); load(); }
    catch (e: any) { flash(e.message, false); }
  }
  async function bounce(r: any) {
    const reason = prompt(`Cheque #${r.cheque_no} bounced. Reason (e.g. Insufficient funds):`, 'Insufficient funds');
    if (reason === null) return;
    try {
      await api(`/finance/cheques/${encodeURIComponent(r.receipt_no)}/bounce`, { method: 'POST', body: JSON.stringify({ reason }) });
      flash(`Cheque #${r.cheque_no} marked bounced. ${fmtMoney(r.total)} has been added back to ${r.student_name}'s dues.`); load();
    } catch (e: any) { flash(e.message, false); }
  }

  return (
    <Shell>
      <PageTitle crumb="Cheque Payment Status" title="Cheque Payment Status"
        sub="Mark cheques cleared when the bank credits them, or bounced to reverse the payment." />
      <div className="flex flex-wrap gap-2 mb-3">
        {['pending', 'cleared', 'bounced', ''].map(s => (
          <button key={s || 'all'} className={`btn text-sm ${status === s ? 'btn-primary' : 'bg-gray-200'}`} onClick={() => setStatus(s)}>
            {s ? s[0].toUpperCase() + s.slice(1) : 'All'}
          </button>
        ))}
        <Link className="btn bg-gray-200 text-sm ml-auto" href="/report/fee-cheques">Cheque Report</Link>
      </div>
      <Flash msg={msg} />
      <div className="card p-4 overflow-x-auto">
        <table className="table text-sm">
          <thead><tr><th>Receipt</th><th>Received</th><th>Student</th><th>Class</th><th>Cheque No</th><th>Bank</th><th>Cheque Date</th>
            <th className="text-right">Amount</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.receipt_no}>
                <td><Link className="text-brand-600 underline" href={`/finance/receipt/${encodeURIComponent(r.receipt_no)}`}>{r.receipt_no}</Link></td>
                <td>{fmtDate(r.paid_on)}</td><td>{r.student_name} <span className="text-xs text-gray-500">({r.admission_no})</span></td>
                <td>{r.class}</td><td>{r.cheque_no}</td><td>{r.cheque_bank}</td><td>{r.cheque_date ? fmtDate(r.cheque_date) : '—'}</td>
                <td className="text-right">{fmtMoney(r.total)}</td>
                <td><span className={`badge ${r.cheque_status === 'cleared' ? 'badge-green' : r.cheque_status === 'bounced' ? 'badge-red' : 'badge-amber'}`}>{r.cheque_status}</span></td>
                <td className="whitespace-nowrap text-xs">
                  {r.cheque_status === 'pending' && !r.reversed && (
                    <>
                      <button className="text-green-700 hover:underline mr-2" onClick={() => clear(r)}>Mark Cleared</button>
                      <button className="text-red-600 hover:underline" onClick={() => bounce(r)}>Mark Bounced</button>
                    </>
                  )}
                  {r.cheque_status === 'bounced' && <span className="text-gray-500">{r.reverse_reason}</span>}
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={10} className="text-center py-4 text-gray-500">No cheques in this list.</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
