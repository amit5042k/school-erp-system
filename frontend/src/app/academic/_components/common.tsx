'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

export type ClassRow = { id: number; name: string; section: string; strength?: number; class_teacher_id?: number | null; class_teacher_name?: string | null };
export type Student = {
  id: number; admission_no: string; full_name: string; gender?: string | null; dob?: string | null; class_id: number | null;
  class_name?: string | null; class_section?: string | null; roll_no?: number | null; father_name?: string | null;
  contact?: string | null; address?: string | null; status?: string | null; session?: string | null;
  photo_url?: string | null; blood_group?: string | null;
};

export const classLabel = (c?: { name: string; section: string } | null) => (c ? `${c.name} ${c.section}` : '—');

export function useClasses() {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const reload = useCallback(() => api<ClassRow[]>('/classes').then(setClasses).catch(() => {}), []);
  useEffect(() => { reload(); }, [reload]);
  return { classes, reload };
}

export function useStudents() {
  const [students, setStudents] = useState<Student[]>([]);
  const reload = useCallback(() => api<Student[]>('/students').then(setStudents).catch(() => {}), []);
  useEffect(() => { reload(); }, [reload]);
  return { students, reload };
}

export type Flash = { ok: boolean; text: string } | null;
export function useFlash() {
  const [msg, setMsg] = useState<Flash>(null);
  const flash = useCallback((text: string, ok = true) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 4000); }, []);
  return { msg, flash };
}

export function FlashBox({ msg }: { msg: Flash }) {
  if (!msg) return null;
  return (
    <div className={`text-sm rounded px-3 py-2 mb-3 border no-print ${msg.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
      {msg.text}
    </div>
  );
}

export function ClassSelect({ classes, value, onChange, placeholder = '-- Select Class --', filter }: {
  classes: ClassRow[]; value: string; onChange: (v: string) => void; placeholder?: string; filter?: (c: ClassRow) => boolean;
}) {
  return (
    <select className="input" value={value} onChange={e => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {classes.filter(c => !filter || filter(c)).map(c => <option key={c.id} value={c.id}>{classLabel(c)}</option>)}
    </select>
  );
}

export function PageTitle({ crumb, title, subtitle }: { crumb: string; title: string; subtitle?: string }) {
  return (
    <div className="no-print">
      <div className="text-xs text-gray-500 mb-1">{crumb}</div>
      <div className="flex flex-wrap items-baseline gap-3 mb-4">
        <h2 className="text-xl font-bold text-brand-700">{title}</h2>
        {subtitle && <span className="text-sm text-gray-500">{subtitle}</span>}
      </div>
    </div>
  );
}
