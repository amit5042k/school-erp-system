'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, fmtDate, fmtMoney, getUser } from '@/lib/api';
import { Letterhead, amountInWords } from '../../../finance/_ui';

const monthName = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
};

export default function SalarySlipPage({ params }: { params: { id: string } }) {
  const isAdmin = getUser<any>()?.role === 'admin';
  const [s, setS] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api(`/pay/slip/${params.id}`).then(setS).catch(e => setErr(e.message)); }, [params.id]);

  const earnings: [string, number][] = s ? (s.has_details
    ? [['Basic', s.basic], ['Dearness Allowance', s.da], ['House Rent Allowance', s.hra], ['Conveyance', s.conveyance], ['Other Allowance', s.other_allowance]]
    : [['Basic', s.basic], ['Allowances', s.allowances]]) : [];
  const deductions: [string, number][] = s ? (s.has_details
    ? [['Provident Fund', s.pf], ['ESI', s.esi], ['TDS (Income Tax)', s.tds], ['Other Deductions', s.other_deduction]]
    : [['Deductions', s.deductions]]) : [];
  const rows = Math.max(earnings.length, deductions.length);

  return (
    <Shell>
      <div className="flex gap-2 mb-3 no-print">
        <button className="btn btn-primary" onClick={() => window.print()}>Print Slip</button>
        <Link className="btn bg-gray-200" href="/payroll">{isAdmin ? 'Back to Payroll' : 'My Payslips'}</Link>
      </div>
      {err && <div className="text-red-700 text-sm">{err}</div>}
      {s && (
        <div className="card p-3 sm:p-6 max-w-3xl mx-auto text-sm">
          <Letterhead school={s.school} title={`Salary Slip — ${monthName(s.month)}`} />
          <div className="grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-x-6 gap-y-1 mb-4">
            <div><span className="text-gray-500">Employee:</span> <b>{s.teacher_name}</b></div>
            <div><span className="text-gray-500">Employee No:</span> {s.employee_no}</div>
            <div><span className="text-gray-500">Designation:</span> {s.designation || '—'}</div>
            <div><span className="text-gray-500">Department:</span> {s.department || '—'}</div>
            <div><span className="text-gray-500">PAN:</span> {s.pan_no || '—'}</div>
            <div><span className="text-gray-500">UAN:</span> {s.uan_no || '—'}</div>
            <div><span className="text-gray-500">Bank A/c:</span> {s.bank_account ? `${s.bank_account} (${s.bank_name || ''} ${s.ifsc || ''})` : '—'}</div>
            <div><span className="text-gray-500">ESI No:</span> {s.esi_no || '—'}</div>
            {s.days_in_month && <div><span className="text-gray-500">Paid Days:</span> {s.days_in_month - s.lop_days} / {s.days_in_month}{s.lop_days ? ` (LOP ${s.lop_days})` : ''}</div>}
            <div><span className="text-gray-500">Status:</span> {s.status === 'paid' ? `Paid${s.paid_on ? ` on ${fmtDate(s.paid_on)}` : ''}` : 'Pending'}</div>
          </div>
          <div className="overflow-x-auto"><table className="w-full border text-xs sm:text-sm print:text-sm">
            <thead><tr className="bg-gray-100">
              <th className="border px-2 py-1 text-left">Earnings</th><th className="border px-2 py-1 text-right">Amount</th>
              <th className="border px-2 py-1 text-left">Deductions</th><th className="border px-2 py-1 text-right">Amount</th>
            </tr></thead>
            <tbody>
              {[...Array(rows)].map((_, i) => (
                <tr key={i}>
                  <td className="border px-2 py-1">{earnings[i]?.[0] || ''}</td>
                  <td className="border px-2 py-1 text-right">{earnings[i] ? fmtMoney(earnings[i][1]) : ''}</td>
                  <td className="border px-2 py-1">{deductions[i]?.[0] || ''}</td>
                  <td className="border px-2 py-1 text-right">{deductions[i] ? fmtMoney(deductions[i][1]) : ''}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="border px-2 py-1">Gross Earnings</td><td className="border px-2 py-1 text-right">{fmtMoney(s.gross)}</td>
                <td className="border px-2 py-1">Total Deductions</td><td className="border px-2 py-1 text-right">{fmtMoney(s.deductions)}</td>
              </tr>
            </tbody>
          </table></div>
          <div className="mt-3 text-base">Net Pay: <b>{fmtMoney(s.net_pay)}</b></div>
          <div className="italic">{amountInWords(s.net_pay)}</div>
          {s.has_details && (s.employer_pf + s.employer_eps + s.employer_esi) > 0 && (
            <div className="text-xs text-gray-600 mt-3">Employer contributions (not deducted from salary): EPF {fmtMoney(s.employer_pf)}, EPS {fmtMoney(s.employer_eps)}, ESI {fmtMoney(s.employer_esi)}.</div>
          )}
          <div className="text-[11px] text-gray-500 mt-8 text-center">This is a computer-generated salary slip.</div>
        </div>
      )}
    </Shell>
  );
}
