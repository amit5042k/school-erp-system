'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';

export default function ReportsPage() {
  const [r, setR] = useState<any>(null);
  useEffect(() => { api('/reports/summary').then(setR); }, []);

  if (!r) return <Shell><div className="text-gray-500">Loading…</div></Shell>;

  return (
    <Shell>
      <h2 className="text-xl font-bold text-brand-700 mb-4">Reports — Summary</h2>

      <div className="grid md:grid-cols-3 gap-4">
        <Card title="Students" value={r.students} />
        <Card title="Teachers" value={r.teachers} />
        <Card title="Transport Students" value={r.transport_students} />
        <Card title="Hostel Occupancy" value={r.hostel_occupancy} />
        <Card title="Books Issued" value={r.library_issued} />
        <Card title="Pending Leaves" value={r.pending_leaves} />
      </div>

      <div className="card p-4 mt-6">
        <h3 className="font-semibold text-brand-700 mb-2">Attendance Today</h3>
        <ul className="text-sm">
          {r.attendance_today.map((a: any) => <li key={a.status}>{a.status}: <b>{a.c}</b></li>)}
          {!r.attendance_today.length && <li className="text-gray-500">No attendance marked today.</li>}
        </ul>
      </div>

      <div className="card p-4 mt-4">
        <h3 className="font-semibold text-brand-700 mb-2">Fees by Status</h3>
        <table className="table"><thead><tr><th>Status</th><th>Total Amount</th></tr></thead>
          <tbody>{r.fees_by_status.map((f: any) => <tr key={f.status}><td>{f.status}</td><td>₹{f.total}</td></tr>)}</tbody></table>
      </div>

      <div className="card p-4 mt-4">
        <h3 className="font-semibold text-brand-700 mb-2">Low Stock Items</h3>
        {r.low_stock.length ? (
          <table className="table"><thead><tr><th>SKU</th><th>Name</th><th>On hand</th><th>Reorder</th></tr></thead>
            <tbody>{r.low_stock.map((i: any) => <tr key={i.sku}><td>{i.sku}</td><td>{i.name}</td><td>{i.qty_on_hand}</td><td>{i.reorder_level}</td></tr>)}</tbody></table>
        ) : <p className="text-sm text-gray-500">All items above reorder level.</p>}
      </div>
    </Shell>
  );
}

function Card({ title, value }: { title: string; value: any }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase text-gray-500">{title}</div>
      <div className="text-3xl font-bold text-brand-700 mt-1">{value ?? 0}</div>
    </div>
  );
}
