'use client';
import ModulePage from '@/components/ModulePage';
import { FileLinks } from '@/components/FileUpload';
import { fmtDate, getUser } from '@/lib/api';

const CATEGORIES = [
  { value: 'circular', label: 'Circular' }, { value: 'syllabus', label: 'Syllabus' }, { value: 'datesheet', label: 'Datesheet' },
  { value: 'Digital Library', label: 'Digital Library' }, { value: 'form', label: 'Form' }, { value: 'other', label: 'Other' },
];
const AUDIENCES = [
  { value: 'all', label: 'All' }, { value: 'student', label: 'Students' }, { value: 'teacher', label: 'Teachers' }, { value: 'parent', label: 'Parents' },
];

export default function DocumentsPage() {
  const role = getUser<any>()?.role;
  const isStaff = role === 'admin' || role === 'teacher';
  return (
    <ModulePage
      title="Documents / Downloads"
      endpoint="/documents"
      canCreate={isStaff}
      canEdit={isStaff}
      createLabel="+ Upload Document"
      emptyText="No documents yet. Search by title, category (e.g. Digital Library) or audience."
      searchKeys={['title', 'category', 'audience']}
      fields={[
        { name: 'title', label: 'Title', required: true, formatter: v => <span className="font-medium">{v}</span> },
        { name: 'category', label: 'Category', type: 'select', options: CATEGORIES },
        { name: 'url', label: 'File', type: 'file', required: true, formatter: v => <FileLinks value={v} names="Open / Download" /> },
        { name: 'audience', label: 'Audience', type: 'select', options: AUDIENCES, hideInTable: !isStaff },
        { name: 'uploaded_at', label: 'Uploaded', formatter: v => fmtDate(v), hideInForm: true },
      ]}
    />
  );
}
