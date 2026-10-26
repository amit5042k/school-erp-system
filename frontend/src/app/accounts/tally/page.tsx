'use client';

import { useState } from 'react';
import Shell from '@/components/Shell';
import { localDate } from '@/lib/api';
import { Flash, PageTitle, downloadFile, useFlash } from '../_ui';

export default function TallyExport() {
  const fyStart = (() => { const t = localDate(); const y = Number(t.slice(0, 4)), m = Number(t.slice(5, 7)); return `${m >= 4 ? y : y - 1}-04-01`; })();
  const [range, setRange] = useState({ from: fyStart, to: localDate() });
  const { msg, flash } = useFlash();

  async function vouchers() {
    try {
      const h = await downloadFile(`/accounts/tally/vouchers.xml?from=${range.from}&to=${range.to}`, `tally-vouchers-${range.from}-to-${range.to}.xml`);
      flash(`Downloaded ${h.get('X-Voucher-Count') ?? ''} voucher(s).`);
    } catch (e: any) { flash(e.message, false); }
  }
  async function masters() {
    try { await downloadFile('/accounts/tally/masters.xml', 'tally-masters.xml'); flash('Downloaded groups and ledgers.'); }
    catch (e: any) { flash(e.message, false); }
  }

  return (
    <Shell>
      <PageTitle crumb="Tally Export" title="Export to Tally" sub="Download XML files that Tally Prime / Tally ERP 9 can import." />
      <Flash msg={msg} />
      <div className="grid md:grid-cols-2 gap-4 max-w-4xl text-sm">
        <div className="card p-4">
          <div className="font-semibold text-brand-700 mb-1">1. Masters (groups &amp; ledgers)</div>
          <p className="text-xs text-gray-500 mb-3">Import once first, and again whenever you add ledgers. Includes opening balances, PAN and GSTIN.</p>
          <button className="btn btn-primary" onClick={masters}>Download Masters XML</button>
        </div>
        <div className="card p-4">
          <div className="font-semibold text-brand-700 mb-1">2. Vouchers</div>
          <p className="text-xs text-gray-500 mb-3">Active vouchers in the date range. Cancelled vouchers are left out.</p>
          <div className="flex flex-wrap gap-3 items-end">
            <div><label className="label">From</label><input className="input" type="date" value={range.from} onChange={e => setRange({ ...range, from: e.target.value })} /></div>
            <div><label className="label">To</label><input className="input" type="date" value={range.to} onChange={e => setRange({ ...range, to: e.target.value })} /></div>
            <button className="btn btn-primary" onClick={vouchers}>Download Vouchers XML</button>
          </div>
        </div>
      </div>

      <div className="card p-4 max-w-4xl mt-4 text-sm">
        <div className="font-semibold text-brand-700 mb-2">How to import in Tally Prime</div>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Open the company in Tally. Its name must match the company name in Accounts Settings.</li>
          <li>Go to <b>Import → Masters</b>, choose the Masters XML file, and accept. Select <i>Combine</i> if ledgers already exist.</li>
          <li>Go to <b>Import → Transactions</b> and choose the Vouchers XML file.</li>
          <li>Check the Day Book in Tally against the Day Book report here for the same dates.</li>
        </ol>
        <p className="text-xs text-gray-500 mt-2">In Tally ERP 9 use Gateway of Tally → Import of Data → Masters / Vouchers. Importing the same vouchers twice creates duplicates in Tally, so export each period once.</p>
      </div>
    </Shell>
  );
}
