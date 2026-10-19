'use client';

import { useEffect, useState } from 'react';
import ModulePage from '@/components/ModulePage';
import { api, getUser } from '@/lib/api';

export default function ManageExamsPage() {
  const isAdmin = getUser<any>()?.role === 'admin';
  const [types, setTypes] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    api<{ name: string }[]>('/masters/exam-types').then(r => setTypes(r.map(t => ({ value: t.name, label: t.name })))).catch(() => {});
  }, []);
  return (
    <ModulePage
      title="Manage Exams"
      endpoint="/exams"
      canCreate={isAdmin}
      canEdit={isAdmin}
      createLabel="+ Add Exam"
      emptyText="No exams yet."
      searchKeys={['name', 'term']}
      fields={[
        { name: 'name', label: 'Exam Name', required: true, placeholder: 'e.g. Half Yearly 2026-27' },
        { name: 'term', label: 'Exam Type / Term', type: 'select', options: types },
        { name: 'start_date', label: 'Start Date', type: 'date' },
        { name: 'end_date', label: 'End Date', type: 'date' },
      ]}
    >
      <p className="text-sm text-gray-500 mb-4">Exam types come from <a className="text-brand-600 underline" href="/masters/exam-types">Exam Types / Terms</a>.</p>
    </ModulePage>
  );
}
