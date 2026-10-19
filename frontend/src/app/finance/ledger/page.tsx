'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, downloadCsv, fmtDate, fmtMoney, getUser } from '@/lib/api';
import { Flash, Letterhead, PageTitle, StudentPicker, useFlash } from '../_ui';

type Entry = { date: string; particulars: string; debit: number; credit: number; balance: number; receipt_no?: string };
type Ledger = { student: any; entries: Entry[]; totals: { debit: number; credit: number; balance: number } };

export default function LedgerPage({ searchParams }: { searchParams: { student_id?: string } }) {
  const user = getUser<any>();
  const own = user?.role === 'student' || user?.role === 'parent';
  const [studentId, setStudentId] = useState(own ? String(user?.linkedId || '') : searchParams.student_id || '');
  const [data, setData] = useState<Ledger | null>(null);
  const [school, setSchool] = useState<any>(null);
  const { msg, flash } = useFlash();

  useEffect(() => { api('/settings').then(setSchool).catch(() => {}); }, []);
  useEffect(() => {
    if (!studentId) { setData(null); return; }
    api<Ledger>(`/finance/ledger/${studentId}`).then(setData).catch(e => flash(e.message, false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  return (
    <Shell>
      <PageTitle crumb="Student Ledger" title="Student Ledger" sub="Every fee due, concession, fine and payment with the running balance." />
      {!own && (
        <div className="card p-4 grid md:grid-cols-4 gap-3 text-sm no-print">
          <StudentPicker value={studentId} onChange={setStudentId} />
        </div>
      )}
      <Flash msg={msg} />
      {data && (
        <>
          <div className="flex gap-2 my-3 no-print">
            <button className="btn btn-primary" onClick={() => window.print()}>Print Ledger</button>
            <button className="btn btn-accent" onClick={() => downloadCsv(`ledger-${data.student.admission_no}`, [
              { key: 'date', label: 'Date' }, { key: 'particulars', label: 'Particulars' }, { key: 'debit', label: 'Debit' },
              { key: 'credit', label: 'Credit' }, { key: 'balance', label: 'Balance' }], data.entries)}>Download Excel</button>
          </div>
          <div className="card p-4 overflow-x-auto">
            <Letterhead school={school} title="Student Fee Ledger" />
            <div className="grid md:grid-cols-4 gap-2 text-sm mb-3">
              <div><span className="text-gray-500">Student:</span> <b>{data.student.full_name}</b></div>
              <div><span className="text-gray-500">Adm No:</span> {data.student.admission_no}</div>
              <div><span className="text-gray-500">Class:</span> {data.student.class_name} {data.student.class_section}</div>
              <div><span className="text-gray-500">Category:</span> {data.student.finance_category || 'General'}</div>
            </div>
            <table className="table text-sm">
              <thead><tr><th>Date</th><th>Particulars</th><th className="text-right">Debit</th><th className="text-right">Credit</th><th className="text-right">Balance</th></tr></thead>
              <tbody>
                {data.entries.map((e, i) => (
                  <tr key={i}>
                    <td className="whitespace-nowrap">{e.date ? fmtDate(e.date) : '—'}</td>
                    <td>{e.receipt_no
                      ? <Link className="text-brand-600 hover:underline" href={`/finance/receipt/${encodeURIComponent(e.receipt_no)}`}>{e.particulars}</Link>
                      : e.particulars}</td>
                    <td className="text-right">{e.debit ? fmtMoney(e.debit) : ''}</td>
                    <td className="text-right">{e.credit ? fmtMoney(e.credit) : ''}</td>
                    <td className="text-right font-medium">{fmtMoney(e.balance)}</td>
                  </tr>
                ))}
                {!data.entries.length && <tr><td colSpan={5} className="text-center py-4 text-gray-500">No fee entries yet.</td></tr>}
                <tr className="font-semibold bg-brand-50">
                  <td colSpan={2}>Total</td>
                  <td className="text-right">{fmtMoney(data.totals.debit)}</td>
                  <td className="text-right">{fmtMoney(data.totals.credit)}</td>
                  <td className="text-right">{fmtMoney(data.totals.balance)}</td>
                </tr>
              </tbody>
            </table>
            <div className="text-sm mt-3">
              {data.totals.balance > 0 ? <>Balance due: <b className="text-red-700">{fmtMoney(data.totals.balance)}</b></>
                : data.totals.balance < 0 ? <>Advance / excess: <b>{fmtMoney(-data.totals.balance)}</b></> : <b className="text-green-700">No dues.</b>}
            </div>
          </div>
        </>
      )}
    </Shell>
  );
}
