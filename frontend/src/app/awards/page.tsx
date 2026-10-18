'use client';
import ModulePage from '@/components/ModulePage';
import { getUser } from '@/lib/api';

export default function AwardsPage() {
  const isAdmin = getUser<any>()?.role === 'admin';
  return (
    <ModulePage
      title="Awards & Recognition"
      endpoint="/awards"
      canCreate={isAdmin}
      createLabel="+ Add Award"
      emptyText="No awards recorded yet."
      searchKeys={['recipient', 'title', 'session']}
      fields={[
        { name: 'recipient', label: 'Recipient', required: true },
        { name: 'recipient_type', label: 'Type', type: 'select', options: [
          { value: 'staff', label: 'Staff' }, { value: 'student', label: 'Student' }] },
        { name: 'title', label: 'Award', required: true },
        { name: 'award_date', label: 'Date', type: 'date' },
        { name: 'session', label: 'Session', placeholder: '2026-2027' },
        { name: 'description', label: 'Description', type: 'textarea' },
      ]}
    />
  );
}
