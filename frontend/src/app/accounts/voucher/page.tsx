'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import Shell from '@/components/Shell';
import FileUpload, { FileLinks } from '@/components/FileUpload';
import { api, localDate } from '@/lib/api';
import { Flash, PageTitle, VTYPES, inr, useFlash, useLedgers, type Ledger, type VType } from '../_ui';

type Row = { key: number; ledger: string; dr: string; cr: string; note: string };
let seq = 1;
const blank = (): Row => ({ key: seq++, ledger: '', dr: '', cr: '', note: '' });
const n2 = (s: string) => Math.round((Number(s) || 0) * 100) / 100;

export default function VoucherEntry({ searchParams }: { searchParams: { type?: string; id?: string } }) {
  const editId = searchParams.id ? Number(searchParams.id) : null;
  const [vtype, setVtype] = useState<VType>((VTYPES.some(v => v.key === searchParams.type) ? searchParams.type : 'payment') as VType);
  const [date, setDate] = useState(localDate());
  const [number, setNumber] = useState('');
  const [reference, setReference] = useState('');
  const [narration, setNarration] = useState('');
  const [attachment, setAttachment] = useState('');
  const [rows, setRows] = useState<Row[]>([blank(), blank(), blank()]);
  const [locked, setLocked] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ id: number; voucher_no: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const { ledgers } = useLedgers();
  const { msg, flash } = useFlash();
  const refs = useRef<Record<string, HTMLInputElement | null>>({});

  const byName = useMemo(() => new Map(ledgers.map(l => [l.name.toLowerCase(), l])), [ledgers]);
  const find = (name: string): Ledger | undefined => byName.get(name.trim().toLowerCase());

  useEffect(() => {
    if (editId) return;
    api<{ voucher_no: string }>(`/accounts/next-number?vtype=${vtype}&date=${date}`).then(r => setNumber(r.voucher_no)).catch(() => setNumber(''));
  }, [vtype, date, editId, saved]);

  useEffect(() => {
    if (!editId) return;
    api<any>(`/accounts/vouchers/${editId}`).then(v => {
      setVtype(v.vtype); setDate(v.date); setNumber(v.voucher_no); setReference(v.reference || ''); setNarration(v.narration || '');
      setAttachment(v.attachment_url || '');
      setRows([...v.lines.map((l: any) => ({ key: seq++, ledger: l.ledger_name, dr: l.dr ? String(l.dr) : '', cr: l.cr ? String(l.cr) : '', note: l.line_narration || '' })), blank()]);
      if (v.status !== 'active') setLocked('This voucher is cancelled and cannot be edited.');
      else if (v.source_type) setLocked('This voucher was posted automatically from Fees or Payroll. Correct it there, or cancel it from the voucher view.');
    }).catch(e => flash(e.message, false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  const totals = useMemo(() => {
    const dr = rows.reduce((a, r) => a + n2(r.dr), 0), cr = rows.reduce((a, r) => a + n2(r.cr), 0);
    return { dr: Math.round(dr * 100) / 100, cr: Math.round(cr * 100) / 100, diff: Math.round((dr - cr) * 100) / 100 };
  }, [rows]);

  const set = (key: number, patch: Partial<Row>) => setRows(rs => {
    const next = rs.map(r => (r.key === key ? { ...r, ...patch } : r));
    // Keep one empty row at the end so the next line can be typed straight away.
    const last = next[next.length - 1];
    if (last.ledger || last.dr || last.cr) next.push(blank());
    return next;
  });
  const remove = (key: number) => setRows(rs => (rs.length > 2 ? rs.filter(r => r.key !== key) : rs.map(r => (r.key === key ? { ...blank(), key } : r))));

  // Put the remaining difference on the row, on the side that balances the voucher.
  function balanceRow(r: Row) {
    const d = totals.diff + (n2(r.cr) - n2(r.dr));
    if (!d) return;
    set(r.key, d > 0 ? { cr: String(d), dr: '' } : { dr: String(-d), cr: '' });
  }

  function focus(rowIdx: number, field: string) {
    setTimeout(() => refs.current[`${rowIdx}-${field}`]?.focus(), 0);
  }
  function onKey(e: React.KeyboardEvent, idx: number, field: 'ledger' | 'dr' | 'cr' | 'note') {
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'Enter')) { e.preventDefault(); save(); return; }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const order = ['ledger', 'dr', 'cr', 'note'] as const;
    const i = order.indexOf(field);
    if (field === 'ledger') {
      // Once earlier lines are out of balance, a new ledger usually takes the difference.
      if (find(rows[idx].ledger) && !rows[idx].dr && !rows[idx].cr && totals.diff !== 0) {
        balanceRow(rows[idx]);
        return focus(idx, totals.diff > 0 ? 'cr' : 'dr');
      }
      return focus(idx, 'dr');
    }
    if (field === 'note' || (field === 'dr' && rows[idx].dr) || field === 'cr') return focus(idx + 1, 'ledger');
    focus(idx, order[i + 1]);
  }

  async function save() {
    if (locked || busy) return;
    const used = rows.filter(r => r.ledger || r.dr || r.cr);
    const missing = used.find(r => !find(r.ledger));
    if (missing) return flash(`"${missing.ledger || '(blank)'}" is not a ledger. Pick one from the list or add it in Chart of Accounts.`, false);
    if (totals.diff !== 0) return flash(`Debit and Credit differ by ₹${inr(Math.abs(totals.diff))}.`, false);
    const body = {
      vtype, date, reference, narration, attachment_url: attachment || null,
      lines: used.map(r => ({ ledger_id: find(r.ledger)!.id, dr: n2(r.dr), cr: n2(r.cr), line_narration: r.note || null })),
    };
    setBusy(true);
    try {
      if (editId) {
        await api(`/accounts/vouchers/${editId}`, { method: 'PUT', body: JSON.stringify(body) });
        setSaved({ id: editId, voucher_no: number });
        flash(`Voucher ${number} updated.`);
      } else {
        const r = await api<{ id: number; voucher_no: string }>('/accounts/vouchers', { method: 'POST', body: JSON.stringify(body) });
        setSaved(r);
        flash(`Voucher ${r.voucher_no} saved.`);
        setRows([blank(), blank(), blank()]); setReference(''); setNarration(''); setAttachment('');
        focus(0, 'ledger');
      }
    } catch (e: any) { flash(e.message, false); }
    finally { setBusy(false); }
  }

  const hint = VTYPES.find(v => v.key === vtype)?.hint;

  return (
    <Shell>
      <PageTitle crumb="Voucher Entry" title={editId ? `Edit Voucher ${number}` : `${VTYPES.find(v => v.key === vtype)?.label} Voucher`} sub={hint}
        right={<Link href="/accounts/vouchers" className="btn bg-gray-200 text-sm">Voucher List</Link>} />
      <Flash msg={msg} />
      {saved && (
        <div className="text-sm mb-3 flex flex-wrap gap-3 items-center">
          <span>Last saved: <b>{saved.voucher_no}</b></span>
          <Link className="text-brand-600 underline" href={`/accounts/vouchers/${saved.id}`}>View / Print</Link>
        </div>
      )}
      {locked && <div className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded px-3 py-2 mb-3">{locked}</div>}

      {!editId && (
        <div className="flex flex-wrap gap-2 mb-3">
          {VTYPES.map(v => (
            <button key={v.key} onClick={() => setVtype(v.key)} title={v.hint}
              className={`px-3 py-1.5 rounded text-sm border ${vtype === v.key ? 'bg-brand-600 text-white border-brand-600' : 'bg-white hover:bg-brand-50'}`}>{v.label}</button>
          ))}
        </div>
      )}

      <div className="card p-4 grid md:grid-cols-4 gap-3 text-sm mb-3">
        <div><label className="label">Voucher No</label><input className="input bg-gray-50" readOnly value={number} /></div>
        <div><label className="label">Date</label><input className="input" type="date" max={localDate()} value={date} onChange={e => setDate(e.target.value)} disabled={!!locked} /></div>
        <div className="md:col-span-2"><label className="label">Cheque / UTR / Bill Ref</label><input className="input" value={reference} onChange={e => setReference(e.target.value)} disabled={!!locked} /></div>
      </div>

      <div className="card p-4 overflow-x-auto mb-3">
        <datalist id="acc-ledgers">{ledgers.map(l => <option key={l.id} value={l.name}>{l.group_name}</option>)}</datalist>
        <table className="table text-sm min-w-[720px]">
          <thead><tr><th className="w-8">#</th><th>Ledger (type to search)</th><th className="w-36 text-right">Debit ₹</th><th className="w-36 text-right">Credit ₹</th><th>Line Note</th><th className="w-20"></th></tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const l = r.ledger ? find(r.ledger) : null;
              return (
                <tr key={r.key}>
                  <td className="text-gray-400">{i + 1}</td>
                  <td>
                    <input list="acc-ledgers" className={`input ${r.ledger && !l ? 'border-red-400' : ''}`} value={r.ledger} disabled={!!locked}
                      ref={el => { refs.current[`${i}-ledger`] = el; }} onKeyDown={e => onKey(e, i, 'ledger')}
                      onChange={e => set(r.key, { ledger: e.target.value })} placeholder={i === 0 ? (vtype === 'receipt' ? 'e.g. Cash' : vtype === 'payment' ? 'e.g. Electricity Charges' : '') : ''} />
                    {l && <div className="text-[11px] text-gray-500 mt-0.5">{l.group_name} · balance {l.balance_text}</div>}
                  </td>
                  <td><input className="input text-right" inputMode="decimal" value={r.dr} disabled={!!locked}
                    ref={el => { refs.current[`${i}-dr`] = el; }} onKeyDown={e => onKey(e, i, 'dr')}
                    onChange={e => set(r.key, { dr: e.target.value.replace(/[^0-9.]/g, ''), cr: e.target.value ? '' : r.cr })} /></td>
                  <td><input className="input text-right" inputMode="decimal" value={r.cr} disabled={!!locked}
                    ref={el => { refs.current[`${i}-cr`] = el; }} onKeyDown={e => onKey(e, i, 'cr')}
                    onChange={e => set(r.key, { cr: e.target.value.replace(/[^0-9.]/g, ''), dr: e.target.value ? '' : r.dr })} /></td>
                  <td><input className="input" value={r.note} disabled={!!locked}
                    ref={el => { refs.current[`${i}-note`] = el; }} onKeyDown={e => onKey(e, i, 'note')}
                    onChange={e => set(r.key, { note: e.target.value })} /></td>
                  <td className="whitespace-nowrap text-xs">
                    {!locked && totals.diff !== 0 && r.ledger && <button className="text-brand-600 hover:underline mr-2" onClick={() => balanceRow(r)} title="Fill the difference on this line">Balance</button>}
                    {!locked && <button className="text-red-600 hover:underline" onClick={() => remove(r.key)}>✕</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="font-semibold bg-brand-50">
              <td></td><td className="text-right">Total</td>
              <td className="text-right">₹{inr(totals.dr)}</td><td className="text-right">₹{inr(totals.cr)}</td>
              <td colSpan={2} className={totals.diff === 0 && totals.dr > 0 ? 'text-green-700' : 'text-red-700'}>
                {totals.dr === 0 ? 'Enter amounts' : totals.diff === 0 ? 'Balanced ✓' : `Difference ₹${inr(Math.abs(totals.diff))} ${totals.diff > 0 ? '(more Debit)' : '(more Credit)'}`}
              </td>
            </tr>
          </tfoot>
        </table>
        <div className="text-[11px] text-gray-500 mt-2">Enter moves to the next box · Ctrl+S saves · a {vtype === 'receipt' ? 'Receipt debits' : vtype === 'payment' ? 'Payment credits' : vtype === 'contra' ? 'Contra uses only' : 'Journal never uses'} Cash/Bank.</div>
      </div>

      <div className="card p-4 grid md:grid-cols-3 gap-3 text-sm">
        <div className="md:col-span-2"><label className="label">Narration</label>
          <textarea className="input" rows={2} value={narration} onChange={e => setNarration(e.target.value)} disabled={!!locked}
            onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'Enter')) { e.preventDefault(); save(); } }} /></div>
        <div>
          {!locked && <FileUpload label="Attach bill / receipt" onUploaded={f => setAttachment(f[0]?.url || '')} accept=".pdf,.jpg,.jpeg,.png" />}
          {attachment && <div className="text-xs mt-1">Attached: <FileLinks value={attachment} /> {!locked && <button className="text-red-600 ml-2" onClick={() => setAttachment('')}>remove</button>}</div>}
        </div>
        <div className="md:col-span-3 flex gap-2">
          <button className="btn btn-primary" onClick={save} disabled={!!locked || busy || totals.diff !== 0 || totals.dr === 0}>{busy ? 'Saving…' : editId ? 'Save Changes' : 'Save Voucher'}</button>
          {editId && <Link className="btn bg-gray-200" href={`/accounts/vouchers/${editId}`}>Back to Voucher</Link>}
        </div>
      </div>
    </Shell>
  );
}
