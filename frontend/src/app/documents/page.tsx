'use client';
import ModulePage from '@/components/ModulePage';

export default function DocumentsPage() {
  return (
    <ModulePage
      title="Documents / Downloads"
      endpoint="/documents"
      searchKeys={['title','category']}
      fields={[
        { name: 'title', label: 'Title', required: true },
        { name: 'category', label: 'Category', type: 'select', options: [
          { value: 'circular', label: 'Circular' }, { value: 'syllabus', label: 'Syllabus' },
          { value: 'datesheet', label: 'Datesheet' }, { value: 'form', label: 'Form' }, { value: 'other', label: 'Other' }] },
        { name: 'url', label: 'File URL', required: true, placeholder: 'https://…' },
        { name: 'audience', label: 'Audience', type: 'select', options: [
          { value: 'all', label: 'All' }, { value: 'student', label: 'Students' },
          { value: 'teacher', label: 'Teachers' }, { value: 'parent', label: 'Parents' }] },
        { name: 'uploaded_at', label: 'Uploaded', formatter: v => v ? new Date(v).toLocaleDateString() : '—', hideInForm: true },
      ]}
    />
  );
}
