'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';

export default function PayrollPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try { setRows(await api('/payroll')); setTeachers(await api('/teachers')); }
    catch (e: any) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const f = e.target as any;
    const basic = Number(f.basic.value) || 0;
    const allowances = Number(f.allowances.value) || 0;
    const deductions = Number(f.deductions.value) || 0;
    try {
      await api('/payroll', { method: 'POST', body: JSON.stringify({
        teacher_id: Number(f.teacher_id.value), month: f.month.value,
        basic, allowances, deductions, net_pay: basic + allowances - deductions,
      }) });
      f.reset(); load();
    } catch (e: any) { setErr(e.message); }
  }

  async function markPaid(id: number) {
    try { await api(`/payroll/${id}`, { method: 'PUT', body: JSON.stringify({ status: 'paid', paid_on: new Date().toISOString() }) }); load(); }
    catch (e: any) { setErr(e.message); }
  }

  return (
    <Shell>
      <h2 className="text-xl font-bold text-brand-700 mb-4">Payroll</h2>
      {err && <div className="text-red-700 text-sm mb-2">{err}</div>}

      <form onSubmit={add} className="card p-4 mb-4 grid md:grid-cols-5 gap-3 text-sm">
        <div><label className="label">Staff</label>
          <select className="input" name="teacher_id" required>
            <option value="">-- Select --</option>
            {teachers.map(t => <option key={t.id} value={t.id}>{t.employee_no} — {t.full_name}</option>)}
          </select></div>
        <div><label className="label">Month (YYYY-MM)</label><input className="input" name="month" placeholder="2026-04" required /></div>
        <div><label className="label">Basic</label><input className="input" name="basic" type="number" required /></div>
        <div><label className="label">Allowances</label><input className="input" name="allowances" type="number" defaultValue={0} /></div>
        <div><label className="label">Deductions</label><input className="input" name="deductions" type="number" defaultValue={0} /></div>
        <div className="md:col-span-5"><button className="btn btn-primary">Generate Payslip</button></div>
      </form>

      <div className="card p-4 overflow-x-auto">
        <table className="table"><thead><tr><th>Staff</th><th>Month</th><th>Basic</th><th>Allowances</th><th>Deductions</th><th>Net</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td>{r.employee_no} — {r.teacher_name}</td><td>{r.month}</td>
                <td>₹{r.basic}</td><td>₹{r.allowances}</td><td>₹{r.deductions}</td><td><b>₹{r.net_pay}</b></td>
                <td><span className={`badge ${r.status === 'paid' ? 'badge-green' : 'badge-amber'}`}>{r.status}</span></td>
                <td>{r.status !== 'paid' && <button onClick={() => markPaid(r.id)} className="btn btn-primary text-xs py-1">Mark Paid</button>}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={8} className="text-center py-3 text-gray-500">No payroll records.</td></tr>}
          </tbody></table>
      </div>
    </Shell>
  );
}
