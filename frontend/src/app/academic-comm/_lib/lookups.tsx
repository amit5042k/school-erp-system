'use client';

import { useEffect, useState } from 'react';
import { api, getUser } from '@/lib/api';

export type Opt = { value: string | number; label: string };
type Lists = { classes: any[]; subjects: any[]; teachers: any[]; students: any[] };

/** Loads the dropdown lists a page asks for; failures (e.g. no access) leave a list empty. */
export function useLookups(want: (keyof Lists)[]) {
  const [lists, setLists] = useState<Lists>({ classes: [], subjects: [], teachers: [], students: [] });
  const key = want.join(',');
  useEffect(() => {
    const urls: Record<keyof Lists, string> = { classes: '/classes', subjects: '/masters/subjects', teachers: '/teachers', students: '/students' };
    for (const w of key.split(',') as (keyof Lists)[]) {
      api<any[]>(urls[w]).then(rows => setLists(l => ({ ...l, [w]: rows }))).catch(() => {});
    }
  }, [key]);
  const opts = {
    classes: lists.classes.map(c => ({ value: c.id, label: `${c.name} ${c.section}` })) as Opt[],
    classNames: [...new Set(lists.classes.map(c => c.name as string))].map(n => ({ value: n, label: n })) as Opt[],
    subjects: lists.subjects.map(s => ({ value: s.name, label: s.name })) as Opt[],
    teachers: lists.teachers.map(t => ({ value: t.id, label: `${t.full_name}${t.employee_no ? ` (${t.employee_no})` : ''}` })) as Opt[],
    students: lists.students.map(s => ({ value: s.id, label: `${s.admission_no} — ${s.full_name} (${s.class_name || ''} ${s.class_section || ''})` })) as Opt[],
  };
  return { ...lists, opts };
}

export function useRole() {
  const u = getUser<any>();
  const r: string = u?.role || '';
  return { role: r, isStaff: r === 'admin' || r === 'teacher', isAdmin: r === 'admin', userId: u?.id as number | undefined };
}

export const Breadcrumb = ({ trail }: { trail: string[] }) => <div className="text-xs text-gray-500 mb-1">{trail.join(' › ')}</div>;
