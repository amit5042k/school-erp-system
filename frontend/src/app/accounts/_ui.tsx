'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, getToken } from '@/lib/api';

export type VType = 'receipt' | 'payment' | 'contra' | 'journal';
export const VTYPES: { key: VType; label: string; hint: string }[] = [
  { key: 'receipt', label: 'Receipt', hint: 'Money received into Cash or Bank' },
  { key: 'payment', label: 'Payment', hint: 'Money paid out of Cash or Bank' },
  { key: 'contra', label: 'Contra', hint: 'Cash deposited, withdrawn or moved between banks' },
  { key: 'journal', label: 'Journal', hint: 'Adjustments with no cash or bank, e.g. bills payable' },
];
export const vtypeLabel = (t: string) => VTYPES.find(v => v.key === t)?.label || t;

export type Ledger = {
  id: number; name: string; group_id: number; group_name: string; nature: 'asset' | 'liability' | 'income' | 'expense';
  kind: 'cash' | 'bank' | null; opening_balance: number; opening_type: 'Dr' | 'Cr'; balance: number; balance_text: string;
  gstin?: string | null; pan?: string | null; bank_account?: string | null; ifsc?: string | null; notes?: string | null;
  system_key?: string | null; active: number; in_use: boolean;
};

export function useLedgers(all = false) {
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const reload = useCallback(() => api<Ledger[]>(`/accounts/ledgers${all ? '?all=1' : ''}`).then(setLedgers).catch(() => {}), [all]);
  useEffect(() => { reload(); }, [reload]);
  return { ledgers, reload };
}

export function useFlash() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const flash = (text: string, ok = true) => {
    setMsg({ ok, text });
    if (ok) setTimeout(() => setMsg(m => (m && m.text === text ? null : m)), 4000);
    else if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  return { msg, flash };
}

export function Flash({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return (
    <div className={`text-sm rounded px-3 py-2 my-3 border no-print ${msg.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
      {msg.text}
    </div>
  );
}

export function PageTitle({ crumb, title, sub, right }: { crumb: string; title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-4 no-print flex flex-wrap items-end justify-between gap-2">
      <div>
        <div className="text-xs text-gray-500 mb-1">Accounts › {crumb}</div>
        <h2 className="text-xl font-bold text-brand-700">{title}</h2>
        {sub && <div className="text-sm text-gray-500">{sub}</div>}
      </div>
      {right}
    </div>
  );
}

export const inr = (n: number | null | undefined) =>
  n == null || Number.isNaN(Number(n)) ? '—' : Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const balText = (n: number) => `₹${inr(Math.abs(n))} ${n >= 0 ? 'Dr' : 'Cr'}`;

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:5000/api';

/** Download a file from an authenticated endpoint (e.g. Tally XML). Returns response headers. */
export async function downloadFile(path: string, filename: string) {
  const res = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Download failed (${res.status})`);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  return res.headers;
}
