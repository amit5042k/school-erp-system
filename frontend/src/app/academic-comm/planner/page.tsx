'use client';
import ModulePage from '@/components/ModulePage';
import { FileLinks } from '@/components/FileUpload';
import { useLookups, useRole } from '../_lib/lookups';

const monthLabel = (m: string) => {
  const [y, mo] = (m || '').split('-').map(Number);
  return y ? new Date(y, mo - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' }) : '—';
};

export default function PlannerPage() {
  const { isStaff } = useRole();
  const { opts } = useLookups(['classes', 'subjects']);
  return (
    <ModulePage
      title="Monthly Planner"
      endpoint="/comm/planner"
      canCreate={isStaff}
      canEdit={isStaff}
      createLabel="+ Add Monthly Plan"
      emptyText="No monthly plans yet."
      searchKeys={['month', 'subject', 'plan', 'class_name']}
      fields={[
        { name: 'month', label: 'Month', type: 'month', required: true, formatter: v => monthLabel(v) },
        { name: 'class_id', label: 'Class', type: 'select', required: true, options: opts.classes },
        { name: 'subject', label: 'Subject', type: 'select', options: opts.subjects },
        { name: 'plan', label: 'Plan', type: 'textarea', required: true, formatter: v => <div className="whitespace-pre-wrap max-w-lg text-sm">{v}</div> },
        { name: 'attachment', label: 'Attachment', type: 'file', formatter: (v, r) => <FileLinks value={v} names={r.attachment_name} /> },
      ]}
    />
  );
}
