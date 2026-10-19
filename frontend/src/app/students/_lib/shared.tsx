'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';

export type ClassRow = { id: number; name: string; section: string };
export type StudentRow = {
  id: number; admission_no: string; full_name: string; gender?: string | null; dob?: string | null;
  class_id?: number | null; class_name?: string | null; class_section?: string | null; roll_no?: number | null;
  father_name?: string | null; mother_name?: string | null; contact?: string | null; email?: string | null;
  address?: string | null; status?: string | null; status_reason?: string | null; status_date?: string | null;
  admission_date?: string | null; session?: string | null; photo_url?: string | null; blood_group?: string | null;
  category?: string | null; religion?: string | null; aadhaar_no?: string | null; house?: string | null;
};

export const STATUS_LABEL: Record<string, string> = {
  active: 'Active', inactive: 'Inactive', left: 'Left', tc_issued: 'TC Issued', passed_out: 'Passed Out',
};
export const STATUS_BADGE: Record<string, string> = {
  active: 'badge-green', inactive: 'badge-amber', left: 'badge-red', tc_issued: 'badge-red', passed_out: 'badge-gray',
};
export const GENDER_LABEL: Record<string, string> = { M: 'Male', F: 'Female', O: 'Other' };

export const classLabel = (s: { class_name?: string | null; class_section?: string | null }) =>
  s.class_name ? `${s.class_name} ${s.class_section || ''}`.trim() : '—';

export function StatusBadge({ status }: { status?: string | null }) {
  const s = status || 'active';
  return <span className={`badge ${STATUS_BADGE[s] || 'badge-gray'}`}>{STATUS_LABEL[s] || s}</span>;
}

export function Notice({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return (
    <div className={`text-sm rounded px-3 py-2 mb-3 border no-print ${msg.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
      {msg.text}
    </div>
  );
}

export function useFlash() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const flash = (text: string, ok = true) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), ok ? 3500 : 6000); };
  return { msg, flash };
}

export function useClasses() {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  useEffect(() => { api<ClassRow[]>('/classes').then(setClasses).catch(() => {}); }, []);
  return classes;
}

export function useMaster(type: string) {
  const [rows, setRows] = useState<{ id: number; name: string; [k: string]: any }[]>([]);
  useEffect(() => { api<any[]>(`/masters/${type}`).then(setRows).catch(() => {}); }, [type]);
  return rows;
}

export function PageHead({ crumb, title, subtitle, children }: { crumb: string; title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2 mb-4 no-print">
      <div>
        <div className="text-xs text-gray-500 mb-1">{crumb}</div>
        <h2 className="text-xl font-bold text-brand-700">{title}</h2>
        {subtitle && <div className="text-sm text-gray-500">{subtitle}</div>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

/** Type-to-search student picker. `filter` narrows the list (e.g. only active students). */
export function StudentPicker({
  value, onChange, filter, label = 'Student', required,
}: { value: number | ''; onChange: (id: number | '', s?: StudentRow) => void; filter?: (s: StudentRow) => boolean; label?: string; required?: boolean }) {
  const [all, setAll] = useState<StudentRow[]>([]);
  const [q, setQ] = useState('');
  useEffect(() => { api<StudentRow[]>('/students').then(setAll).catch(() => {}); }, []);
  const list = useMemo(() => {
    const base = filter ? all.filter(filter) : all;
    const t = q.trim().toLowerCase();
    const matched = t ? base.filter(s => `${s.admission_no} ${s.full_name} ${s.father_name || ''}`.toLowerCase().includes(t)) : base;
    // Keep the chosen student visible even when the search text no longer matches.
    const chosen = all.find(s => s.id === value);
    return chosen && !matched.includes(chosen) ? [chosen, ...matched] : matched;
  }, [all, q, filter, value]);
  return (
    <div>
      <label className="label">{label}{required ? ' *' : ''}</label>
      <div className="flex gap-2">
        <input className="input w-32" placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} />
        <select className="input flex-1" value={value} required={required}
          onChange={e => { const id = e.target.value ? Number(e.target.value) : ''; onChange(id, all.find(s => s.id === id)); }}>
          <option value="">-- Select ({list.length}) --</option>
          {list.slice(0, 500).map(s => (
            <option key={s.id} value={s.id}>{s.admission_no} — {s.full_name}{s.class_name ? ` (${classLabel(s)})` : ''}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

/** Date written out in words, as printed on certificates: "Twelfth June Two Thousand Eleven". */
export function dateInWords(iso?: string | null) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const ord = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth', 'Eleventh', 'Twelfth',
    'Thirteenth', 'Fourteenth', 'Fifteenth', 'Sixteenth', 'Seventeenth', 'Eighteenth', 'Nineteenth', 'Twentieth', 'Twenty First',
    'Twenty Second', 'Twenty Third', 'Twenty Fourth', 'Twenty Fifth', 'Twenty Sixth', 'Twenty Seventh', 'Twenty Eighth', 'Twenty Ninth',
    'Thirtieth', 'Thirty First'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${ord[d]} ${months[m - 1]} ${numberInWords(y)}`;
}

export function numberInWords(n: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen',
    'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (x: number) => (x < 20 ? ones[x] : `${tens[Math.floor(x / 10)]}${x % 10 ? ' ' + ones[x % 10] : ''}`);
  const three = (x: number) => (x >= 100 ? `${ones[Math.floor(x / 100)]} Hundred${x % 100 ? ' ' + two(x % 100) : ''}` : two(x));
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  if (n >= 1000) { parts.push(`${three(Math.floor(n / 1000))} Thousand`); n %= 1000; }
  if (n) parts.push(three(n));
  return parts.join(' ');
}
