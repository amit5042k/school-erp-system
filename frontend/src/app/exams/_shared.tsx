'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export type Exam = { id: number; name: string; term?: string | null; start_date?: string | null; end_date?: string | null };
export type ClassRow = { id: number; name: string; section: string; class_teacher_id?: number | null };
export type Teacher = { id: number; full_name: string; employee_no: string };

/** Exams and classes for the filter bars on every exam screen. */
export function useExamLookups() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  useEffect(() => {
    api<Exam[]>('/exams').then(setExams).catch(() => {});
    api<ClassRow[]>('/classes').then(setClasses).catch(() => {});
  }, []);
  return { exams, classes };
}

export type Msg = { ok: boolean; text: string } | null;

export function useFlash() {
  const [msg, setMsg] = useState<Msg>(null);
  const flash = (text: string, ok = true) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 3500); };
  return { msg, flash };
}

export function Flash({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <div className={`text-sm rounded px-3 py-2 mb-3 border no-print ${msg.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
      {msg.text}
    </div>
  );
}

export function PageHead({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4 no-print">
      <div className="text-xs text-gray-500 mb-1"><Link href="/exams" className="hover:underline">Examinations</Link> › {title}</div>
      <h2 className="text-xl font-bold text-brand-700">{title}</h2>
      {subtitle && <div className="text-sm text-gray-500">{subtitle}</div>}
    </div>
  );
}

export function ExamSelect({ exams, value, onChange, allowAll }: { exams: Exam[]; value: string; onChange: (v: string) => void; allowAll?: string }) {
  return (
    <select className="input" value={value} onChange={e => onChange(e.target.value)}>
      <option value="">{allowAll || '-- Select Exam --'}</option>
      {exams.map(e => <option key={e.id} value={e.id}>{e.name}{e.term ? ` (${e.term})` : ''}</option>)}
    </select>
  );
}

export function ClassSelect({ classes, value, onChange, allowAll }: { classes: ClassRow[]; value: string; onChange: (v: string) => void; allowAll?: string }) {
  return (
    <select className="input" value={value} onChange={e => onChange(e.target.value)}>
      <option value="">{allowAll || '-- Select Class --'}</option>
      {classes.map(c => <option key={c.id} value={c.id}>{c.name} {c.section}</option>)}
    </select>
  );
}

export const classLabel = (classes: ClassRow[], id: string | number) => {
  const c = classes.find(x => String(x.id) === String(id));
  return c ? `${c.name} ${c.section}` : '';
};
