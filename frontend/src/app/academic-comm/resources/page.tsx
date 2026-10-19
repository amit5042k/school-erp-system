'use client';
import ModulePage from '@/components/ModulePage';
import { FileLinks } from '@/components/FileUpload';
import { fmtDate } from '@/lib/api';
import { useLookups, useRole } from '../_lib/lookups';

export default function ResourcesPage() {
  const { isStaff } = useRole();
  const { opts } = useLookups(['classes', 'subjects']);
  return (
    <ModulePage
      title="Study Resources"
      endpoint="/comm/resources"
      canCreate={isStaff}
      canEdit={isStaff}
      createLabel="+ Upload Resource"
      emptyText="No resources uploaded yet."
      searchKeys={['title', 'subject', 'description']}
      fields={[
        { name: 'title', label: 'Title', required: true, formatter: v => <span className="font-medium">{v}</span> },
        { name: 'class_id', label: 'Class (blank = all classes)', type: 'select', options: opts.classes,
          formatter: (v, r) => (v ? `${r.class_name} ${r.class_section}` : 'All classes') },
        { name: 'subject', label: 'Subject', type: 'select', options: opts.subjects },
        { name: 'description', label: 'Description', type: 'textarea' },
        { name: 'file_url', label: 'File', type: 'file', required: true, formatter: (v, r) => <FileLinks value={v} names={r.file_name || 'Open'} /> },
        { name: 'created_at', label: 'Added', hideInForm: true, formatter: v => fmtDate(v) },
      ]}
    />
  );
}
