'use client';
import ModulePage from '@/components/ModulePage';
import { FileLinks } from '@/components/FileUpload';
import { fmtDate } from '@/lib/api';
import { useLookups, useRole } from './lookups';

/** Per-student notes: teacher observations or student creative work. Students/parents see only their own. */
export default function StudentNotes({ kind }: { kind: 'observation' | 'creativity' }) {
  const { isStaff } = useRole();
  const { opts } = useLookups(isStaff ? ['students'] : []);
  const obs = kind === 'observation';
  const title = obs ? 'Student Observation' : 'Student Creativity';
  return (
    <ModulePage
      title={title}
      endpoint="/comm/student-notes"
      listQuery={`?kind=${kind}`}
      initial={{ kind }}
      canCreate={isStaff}
      canEdit={isStaff}
      createLabel={`+ Add ${title}`}
      emptyText="Nothing recorded yet."
      searchKeys={['student_name', 'admission_no', 'title', 'note']}
      fields={[
        { name: 'note_date', label: 'Date', type: 'date', required: true, formatter: v => fmtDate(v) },
        { name: 'student_id', label: 'Student', type: 'select', required: true, options: opts.students, hideInTable: true },
        { name: 'student_name', label: 'Student', hideInForm: true,
          formatter: (v, r) => <>{v} <span className="text-xs text-gray-500">({r.admission_no}, {r.class_name} {r.class_section})</span></> },
        { name: 'title', label: obs ? 'Area (e.g. Behaviour, Reading)' : 'Title of the Work', required: true },
        { name: 'note', label: obs ? 'Observation' : 'About the Work', type: 'textarea', required: obs,
          formatter: v => <div className="whitespace-pre-wrap max-w-md">{v || '—'}</div> },
        { name: 'attachment', label: obs ? 'Attachment' : 'Photo / File of the Work', type: 'file',
          formatter: (v, r) => <FileLinks value={v} names={r.attachment_name} /> },
        { name: 'posted_by_name', label: 'By', hideInForm: true },
      ]}
    />
  );
}
