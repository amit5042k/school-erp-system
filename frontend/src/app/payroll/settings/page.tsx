'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';

const FIELDS: [string, string][] = [
  ['pf_employee_rate', 'Employee PF Rate (%)'], ['pf_employer_rate', 'Employer PF Rate (%) — total'], ['eps_rate', 'of which EPS (Pension) Rate (%)'],
  ['pf_wage_ceiling', 'PF Wage Ceiling (₹)'], ['esi_employee_rate', 'Employee ESI Rate (%)'], ['esi_employer_rate', 'Employer ESI Rate (%)'],
  ['esi_gross_ceiling', 'ESI Applies Up To Gross (₹)'],
];

export default function PayrollSettingsPage() {
  const [s, setS] = useState<any>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { api('/pay/settings').then(setS).catch(e => setMsg({ ok: false, text: e.message })); }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try { await api('/pay/settings', { method: 'PUT', body: JSON.stringify(s) }); setMsg({ ok: true, text: 'Settings saved. They apply to slips generated from now on.' }); }
    catch (e: any) { setMsg({ ok: false, text: e.message }); }
  }

  return (
    <Shell>
      <div className="text-xs text-gray-500 mb-1">Payroll › PF / ESI Settings</div>
      <h2 className="text-xl font-bold text-brand-700 mb-1">PF / ESI Settings</h2>
      <div className="text-sm text-gray-500 mb-4">Statutory rates used by Multiple Slips Generation and the PF and ESI reports. Check current government rates before changing.</div>
      {msg && <div className={`text-sm mb-3 ${msg.ok ? 'text-green-700' : 'text-red-700'}`}>{msg.text}</div>}
      {s && (
        <form onSubmit={save} className="card p-4 grid md:grid-cols-2 gap-3 text-sm max-w-2xl">
          {FIELDS.map(([k, l]) => (
            <div key={k}><label className="label">{l}</label>
              <input className="input" type="number" min={0} step="0.01" value={s[k]} onChange={e => setS({ ...s, [k]: e.target.value })} /></div>
          ))}
          <label className="flex items-center gap-2 md:col-span-2"><input type="checkbox" checked={!!s.pf_apply_ceiling}
            onChange={e => setS({ ...s, pf_apply_ceiling: e.target.checked ? 1 : 0 })} /> Limit PF wages to the ceiling (PF on wages above it is not deducted)</label>
          <div className="md:col-span-2"><button className="btn btn-primary">Save Settings</button></div>
        </form>
      )}
    </Shell>
  );
}
