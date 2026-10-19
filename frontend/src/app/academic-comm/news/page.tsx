'use client';
import ModulePage from '@/components/ModulePage';
import { fileUrl, fmtDate } from '@/lib/api';
import { useRole } from '../_lib/lookups';

const STATE: Record<string, string> = { live: 'badge-green', scheduled: 'badge-amber', expired: 'badge-gray' };

export default function NewsPage() {
  const { isStaff } = useRole();
  return (
    <ModulePage
      title="School News"
      endpoint="/comm/news"
      canCreate={isStaff}
      canEdit={isStaff}
      createLabel="+ Add News"
      emptyText="No news yet."
      searchKeys={['title', 'body']}
      fields={[
        { name: 'image_url', label: 'Image', type: 'file',
          formatter: v => v ? <img src={fileUrl(v)} alt="" className="w-20 h-14 object-cover rounded border" /> : '—' },
        { name: 'title', label: 'Headline', required: true, formatter: v => <span className="font-medium">{v}</span> },
        { name: 'body', label: 'News', type: 'textarea', required: true, formatter: v => <div className="whitespace-pre-wrap max-w-md text-sm">{v}</div> },
        { name: 'publish_from', label: 'Publish From', type: 'date', required: true, formatter: v => fmtDate(v) },
        { name: 'publish_to', label: 'Publish Until', type: 'date', formatter: v => (v ? fmtDate(v) : 'No end') },
        { name: 'state', label: 'Status', hideInForm: true, hideInTable: !isStaff, formatter: v => <span className={`badge ${STATE[v]}`}>{v}</span> },
      ]}
    />
  );
}
