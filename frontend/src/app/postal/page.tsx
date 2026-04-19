'use client';
import ModulePage from '@/components/ModulePage';

export default function PostalPage() {
  return (
    <ModulePage
      title="Postal Dispatch / Receive"
      endpoint="/postal"
      searchKeys={['reference_no','to_title','from_title']}
      fields={[
        { name: 'direction', label: 'Direction', type: 'select', required: true,
          options: [{ value: 'dispatch', label: 'Dispatch' }, { value: 'receive', label: 'Receive' }] },
        { name: 'reference_no', label: 'Reference No' },
        { name: 'to_title', label: 'To (Title)' },
        { name: 'from_title', label: 'From (Title)' },
        { name: 'date', label: 'Date', type: 'date', required: true },
        { name: 'note', label: 'Note', type: 'textarea' },
      ]}
    />
  );
}
