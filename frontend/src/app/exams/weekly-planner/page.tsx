'use client';

import { useEffect, useState } from 'react';
import ModulePage from '@/components/ModulePage';
import { api, fmtDate, getUser } from '@/lib/api';

type Opt = { value: string | number; label: string };
const STATUS: Opt[] = [{ value: 'planned', label: 'Planned' }, { value: 'completed', label: 'Completed' }, { value: 'carried_over', label: 'Carried Over' }];

// Monday of the current week, as YYYY-MM-DD in local time.
function thisMonday() {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function WeeklyPlannerPage() {
  const isAdmin = getUser<any>()?.role === 'admin';
  const [classes, setClasses] = useState<Opt[]>([]);
  const [subjects, setSubjects] = useState<Opt[]>([]);
  const [teachers, setTeachers] = useState<Opt[]>([]);
  useEffect(() => {
    api<any[]>('/classes').then(r => setClasses(r.map(c => ({ value: c.id, label: `${c.name} ${c.section}` })))).catch(() => {});
    api<any[]>('/masters/subjects').then(r => setSubjects(r.map(s => ({ value: s.name, label: s.name })))).catch(() => {});
    if (isAdmin) api<any[]>('/teachers').then(r => setTeachers(r.map(t => ({ value: t.id, label: t.full_name })))).catch(() => {});
  }, [isAdmin]);

  return (
    <ModulePage
      title="Weekly Planner"
      endpoint="/exam/planner"
      canEdit
      createLabel="+ Add Week Plan"
      emptyText="No plans yet."
      searchKeys={['topic', 'subject', 'class_label', 'teacher_name']}
      initial={{ week_start: thisMonday(), status: 'planned' }}
      fields={[
        { name: 'week_start', label: 'Week Starting', type: 'date', required: true, formatter: v => fmtDate(v) },
        { name: 'class_id', label: 'Class', type: 'select', options: classes, required: true, hideInTable: true },
        { name: 'class_label', label: 'Class', hideInForm: true },
        { name: 'subject', label: 'Subject', type: 'select', options: subjects, required: true },
        ...(isAdmin ? [{ name: 'teacher_id', label: 'Teacher', type: 'select' as const, options: teachers, hideInTable: true }] : []),
        { name: 'teacher_name', label: 'Teacher', hideInForm: true },
        { name: 'topic', label: 'Topic / Chapter', required: true },
        { name: 'objectives', label: 'Learning Objectives', type: 'textarea', hideInTable: true },
        { name: 'activities', label: 'Activities', type: 'textarea', hideInTable: true },
        { name: 'homework', label: 'Homework' },
        { name: 'status', label: 'Status', type: 'select', options: STATUS },
        { name: 'remarks', label: 'Remarks', hideInTable: true },
      ]}
    >
      <p className="text-sm text-gray-500 mb-4">
        Teachers see and edit their own plans; the admin sees everyone&apos;s. <a className="text-brand-600 underline" href="/report/exam-weekly-planner">Weekly Planner Report</a>
      </p>
    </ModulePage>
  );
}
