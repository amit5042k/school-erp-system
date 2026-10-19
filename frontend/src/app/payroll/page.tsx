'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import ExploreOptions from '@/components/ExploreOptions';
import { FileLinks } from '@/components/FileUpload';
import { api, fmtMoney, getUser } from '@/lib/api';

export default function PayrollPage() {
  const isAdmin = getUser<any>()?.role === 'admin';
  return isAdmin ? <AdminPayroll /> : <MyPayroll />;
}

function MyPayroll() {
  const [slips, setSlips] = useState<any[]>([]);
  const [f16, setF16] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<any[]>('/pay/my-slips').then(setSlips).catch(e => setErr(e.message));
    api<any[]>('/pay/form16').then(setF16).catch(() => {});
  }, []);
  return (
    <Shell>
      <h2 className="text-xl font-bold text-brand-700 mb-4">My Payslips &amp; Form 16</h2>
      {err && <div className="text-red-700 text-sm mb-2">{err}</div>}
      <div className="card p-4 overflow-x-auto">
        <h3 className="font-semibold text-brand-700 mb-3">Payslips</h3>
        <table className="table text-sm">
          <thead><tr><th>Month</th><th className="text-right">Gross</th><th className="text-right">Deductions</th><th className="text-right">Net Pay</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {slips.map(s => (
              <tr key={s.id}><td>{s.month}</td><td className="text-right">{fmtMoney(s.basic + s.allowances)}</td><td className="text-right">{fmtMoney(s.deductions)}</td>
                <td className="text-right font-semibold">{fmtMoney(s.net_pay)}</td>
                <td><span className={`badge ${s.status === 'paid' ? 'badge-green' : 'badge-amber'}`}>{s.status}</span></td>
                <td><Link className="text-brand-600 underline text-xs" href={`/payroll/slip/${s.id}`}>View / Print</Link></td></tr>
            ))}
            {!slips.length && <tr><td colSpan={6} className="text-center py-3 text-gray-500">No payslips yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="card p-4 mt-6 overflow-x-auto">
        <h3 className="font-semibold text-brand-700 mb-3">Form 16</h3>
        <table className="table text-sm">
          <thead><tr><th>Financial Year</th><th>File</th><th>Remarks</th></tr></thead>
          <tbody>
            {f16.map(f => <tr key={f.id}><td>{f.financial_year}</td><td><FileLinks value={f.file_url} names={f.file_name} /></td><td>{f.remarks || '—'}</td></tr>)}
            {!f16.length && <tr><td colSpan={3} className="text-center py-3 text-gray-500">No Form 16 uploaded yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

function AdminPayroll() {
  const [rows, setRows] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [month, setMonth] = useState('');

  async function load() {
    try { setRows(await api('/payroll')); setTeachers(await api('/teachers')); }
    catch (e: any) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const f = e.target as any;
    try {
      await api('/payroll', { method: 'POST', body: JSON.stringify({
        teacher_id: Number(f.teacher_id.value), month: f.month.value,
        basic: Number(f.basic.value) || 0, allowances: Number(f.allowances.value) || 0, deductions: Number(f.deductions.value) || 0,
      }) });
      f.reset(); setErr(null); load();
    } catch (e: any) { setErr(e.message); }
  }

  async function markPaid(id: number) {
    try { await api('/pay/mark-paid', { method: 'POST', body: JSON.stringify({ ids: [id] }) }); load(); }
    catch (e: any) { setErr(e.message); }
  }
  async function remove(id: number) {
    if (!confirm('Delete this payslip?')) return;
    try { await api(`/payroll/${id}`, { method: 'DELETE' }); load(); } catch (e: any) { setErr(e.message); }
  }

  const shown = month ? rows.filter(r => r.month === month) : rows;

  return (
    <Shell>
      <ExploreOptions
        icon="💰"
        title="Payroll Management"
        subtitle="Salary, Slips & Statutory Reports — Explore Options"
        breadcrumb={['Dashboard', 'Payroll Management']}
        columns={3}
        groups={[
          { title: 'Salary', actions: [
            { label: 'Staff Attendance', href: '/attendance' },
            { label: 'Salary Structure', href: '/payroll/structure' },
            { label: 'Payslip', onClick: () => setShowForm(true) },
            { label: 'Multiple Slips Generation', href: '/payroll/generate' },
            { label: 'Salary Report', href: '/report/pay-salary' },
            { label: 'Employee Yearly Salary Report', href: '/report/pay-yearly-salary' },
          ]},
          { title: 'Statutory', actions: [
            { label: 'ESI Report', href: '/report/pay-esi' },
            { label: 'Monthly PF Report', href: '/report/pay-pf' },
            { label: 'Bank Statement Report', href: '/report/pay-bank-statement' },
            { label: 'Payroll Summary Report', href: '/report/pay-summary' },
            { label: 'PF / ESI Settings', href: '/payroll/settings' },
          ]},
          { title: 'Form 16', actions: [
            { label: 'Upload Form 16', href: '/payroll/form16?upload=1' },
            { label: 'Form 16 Details', href: '/payroll/form16' },
          ]},
        ]}
      />

      {err && <div className="text-red-700 text-sm mt-4">{err}</div>}

      {showForm && (
        <form onSubmit={add} className="card p-4 mt-6 mb-4 grid md:grid-cols-5 gap-3 text-sm">
          <div className="md:col-span-5 flex items-center justify-between">
            <h3 className="font-semibold text-brand-700">Generate Payslip (manual)</h3>
            <button type="button" className="text-xs text-gray-500 hover:underline" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
          <div><label className="label">Staff</label>
            <select className="input" name="teacher_id" required>
              <option value="">-- Select --</option>
              {teachers.map(t => <option key={t.id} value={t.id}>{t.employee_no} — {t.full_name}</option>)}
            </select></div>
          <div><label className="label">Month</label><input className="input" name="month" type="month" required /></div>
          <div><label className="label">Basic</label><input className="input" name="basic" type="number" min={0} step="0.01" required /></div>
          <div><label className="label">Allowances</label><input className="input" name="allowances" type="number" min={0} step="0.01" defaultValue={0} /></div>
          <div><label className="label">Deductions</label><input className="input" name="deductions" type="number" min={0} step="0.01" defaultValue={0} /></div>
          <div className="md:col-span-5 flex items-center gap-3">
            <button className="btn btn-primary">Generate Payslip</button>
            <span className="text-xs text-gray-500">To calculate PF/ESI automatically from salary structures, use <Link className="underline" href="/payroll/generate">Multiple Slips Generation</Link>.</span>
          </div>
        </form>
      )}

      <div className="card p-4 mt-6 overflow-x-auto">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="font-semibold text-brand-700">Payslips</h3>
          <div className="flex items-center gap-2 text-sm"><label>Month</label><input className="input w-40" type="month" value={month} onChange={e => setMonth(e.target.value)} /></div>
        </div>
        <table className="table"><thead><tr><th>Staff</th><th>Month</th><th className="text-right">Basic</th><th className="text-right">Allowances</th><th className="text-right">Deductions</th><th className="text-right">Net</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {shown.map(r => (
              <tr key={r.id}>
                <td>{r.employee_no} — {r.teacher_name}</td><td>{r.month}</td>
                <td className="text-right">{fmtMoney(r.basic)}</td><td className="text-right">{fmtMoney(r.allowances)}</td><td className="text-right">{fmtMoney(r.deductions)}</td>
                <td className="text-right"><b>{fmtMoney(r.net_pay)}</b></td>
                <td><span className={`badge ${r.status === 'paid' ? 'badge-green' : 'badge-amber'}`}>{r.status}</span></td>
                <td className="whitespace-nowrap text-xs">
                  <Link className="text-brand-600 hover:underline mr-2" href={`/payroll/slip/${r.id}`}>Slip</Link>
                  {r.status !== 'paid' && <button onClick={() => markPaid(r.id)} className="text-green-700 hover:underline mr-2">Mark Paid</button>}
                  {r.status !== 'paid' && <button onClick={() => remove(r.id)} className="text-red-600 hover:underline">Delete</button>}
                </td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={8} className="text-center py-3 text-gray-500">No payroll records.</td></tr>}
          </tbody></table>
      </div>
    </Shell>
  );
}
