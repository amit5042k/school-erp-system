'use client';
import ModulePage from '@/components/ModulePage';

export default function ExamsPage() {
  return (
    <ModulePage
      title="Examinations"
      endpoint="/exams"
      searchKeys={['name','term']}
      fields={[
        { name: 'name', label: 'Exam Name', required: true },
        { name: 'term', label: 'Term' },
        { name: 'start_date', label: 'Start Date', type: 'date' },
        { name: 'end_date', label: 'End Date', type: 'date' },
      ]}
    />
  );
}
