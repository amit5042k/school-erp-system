'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, getUser } from '@/lib/api';

type Fee = { id: number; student_id: number; student_name: string; admission_no: string; term: string; amount: number; paid: number; status: string; due_date: string; receipt_no?: string };

export default function FeesPage() {
  const [rows, setRows] = useState<Fee[]>([]);
  const [error, setError] = useState<string | null>(null);
  const user = getUser<any>();

  async function load() {
    try {
      if (user?.role === 'admin') setRows(await api<Fee[]>('/fees'));
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

  return (
    <Shell>
      <h2 className="text-xl font-bold text-brand-700 mb-4">Fees</h2>

      <div className="card p-4">
        {error && <div className="text-red-700 text-sm mb-2">{error}</div>}
        <table className="table">
          <thead><tr>
            {user?.role === 'admin' && <th>Student</th>}
            <th>Term</th><th>Amount</th><th>Paid</th><th>Status</th><th>Due Date</th>
            {user?.role === 'admin' && <th>Action</th>}
          </tr></thead>
          <tbody>
            {rows.map(f => (
              <tr key={f.id}>
                {user?.role === 'admin' && <td>{f.student_name} <span className="text-xs text-gray-500">({f.admission_no})</span></td>}
                <td>{f.term}</td>
                <td>₹{f.amount}</td>
                <td>₹{f.paid}</td>
                <td>
                  <span className={`badge ${f.status === 'paid' ? 'badge-green' : f.status === 'overdue' ? 'badge-red' : 'badge-amber'}`}>
                    {f.status}
                  </span>
                </td>
                <td>{f.due_date}</td>
                {user?.role === 'admin' && (
                  <td>
                    {f.status !== 'paid' && (
                      <button onClick={() => payRemainder(f)} className="btn btn-primary text-xs py-1">
                        Mark Paid
                      </button>
                    )}
                    {f.receipt_no && <div className="text-xs text-gray-500 mt-1">{f.receipt_no}</div>}
                  </td>
                )}
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={user?.role === 'admin' ? 7 : 5} className="text-center py-4 text-gray-500">No fee records.</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
