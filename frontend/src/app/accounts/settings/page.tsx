'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, localDate } from '@/lib/api';
import { Flash, PageTitle, useFlash, useLedgers } from '../_ui';

type Settings = {
  company_name: string | null; company_name_effective: string; fy: string;
  auto_post_fees: number; auto_post_payroll: number; auto_post_since: string | null;
  fee_cash_ledger_id: number | null; fee_bank_ledger_id: number | null; salary_bank_ledger_id: number | null;
};

export default function AccountsSettings() {
  const [s, setS] = useState<Settings | null>(null);
  const { ledgers } = useLedgers();
  const fyStart = (() => { const t = localDate(); const y = Number(t.slice(0, 4)), m = Number(t.slice(5, 7)); return `${m >= 4 ? y : y - 1}-04-01`; })();
  const [range, setRange] = useState({ from: fyStart, to: localDate() });
  const [result, setResult] = useState<{ receipts: number; reversals: number; salaries: number; failed?: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const { msg, flash } = useFlash();

  useEffect(() => { api<Settings>('/accounts/settings').then(setS).catch(e => flash(e.message, false)); /* eslint-disable-next-line */ }, []);
  const cash = ledgers.filter(l => l.kind === 'cash');
  const cashBank = ledgers.filter(l => l.kind === 'cash' || l.kind === 'bank');

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!s) return;
    try {
      await api('/accounts/settings', { method: 'PUT', body: JSON.stringify({
        company_name: s.company_name || null, auto_post_fees: !!s.auto_post_fees, auto_post_payroll: !!s.auto_post_payroll,
        auto_post_since: s.auto_post_since || localDate(),
        fee_cash_ledger_id: Number(s.fee_cash_ledger_id), fee_bank_ledger_id: Number(s.fee_bank_ledger_id), salary_bank_ledger_id: Number(s.salary_bank_ledger_id),
      }) });
      flash('Settings saved.');
    } catch (e: any) { flash(e.message, false); }
  }
  async function sync(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setResult(null);
    try { setResult(await api('/accounts/sync', { method: 'POST', body: JSON.stringify(range) })); }
    catch (e: any) { flash(e.message, false); }
    finally { setBusy(false); }
  }

  const sel = (k: 'fee_cash_ledger_id' | 'fee_bank_ledger_id' | 'salary_bank_ledger_id', list: typeof ledgers) => s && (
    <select className="input" value={s[k] ?? ''} onChange={e => setS({ ...s, [k]: Number(e.target.value) })}>
      {list.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
    </select>
  );

  return (
    <Shell>
      <PageTitle crumb="Settings" title="Accounts Settings" sub={s ? `Current financial year ${s.fy} (April to March).` : undefined} />
      <Flash msg={msg} />
      {s && (
        <form onSubmit={save} className="card p-4 mb-4 grid md:grid-cols-2 gap-4 text-sm max-w-3xl">
          <div className="md:col-span-2"><label className="label">Company name in Tally</label>
            <input className="input" value={s.company_name || ''} placeholder={s.company_name_effective} onChange={e => setS({ ...s, company_name: e.target.value })} />
            <p className="text-xs text-gray-500 mt-1">Must match the company name open in Tally exactly. Leave blank to use the school name.</p></div>

          <div className="md:col-span-2 font-semibold text-brand-700 border-t pt-3">Automatic posting</div>
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={!!s.auto_post_fees} onChange={e => setS({ ...s, auto_post_fees: e.target.checked ? 1 : 0 })} />
            <span>Post fee receipts as Receipt vouchers<span className="block text-xs text-gray-500">Cash → Cash ledger, other modes (cheque, UPI, online) → Bank ledger, credited to the fee income ledger of each head. Cancelled or bounced receipts are reversed by a Payment voucher.</span></span></label>
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={!!s.auto_post_payroll} onChange={e => setS({ ...s, auto_post_payroll: e.target.checked ? 1 : 0 })} />
            <span>Post salaries marked paid as Payment vouchers<span className="block text-xs text-gray-500">Salaries &amp; Wages Dr, Bank Cr for the net pay; deductions go to Salary Deductions Payable.</span></span></label>
          <div><label className="label">Post automatically from</label>
            <input className="input" type="date" value={s.auto_post_since || ''} onChange={e => setS({ ...s, auto_post_since: e.target.value })} />
            <p className="text-xs text-gray-500 mt-1">Older entries are posted only through Backfill below.</p></div>
          <div />
          <div><label className="label">Cash ledger for cash fees</label>{sel('fee_cash_ledger_id', cash)}</div>
          <div><label className="label">Bank ledger for cheque / UPI / online fees</label>{sel('fee_bank_ledger_id', cashBank)}</div>
          <div><label className="label">Bank ledger for salary payments</label>{sel('salary_bank_ledger_id', cashBank)}</div>
          <div className="md:col-span-2"><button className="btn btn-primary">Save Settings</button></div>
        </form>
      )}

      <form id="sync" onSubmit={sync} className="card p-4 max-w-3xl text-sm">
        <div className="font-semibold text-brand-700 mb-1">Backfill from Fees &amp; Payroll</div>
        <p className="text-xs text-gray-500 mb-3">Posts fee receipts and paid salaries in this date range that are not yet in the books. Safe to run again; nothing is posted twice.</p>
        <div className="flex flex-wrap gap-3 items-end">
          <div><label className="label">From</label><input className="input" type="date" value={range.from} onChange={e => setRange({ ...range, from: e.target.value })} /></div>
          <div><label className="label">To</label><input className="input" type="date" value={range.to} onChange={e => setRange({ ...range, to: e.target.value })} /></div>
          <button className="btn btn-accent" disabled={busy}>{busy ? 'Posting…' : 'Post Missing Entries'}</button>
        </div>
        {result && <div className="mt-3 text-green-700">Posted {result.receipts} fee receipt(s), {result.reversals} reversal(s) and {result.salaries} salary payment(s).</div>}
        {result?.failed?.length ? <div className="mt-2 text-red-700">Could not post {result.failed.length} item(s):<ul className="list-disc ml-5">{result.failed.map(f => <li key={f}>{f}</li>)}</ul></div> : null}
      </form>
    </Shell>
  );
}
