'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { FileLinks } from '@/components/FileUpload';
import { api, fmtDate, fmtDateTime } from '@/lib/api';
import { Flash, inr, useFlash, vtypeLabel } from '../../_ui';

// Amount in words, Indian numbering (lakh, crore).
function words(n: number): string {
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const t = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (x: number) => (x < 20 ? a[x] : `${t[Math.floor(x / 10)]}${x % 10 ? ' ' + a[x % 10] : ''}`);
  const three = (x: number) => `${x >= 100 ? a[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' : '') : ''}${x % 100 ? two(x % 100) : ''}`;
  const rupees = Math.floor(n), paise = Math.round((n - rupees) * 100);
  const parts: string[] = [];
  const crore = Math.floor(rupees / 1e7), lakh = Math.floor((rupees % 1e7) / 1e5), thousand = Math.floor((rupees % 1e5) / 1000), rest = rupees % 1000;
  if (crore) parts.push(`${three(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (rest) parts.push(three(rest));
  return `Rupees ${parts.join(' ') || 'Zero'}${paise ? ` and ${two(paise)} Paise` : ''} Only`;
}

export default function VoucherView({ params }: { params: { id: string } }) {
  const [v, setV] = useState<any>(null);
  const [reason, setReason] = useState('');
  const [showCancel, setShowCancel] = useState(false);
  const { msg, flash } = useFlash();
  const load = () => api<any>(`/accounts/vouchers/${params.id}`).then(setV).catch(e => flash(e.message, false));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [params.id]);

  async function cancel() {
    if (!reason.trim()) return flash('Give a reason for cancelling.', false);
    try { await api(`/accounts/vouchers/${params.id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }); setShowCancel(false); flash('Voucher cancelled.'); load(); }
    catch (e: any) { flash(e.message, false); }
  }

  return (
    <Shell>
      <Flash msg={msg} />
      {v && (
        <>
          <div className="flex flex-wrap gap-2 mb-4 no-print">
            <button className="btn btn-primary" onClick={() => window.print()}>Print Voucher</button>
            <Link className="btn bg-gray-200" href="/accounts/vouchers">Voucher List</Link>
            {v.status === 'active' && !v.source_type && <Link className="btn bg-gray-200" href={`/accounts/voucher?id=${v.id}`}>Edit</Link>}
            {v.status === 'active' && <button className="btn bg-red-600 text-white hover:bg-red-700" onClick={() => setShowCancel(s => !s)}>Cancel Voucher</button>}
          </div>
          {showCancel && (
            <div className="card p-4 mb-4 max-w-xl no-print text-sm">
              <label className="label">Reason for cancelling *</label>
              <input className="input mb-2" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Entered twice" />
              <p className="text-xs text-gray-500 mb-2">The voucher stays on record marked Cancelled and stops counting in books and reports.
                {v.source_type ? ' It was posted from Fees/Payroll and will not be re-posted automatically.' : ''}</p>
              <button className="btn bg-red-600 text-white hover:bg-red-700" onClick={cancel}>Confirm Cancel</button>
            </div>
          )}

          <div className="card p-6 max-w-3xl mx-auto print-avoid-break">
            <div className="text-center border-b pb-3 mb-3">
              <div className="text-lg font-bold text-brand-700">{v.school?.school_name}</div>
              {v.school?.address && <div className="text-xs text-gray-600">{v.school.address}</div>}
              <div className="mt-2 font-semibold tracking-wide">{vtypeLabel(v.vtype).toUpperCase()} VOUCHER</div>
              {v.status === 'cancelled' && <div className="mt-1 inline-block text-red-700 border border-red-400 rounded px-2 text-sm font-bold">CANCELLED</div>}
            </div>
            <div className="flex justify-between text-sm mb-3">
              <div>No: <b className="font-mono">{v.voucher_no}</b></div>
              <div>Date: <b>{fmtDate(v.date)}</b></div>
            </div>
            <table className="w-full text-sm border">
              <thead><tr className="bg-gray-100"><th className="border px-2 py-1 text-left">Particulars</th><th className="border px-2 py-1 text-right w-32">Debit ₹</th><th className="border px-2 py-1 text-right w-32">Credit ₹</th></tr></thead>
              <tbody>
                {v.lines.map((l: any) => (
                  <tr key={l.id}>
                    <td className="border px-2 py-1">{l.dr > 0 ? '' : <span className="text-gray-500">To </span>}<b>{l.ledger_name}</b>
                      <span className="text-xs text-gray-500"> ({l.group_name})</span>{l.line_narration && <div className="text-xs text-gray-600">{l.line_narration}</div>}</td>
                    <td className="border px-2 py-1 text-right">{l.dr ? inr(l.dr) : ''}</td>
                    <td className="border px-2 py-1 text-right">{l.cr ? inr(l.cr) : ''}</td>
                  </tr>
                ))}
                <tr className="font-semibold bg-gray-50"><td className="border px-2 py-1 text-right">Total</td><td className="border px-2 py-1 text-right">{inr(v.total)}</td><td className="border px-2 py-1 text-right">{inr(v.total)}</td></tr>
              </tbody>
            </table>
            <div className="text-sm italic mt-2">{words(v.total)}</div>
            {v.narration && <div className="text-sm mt-2"><b>Narration:</b> {v.narration}</div>}
            {v.reference && <div className="text-sm"><b>Reference:</b> {v.reference}</div>}
            {v.attachment_url && <div className="text-sm no-print"><b>Attachment:</b> <FileLinks value={v.attachment_url} /></div>}
            {v.status === 'cancelled' && <div className="text-sm text-red-700 mt-2">Cancelled {fmtDateTime(v.cancelled_at)} by {v.cancelled_by_name || '—'}: {v.cancel_reason}</div>}
            <div className="grid grid-cols-3 gap-6 text-xs text-gray-600 mt-12 text-center">
              <div className="border-t pt-1">Prepared by {v.created_by_name || (v.source_type ? 'System (auto)' : '')}</div>
              <div className="border-t pt-1">Checked by</div>
              <div className="border-t pt-1">Authorised Signatory</div>
            </div>
          </div>

          {v.audit?.length > 0 && (
            <div className="card p-4 max-w-3xl mx-auto mt-4 no-print text-sm">
              <div className="font-semibold text-brand-700 mb-2">History</div>
              <ul className="space-y-1">{v.audit.map((a: any, i: number) => <li key={i}>{fmtDateTime(a.at)} — {a.action} by {a.by_name || '—'}</li>)}</ul>
            </div>
          )}
        </>
      )}
    </Shell>
  );
}
