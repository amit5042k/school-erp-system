'use client';
import ModulePage from '@/components/ModulePage';

export default function EnquiriesPage() {
  return (
    <ModulePage
      title="Admission Enquiries"
      endpoint="/enquiries"
      searchKeys={['name','phone','class_seeking']}
      fields={[
        { name: 'name', label: 'Applicant Name', required: true },
        { name: 'parent_name', label: "Parent's Name" },
        { name: 'phone', label: 'Phone' },
        { name: 'email', label: 'Email', type: 'email' },
        { name: 'class_seeking', label: 'Class Seeking' },
        { name: 'source', label: 'Source', type: 'select', options: [
          { value: 'walk-in', label: 'Walk-in' }, { value: 'referral', label: 'Referral' },
          { value: 'website', label: 'Website' }, { value: 'advertisement', label: 'Advertisement' }] },
        { name: 'status', label: 'Status', type: 'select', options: [
          { value: 'open', label: 'Open' }, { value: 'contacted', label: 'Contacted' },
          { value: 'converted', label: 'Converted' }, { value: 'closed', label: 'Closed' }] },
        { name: 'follow_up_date', label: 'Follow-up', type: 'date' },
        { name: 'notes', label: 'Notes', type: 'textarea' },
      ]}
    />
  );
}
