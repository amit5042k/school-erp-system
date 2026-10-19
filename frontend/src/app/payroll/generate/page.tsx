'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, fmtMoney, localDate } from '@/lib/api';

export default function GenerateSlipsPage() {
  const [month, setMonth] = useState(localDate().slice(0, 7));
  const [staff, setStaff] = useState<any[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [lop, setLop] = useState<Record<number, string>>({});
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<any[]>('/pay/structure').then(r => {
      const ready = r.filter(s => s.basic > 0 && s.status === 'active');
      setStaff(ready); setPicked(new Set(ready.map(s => s.teacher_id)));
    }).catch(e => setErr(e.message));
  }, []);

  async function generate() {
    if (!picked.size) return setErr('Select at least one staff member.');
    setErr(null); setResult(null);
    try {
      setResult(await api('/pay/generate', { method: 'POST', body: JSON.stringify({
        month, teacher_ids: [...picked], entries: [...picked].map(id => ({ teacher_id: id, lop_days: lop[id] || 0 })),
      }) }));
    } catch (e: any) { setErr(e.message); }
  }

  return (
    <Shell>
      <div className="text-xs text-gray-500 mb-1">Payroll › Multiple Slips Generation</div>
      <h2 className="text-xl font-bold text-brand-700 mb-1">Multiple Slips Generation</h2>
      <div className="text-sm text-gray-500 mb-4">Creates a payslip for each selected person from their <Link className="underline" href="/payroll/structure">salary structure</Link>,
        prorated for loss-of-pay days, with PF and ESI calculated from the <Link className="underline" href="/payroll/settings">statutory settings</Link>.</div>
      <div className="card p-4 flex flex-wrap items-end gap-3 text-sm">
        <div><label className="label">Month</label><input className="input" type="month" value={month} onChange={e => setMonth(e.target.value)} /></div>
        <button className="btn btn-primary" onClick={generate}>Generate {picked.size} Slip(s)</button>
      </div>
      {err && <div className="text-red-700 text-sm my-3">{err}</div>}
      {result && (
        <div className="card p-4 my-3 text-sm bg-green-50">
          Created <b>{result.created}</b> slip(s) for {result.month}, total net pay <b>{fmtMoney(result.total_net)}</b>.
          {result.already_existed > 0 && <> {result.already_existed} already had a slip for this month and were skipped.</>}
          {result.skipped?.length > 0 && <div className="text-amber-700">Skipped: {result.skipped.join('; ')}</div>}
          <div className="mt-1"><Link className="underline" href="/payroll">View payslips</Link> · <Link className="underline" href={`/report/pay-salary?month=${result.month}`}>Salary Report</Link></div>
        </div>
      )}
      <div className="card p-4 mt-4 overflow-x-auto">
        <table className="table text-sm">
          <thead><tr>
            <th><input type="checkbox" checked={!!staff.length && picked.size === staff.length}
              onChange={e => setPicked(e.target.checked ? new Set(staff.map(s => s.teacher_id)) : new Set())} /></th>
            <th>Emp No</th><th>Name</th><th>Designation</th><th className="text-right">Monthly Gross</th><th>PF</th><th>ESI</th><th>Loss of Pay Days</th>
          </tr></thead>
          <tbody>
            {staff.map(s => (
              <tr key={s.teacher_id}>
                <td><input type="checkbox" checked={picked.has(s.teacher_id)}
                  onChange={() => setPicked(p => { const n = new Set(p); n.has(s.teacher_id) ? n.delete(s.teacher_id) : n.add(s.teacher_id); return n; })} /></td>
                <td>{s.employee_no}</td><td>{s.full_name}</td><td>{s.designation || '—'}</td>
                <td className="text-right">{fmtMoney(s.basic + s.da + s.hra + s.conveyance + s.other_allowance)}</td>
                <td>{s.pf_applicable ? 'Yes' : 'No'}</td><td>{s.esi_applicable ? 'Yes' : 'No'}</td>
                <td><input className="input w-20" type="number" min={0} step="0.5" value={lop[s.teacher_id] ?? ''} placeholder="0"
                  onChange={e => setLop(x => ({ ...x, [s.teacher_id]: e.target.value }))} /></td>
              </tr>
            ))}
            {!staff.length && <tr><td colSpan={8} className="text-center py-4 text-gray-500">No active staff have a salary structure yet. <Link className="underline" href="/payroll/structure">Set salaries</Link>.</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
