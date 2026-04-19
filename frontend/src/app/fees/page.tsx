'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import ExploreOptions from '@/components/ExploreOptions';
import { api, getUser } from '@/lib/api';

type Fee = { id: number; student_id: number; student_name: string; admission_no: string; term: string; amount: number; paid: number; status: string; due_date: string; receipt_no?: string };

export default function FeesPage() {
  const [rows, setRows] = useState<Fee[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);
  const user = getUser<any>();
  const isAdmin = user?.role === 'admin';
  const isStudent = user?.role === 'student';

  async function load() {
    try {
      if (isAdmin) setRows(await api<Fee[]>('/fees'));
      else if (user?.linkedId) setRows(await api<Fee[]>(`/fees/student/${user.linkedId}`));
    } catch (e: any) { setError(e.message); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function payRemainder(f: Fee) {
    const amt = f.amount - (f.paid || 0);
    if (amt <= 0) return;
    try {
      await api(`/fees/${f.id}/pay`, { method: 'POST', body: JSON.stringify({ amount: amt }) });
      load();
    } catch (e: any) { setError(e.message); }
  }

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
          <th>Term</th><th>Amount</th><th>Paid</th><th>Status</th><th>Due Date</th>
          {isAdmin && <th>Action</th>}
        </tr></thead>
        <tbody>
          {rows.map(f => (
            <tr key={f.id}>
              {isAdmin && <td>{f.student_name} <span className="text-xs text-gray-500">({f.admission_no})</span></td>}
              <td>{f.term}</td>
              <td>₹{f.amount}</td>
              <td>₹{f.paid}</td>
              <td>
                <span className={`badge ${f.status === 'paid' ? 'badge-green' : f.status === 'overdue' ? 'badge-red' : 'badge-amber'}`}>
                  {f.status}
                </span>
              </td>
              <td>{f.due_date}</td>
              {isAdmin && (
                <td>
                  {f.status !== 'paid' && (
                    <button onClick={() => payRemainder(f)} className="btn btn-primary text-xs py-1">Mark Paid</button>
                  )}
                  {f.receipt_no && <div className="text-xs text-gray-500 mt-1">{f.receipt_no}</div>}
                </td>
              )}
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={isAdmin ? 7 : 5} className="text-center py-4 text-gray-500">No fee records.</td></tr>}
        </tbody>
      </table>
    </div>
  );

  if (isStudent) {
    return (
      <Shell>
        <h2 className="text-xl font-bold text-brand-700 mb-4">My Fees</h2>
        {FeeTable}
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
            { label: 'Fee Submission', onClick: () => setShowTable(true) },
            { label: 'Cheque Payment Status' },
            { label: 'Update Opening Balance' },
          ]},
          { title: 'Collection Reports', actions: [
            { label: 'Userwise Fees Entry Report' },
            { label: 'Daywise Collection Report' },
            { label: 'Pending Fee Report' },
            { label: 'Pending Fee Report Headwise' },
            { label: 'Pending Transport Fee Report' },
            { label: 'Pending Fee Report By Installment' },
            { label: 'Student Ledger Report' },
            { label: 'Student Ledger' },
          ]},
          { title: 'Discounts & Promotion', actions: [
            { label: 'Manage Discount Categories' },
            { label: 'Student Discount Reports' },
            { label: 'Student Discount/Fee Waveoff' },
            { label: 'Waived off Fees Report' },
            { label: 'Promote Students' },
          ]},
          { title: 'Reconciliation', actions: [
            { label: 'Reconciliation' },
            { label: 'Reconciliation Report' },
            { label: 'Reconciliation Collection Report Headwise' },
          ]},
          { title: 'App & Settings', actions: [
            { label: 'Block/Unblock Student App' },
            { label: 'App Block Students Report' },
            { label: 'Configure Fine Settings' },
            { label: 'Manage Finance Category' },
            { label: 'Fee Categories' },
            { label: 'Installment Settings' },
          ]},
        ]}
      />

      {showTable && FeeTable}
    </Shell>
  );
}
