'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export type ClassRow = { id: number; name: string; section: string };
export type StudentRow = { id: number; admission_no: string; full_name: string; class_id: number | null; class_name?: string; class_section?: string; roll_no?: number; status?: string };

export function useClassesAndStudents() {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  useEffect(() => {
    api<ClassRow[]>('/classes').then(setClasses).catch(() => {});
    api<StudentRow[]>('/students').then(setStudents).catch(() => {});
  }, []);
  return { classes, students };
}

/** Class filter + student dropdown + admission-number search. */
export function StudentPicker({ value, onChange, label = 'Student' }: { value: string; onChange: (id: string) => void; label?: string }) {
  const { classes, students } = useClassesAndStudents();
  const [classId, setClassId] = useState('');
  const [q, setQ] = useState('');
  const shown = students.filter(s =>
    (!classId || String(s.class_id) === classId) &&
    (!q || `${s.admission_no} ${s.full_name}`.toLowerCase().includes(q.toLowerCase())));
  useEffect(() => {
    if (q && shown.length === 1 && String(shown[0].id) !== value) onChange(String(shown[0].id));
  }, [q, shown, value, onChange]);
  return (
    <>
      <div><label className="label">Class</label>
        <select className="input" value={classId} onChange={e => setClassId(e.target.value)}>
          <option value="">All Classes</option>
          {classes.map(c => <option key={c.id} value={c.id}>{c.name} {c.section}</option>)}
        </select></div>
      <div><label className="label">Search (Adm No / Name)</label>
        <input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder="e.g. ADM2025001" /></div>
      <div><label className="label">{label}</label>
        <select className="input" value={value} onChange={e => onChange(e.target.value)}>
          <option value="">-- Select --</option>
          {shown.map(s => <option key={s.id} value={s.id}>{s.admission_no} — {s.full_name}{s.class_name ? ` (${s.class_name} ${s.class_section})` : ''}</option>)}
        </select></div>
    </>
  );
}

export function Flash({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return (
    <div className={`text-sm rounded px-3 py-2 my-3 border no-print ${msg.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
      {msg.text}
    </div>
  );
}

export function useFlash() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // Errors stay until the next message so they aren't missed; confirmations fade.
  const flash = (text: string, ok = true) => {
    setMsg({ ok, text });
    if (ok) setTimeout(() => setMsg(m => (m && m.text === text ? null : m)), 4000);
    else if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  return { msg, flash };
}

export function PageTitle({ crumb, title, sub }: { crumb: string; title: string; sub?: string }) {
  return (
    <div className="mb-4 no-print">
      <div className="text-xs text-gray-500 mb-1">Finance › {crumb}</div>
      <h2 className="text-xl font-bold text-brand-700">{title}</h2>
      {sub && <div className="text-sm text-gray-500">{sub}</div>}
    </div>
  );
}

export type School = { school_name?: string; address?: string; phone?: string; email?: string; website?: string; logo_url?: string };

/** Letterhead for printed receipts, ledgers and slips. */
export function Letterhead({ school, title }: { school?: School; title: string }) {
  return (
    <div className="text-center border-b pb-2 mb-3">
      <div className="text-lg font-bold text-brand-700">{school?.school_name || 'School ERP'}</div>
      {school?.address && <div className="text-xs text-gray-600">{school.address}</div>}
      {(school?.phone || school?.email) && <div className="text-xs text-gray-600">{[school?.phone, school?.email].filter(Boolean).join(' · ')}</div>}
      <div className="mt-1 text-sm font-semibold uppercase tracking-wide">{title}</div>
    </div>
  );
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen',
  'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function twoDigits(n: number) { return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`; }
function threeDigits(n: number) {
  const h = Math.floor(n / 100), r = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', r ? twoDigits(r) : ''].filter(Boolean).join(' ');
}
/** 123456.5 → "Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six and Fifty Paise Only" */
export function amountInWords(value: number) {
  const n = Math.round((Number(value) || 0) * 100);
  let rupees = Math.floor(n / 100);
  const paise = n % 100;
  if (!rupees && !paise) return 'Rupees Zero Only';
  const parts: string[] = [];
  const crore = Math.floor(rupees / 1e7); rupees %= 1e7;
  const lakh = Math.floor(rupees / 1e5); rupees %= 1e5;
  const thousand = Math.floor(rupees / 1e3); rupees %= 1e3;
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (rupees) parts.push(threeDigits(rupees));
  const r = parts.join(' ');
  return `Rupees ${r || 'Zero'}${paise ? ` and ${twoDigits(paise)} Paise` : ''} Only`;
}

export const SESSION_HINT = 'Session, e.g. 2025-26 (defaults to the academic year in School Settings)';
