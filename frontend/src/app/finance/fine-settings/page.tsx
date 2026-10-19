'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, fmtMoney } from '@/lib/api';
import { Flash, PageTitle, useFlash } from '../_ui';

type Settings = { fine_type: 'none' | 'per_day' | 'flat'; fine_amount: number; grace_days: number; max_fine: number; receipt_prefix: string };

export default function FineSettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const { msg, flash } = useFlash();
  useEffect(() => { api<Settings>('/finance/settings').then(setS).catch(e => flash(e.message, false)); /* eslint-disable-next-line */ }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try { await api('/finance/settings', { method: 'PUT', body: JSON.stringify(s) }); flash('Fine settings saved.'); }
    catch (e: any) { flash(e.message, false); }
  }

  const example = s && s.fine_type !== 'none'
    ? (() => {
      const late = 30 - (Number(s.grace_days) || 0);
      if (late <= 0) return 'A fee paid 30 days late would have no fine (within grace days).';
      let f = s.fine_type === 'flat' ? Number(s.fine_amount) : late * Number(s.fine_amount);
      if (Number(s.max_fine) > 0) f = Math.min(f, Number(s.max_fine));
      return `Example: a fee paid 30 days after its due date gets a fine of ${fmtMoney(f)}.`;
    })() : 'No late fine is charged.';

  return (
    <Shell>
      <PageTitle crumb="Configure Fine Settings" title="Configure Fine Settings"
        sub="Late fine is calculated when collecting fees after the due date. The collector can lower it on the Fee Submission screen." />
      <Flash msg={msg} />
      {s && (
        <form onSubmit={save} className="card p-4 grid md:grid-cols-2 gap-3 text-sm max-w-2xl">
          <div><label className="label">Fine Type</label>
            <select className="input" value={s.fine_type} onChange={e => setS({ ...s, fine_type: e.target.value as Settings['fine_type'] })}>
              <option value="none">No fine</option><option value="per_day">Per day late</option><option value="flat">Flat amount once late</option>
            </select></div>
          <div><label className="label">{s.fine_type === 'flat' ? 'Fine Amount (₹)' : 'Fine Per Day (₹)'}</label>
            <input className="input" type="number" min={0} step="0.01" value={s.fine_amount} disabled={s.fine_type === 'none'} onChange={e => setS({ ...s, fine_amount: Number(e.target.value) })} /></div>
          <div><label className="label">Grace Days After Due Date</label>
            <input className="input" type="number" min={0} step="1" value={s.grace_days} disabled={s.fine_type === 'none'} onChange={e => setS({ ...s, grace_days: Number(e.target.value) })} /></div>
          <div><label className="label">Maximum Fine Per Fee (₹, 0 = no limit)</label>
            <input className="input" type="number" min={0} step="0.01" value={s.max_fine} disabled={s.fine_type === 'none'} onChange={e => setS({ ...s, max_fine: Number(e.target.value) })} /></div>
          <div><label className="label">Receipt Number Prefix</label>
            <input className="input" value={s.receipt_prefix} onChange={e => setS({ ...s, receipt_prefix: e.target.value })} /></div>
          <div className="md:col-span-2 text-gray-600">{example}</div>
          <div className="md:col-span-2"><button className="btn btn-primary">Save Settings</button></div>
        </form>
      )}
    </Shell>
  );
}
