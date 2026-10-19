'use client';
import ModulePage from '@/components/ModulePage';
import { FileLinks } from '@/components/FileUpload';
import { fmtDate } from '@/lib/api';
import { useLookups, useRole } from '../_lib/lookups';

export default function DiaryPage() {
  const { isStaff } = useRole();
  const { opts } = useLookups(['classes', 'subjects']);
  return (
    <ModulePage
      title="School Diary"
      endpoint="/comm/diary"
      canCreate={isStaff}
      canEdit={isStaff}
      createLabel="+ Add Diary Entry"
      emptyText={isStaff ? 'No diary entries yet.' : 'No diary entries for your class yet.'}
      searchKeys={['subject', 'content', 'class_name']}
      fields={[
        { name: 'entry_date', label: 'Date', type: 'date', required: true, formatter: v => fmtDate(v) },
        { name: 'class_id', label: 'Class', type: 'select', required: true, options: opts.classes, hideInTable: !isStaff },
        { name: 'subject', label: 'Subject', type: 'select', options: opts.subjects },
        { name: 'content', label: 'Diary', type: 'textarea', required: true,
          formatter: v => <div className="whitespace-pre-wrap max-w-md">{v}</div> },
        { name: 'attachment', label: 'Attachment', type: 'file', formatter: (v, r) => <FileLinks value={v} names={r.attachment_name} /> },
        { name: 'posted_by_name', label: 'Posted By', hideInForm: true },
      ]}
    />
  );
}
