'use client';
import ModulePage from '@/components/ModulePage';

export default function ComplaintsPage() {
  return (
    <ModulePage
      title="Complaints"
      endpoint="/complaints"
      searchKeys={['complainant','phone','type']}
      fields={[
        { name: 'complainant', label: 'Complainant', required: true },
        { name: 'phone', label: 'Phone' },
        { name: 'type', label: 'Type' },
        { name: 'description', label: 'Description', type: 'textarea', required: true },
        { name: 'action_taken', label: 'Action Taken', type: 'textarea' },
        { name: 'status', label: 'Status', type: 'select', options: [
          { value: 'open', label: 'Open' }, { value: 'in-progress', label: 'In Progress' }, { value: 'resolved', label: 'Resolved' }] },
      ]}
    />
  );
}
