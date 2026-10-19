'use client';

import { useEffect, useState } from 'react';
import ModulePage from '@/components/ModulePage';
import { api, getUser } from '@/lib/api';

export default function GradesPage() {
  const isAdmin = getUser<any>()?.role === 'admin';
  const [classNames, setClassNames] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    api<{ name: string }[]>('/classes').then(r => {
      const names = Array.from(new Set(r.map(c => c.name)));
      setClassNames(names.map(n => ({ value: n, label: n })));
    }).catch(() => {});
  }, []);
  return (
    <ModulePage
      title="Scholastic Grades"
      endpoint="/exam/grades"
      canCreate={isAdmin}
      canEdit={isAdmin}
      createLabel="+ Add Grade"
      emptyText="No grade bands defined."
      fields={[
        { name: 'class_name', label: 'Applies To', type: 'select', options: classNames,
          formatter: v => v || 'All classes' },
        { name: 'min_pct', label: 'Min %', type: 'number', required: true },
        { name: 'max_pct', label: 'Max %', type: 'number', required: true },
        { name: 'grade', label: 'Grade', required: true },
        { name: 'grade_point', label: 'Grade Point', type: 'number' },
        { name: 'remark', label: 'Remark' },
      ]}
    >
      <p className="text-sm text-gray-500 mb-4 max-w-3xl">
        A percentage gets the band with the highest Min % it reaches. Leave &quot;Applies To&quot; empty for school-wide bands;
        a class with its own bands uses only those. Marks entry fills grades automatically from these bands.
      </p>
    </ModulePage>
  );
}
