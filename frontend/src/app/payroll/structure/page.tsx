'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, fmtMoney } from '@/lib/api';

const FIELDS = [
  ['basic', 'Basic'], ['da', 'DA'], ['hra', 'HRA'], ['conveyance', 'Conveyance'], ['other_allowance', 'Other Allow.'],
  ['tds', 'TDS'], ['other_deduction', 'Other Ded.'],
] as const;

export default function SalaryStructurePage() {
  const [rows, setRows] = useState<any[]>([]);
  const [dirty, setDirty] = useState<Set<number>>(new Set());
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () => api<any[]>('/pay/structure').then(r => setRows(r.map(x => ({
    ...x, pf_applicable: x.pf_applicable ?? 1, esi_applicable: x.esi_applicable ?? 1,
  })))).catch(e => setMsg({ ok: false, text: e.message }));
  useEffect(() => { load(); }, []);

  const set = (id: number, k: string, v: any) => {
    setRows(r => r.map(x => (x.teacher_id === id ? { ...x, [k]: v } : x)));
    setDirty(d => new Set(d).add(id));
  };

  async function save() {
    const changed = rows.filter(r => dirty.has(r.teacher_id));
    if (!changed.length) return setMsg({ ok: true, text: 'No changes to save.' });
    try {
      for (const r of changed) await api(`/pay/structure/${r.teacher_id}`, { method: 'PUT', body: JSON.stringify(r) });
      setDirty(new Set()); setMsg({ ok: true, text: `Saved ${changed.length} salary structure(s).` }); load();
    } catch (e: any) { setMsg({ ok: false, text: e.message }); }
  }

  return (
    <Shell>
      <div className="text-xs text-gray-500 mb-1">Payroll › Salary Structure</div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div>
          <h2 className="text-xl font-bold text-brand-700">Salary Structure</h2>
          <div className="text-sm text-gray-500">Monthly salary components per staff member. PF is calculated on Basic + DA.</div>
        </div>
        <button className="btn btn-primary" onClick={save}>Save Changes{dirty.size ? ` (${dirty.size})` : ''}</button>
      </div>
      {msg && <div className={`text-sm mb-3 ${msg.ok ? 'text-green-700' : 'text-red-700'}`}>{msg.text}</div>}
      <div className="card p-4 overflow-x-auto">
        <table className="table text-sm min-w-max">
          <thead><tr><th>Emp No</th><th>Name</th>{FIELDS.map(([, l]) => <th key={l}>{l}</th>)}<th>PF</th><th>ESI</th><th className="text-right">Gross</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.teacher_id} className={r.status !== 'active' ? 'opacity-50' : dirty.has(r.teacher_id) ? 'bg-amber-50' : ''}>
                <td>{r.employee_no}</td><td className="whitespace-nowrap">{r.full_name}</td>
                {FIELDS.map(([k]) => (
                  <td key={k}><input className="input w-24" type="number" min={0} step="0.01" value={r[k] ?? ''} onChange={e => set(r.teacher_id, k, e.target.value)} /></td>
                ))}
                <td><input type="checkbox" checked={!!r.pf_applicable} onChange={e => set(r.teacher_id, 'pf_applicable', e.target.checked ? 1 : 0)} /></td>
                <td><input type="checkbox" checked={!!r.esi_applicable} onChange={e => set(r.teacher_id, 'esi_applicable', e.target.checked ? 1 : 0)} /></td>
                <td className="text-right">{fmtMoney(['basic', 'da', 'hra', 'conveyance', 'other_allowance'].reduce((a, k) => a + (Number(r[k]) || 0), 0))}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={12} className="text-center py-4 text-gray-500">No staff found.</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
