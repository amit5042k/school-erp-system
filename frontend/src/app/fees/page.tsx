'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import ExploreOptions from '@/components/ExploreOptions';
import { api, fmtDate, fmtMoney, getUser } from '@/lib/api';
import PayOnline from '../payments/_PayOnline';

type Fee = { id: number; student_id: number; student_name: string; admission_no: string; term: string; head?: string | null; amount: number; paid: number; status: string; due_date: string; receipt_no?: string };

export default function FeesPage() {
  const [rows, setRows] = useState<Fee[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);
  const user = getUser<any>();
  const isAdmin = user?.role === 'admin';
  const isStudent = user?.role === 'student' || user?.role === 'parent';

  async function load() {
    try {
      if (isAdmin) setRows(await api<Fee[]>('/fees'));
      else if (user?.linkedId) {
        setRows(await api<Fee[]>(`/fees/student/${user.linkedId}`));
        setReceipts(await api<any[]>('/finance/receipts'));
      }
    } catch (e: any) { setError(e.message); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const balance = rows.reduce((a, f) => a + (f.amount - (f.paid || 0)), 0);

  const FeeTable = (
    <div className="card p-4 mt-6 overflow-x-auto">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-brand-700">Fee Transactions</h3>
        {!isStudent && (
          <button className="text-xs text-gray-500 hover:underline" onClick={() => setShowTable(false)}>Close</button>
        )}
      </div>
      {error && <div className="text-red-700 text-sm mb-2">{error}</div>}
      <table className="table">
        <thead><tr>
          {isAdmin && <th>Student</th>}
          <th>Fee</th><th className="text-right">Net Amount</th><th className="text-right">Paid</th><th className="text-right">Balance</th><th>Status</th><th>Due Date</th>
          {isAdmin && <th>Action</th>}
        </tr></thead>
        <tbody>
          {rows.map(f => (
            <tr key={f.id}>
              {isAdmin && <td>{f.student_name} <span className="text-xs text-gray-500">({f.admission_no})</span></td>}
              <td>{f.head ? `${f.head} — ${f.term}` : f.term}</td>
              <td className="text-right">{fmtMoney(f.amount)}</td>
              <td className="text-right">{fmtMoney(f.paid)}</td>
              <td className="text-right">{fmtMoney(f.amount - (f.paid || 0))}</td>
              <td>
                <span className={`badge ${f.status === 'paid' ? 'badge-green' : f.status === 'overdue' ? 'badge-red' : 'badge-amber'}`}>
                  {f.status}
                </span>
              </td>
              <td>{f.due_date ? fmtDate(f.due_date) : '—'}</td>
              {isAdmin && (
                <td className="whitespace-nowrap">
                  {f.status !== 'paid' && (
                    <Link href={`/finance/collect?student_id=${f.student_id}`} className="btn btn-primary text-xs py-1">Collect</Link>
                  )}
                  {f.receipt_no && <Link className="block text-xs text-brand-600 underline mt-1" href={`/finance/receipt/${encodeURIComponent(f.receipt_no)}`}>{f.receipt_no}</Link>}
                </td>
              )}
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={isAdmin ? 8 : 6} className="text-center py-4 text-gray-500">No fee records.</td></tr>}
        </tbody>
      </table>
    </div>
  );

  if (isStudent) {
    return (
      <Shell>
        <h2 className="text-xl font-bold text-brand-700 mb-2">{user?.role === 'parent' ? "My Child's Fees" : 'My Fees'}</h2>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div>Balance due: <b className={balance > 0 ? 'text-red-700' : 'text-green-700'}>{fmtMoney(balance)}</b></div>
          <Link className="btn bg-gray-200 text-sm" href="/finance/ledger">View Fee Ledger</Link>
        </div>
        {balance > 0 && <PayOnline studentId={user?.linkedId} onPaid={load} />}
        {FeeTable}
        <div className="card p-4 mt-6 overflow-x-auto">
          <h3 className="font-semibold text-brand-700 mb-3">Receipts</h3>
          <table className="table text-sm">
            <thead><tr><th>Receipt</th><th>Date</th><th>Mode</th><th className="text-right">Amount</th><th>Status</th></tr></thead>
            <tbody>
              {receipts.map(r => (
                <tr key={r.receipt_no}>
                  <td><Link className="text-brand-600 underline" href={`/finance/receipt/${encodeURIComponent(r.receipt_no)}`}>{r.receipt_no}</Link></td>
                  <td>{fmtDate(r.paid_on)}</td><td className="capitalize">{r.mode}</td><td className="text-right">{fmtMoney(r.total)}</td>
                  <td>{r.reversed ? <span className="badge badge-red">{r.cheque_status === 'bounced' ? 'Cheque bounced' : 'Cancelled'}</span>
                    : r.cheque_status === 'pending' ? <span className="badge badge-amber">Cheque pending</span> : <span className="badge badge-green">Received</span>}</td>
                </tr>
              ))}
              {!receipts.length && <tr><td colSpan={5} className="text-center py-3 text-gray-500">No receipts yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <ExploreOptions
        icon="₹"
        title="Finance"
        subtitle="Fee Collection & Reports — Explore Options"
        breadcrumb={['Dashboard', 'Finance']}
        columns={3}
        groups={[
          { title: 'Transactions', actions: [
            { label: 'Fee Transactions', onClick: () => setShowTable(true) },
            { label: 'Fee Submission', href: '/finance/collect' },
            { label: 'Cheque Payment Status', href: '/finance/cheques' },
            { label: 'Update Opening Balance', href: '/finance/opening-balance' },
          ]},
          { title: 'Collection Reports', actions: [
            { label: 'Userwise Fees Entry Report', href: '/report/fee-userwise-entry' },
            { label: 'Daywise Collection Report', href: '/report/fee-daywise-collection' },
            { label: 'Pending Fee Report', href: '/report/fee-pending' },
            { label: 'Pending Fee Report Headwise', href: '/report/fee-pending-headwise' },
            { label: 'Pending Transport Fee Report', href: '/report/fee-pending-transport' },
            { label: 'Pending Fee Report By Installment', href: '/report/fee-pending-installment' },
            { label: 'Student Ledger Report', href: '/report/fee-student-ledger' },
            { label: 'Student Ledger', href: '/finance/ledger' },
          ]},
          { title: 'Discounts & Promotion', actions: [
            { label: 'Manage Discount Categories', href: '/masters/discount-categories' },
            { label: 'Student Discount Reports', href: '/report/fee-discounts' },
            { label: 'Student Discount/Fee Waveoff', href: '/finance/discounts' },
            { label: 'Waived off Fees Report', href: '/report/fee-waivers' },
            { label: 'Promote Students', href: '/academic/promote' },
          ]},
          { title: 'Reconciliation', actions: [
            { label: 'Reconciliation', href: '/finance/reconciliation' },
            { label: 'Reconciliation Report', href: '/report/fee-reconciliation' },
            { label: 'Reconciliation Collection Report Headwise', href: '/report/fee-reconciliation-headwise' },
          ]},
          { title: 'App & Settings', actions: [
            { label: 'Block/Unblock Student App', href: '/finance/app-block' },
            { label: 'App Block Students Report', href: '/report/fee-app-blocks' },
            { label: 'Configure Fine Settings', href: '/finance/fine-settings' },
            { label: 'Manage Finance Category', href: '/masters/finance-categories' },
            { label: 'Fee Categories', href: '/masters/fee-heads' },
            { label: 'Installment Settings', href: '/finance/installments' },
          ]},
          { title: 'Fee Setup', actions: [
            { label: 'Class-wise Fee Structure', href: '/finance/installments?tab=structure' },
            { label: 'Generate Fee Demands', href: '/finance/installments?tab=generate' },
            { label: 'Cheque Payment Status Report', href: '/report/fee-cheques' },
          ]},
        ]}
      />

      {showTable && FeeTable}
    </Shell>
  );
}
