'use client';
import ModulePage from '@/components/ModulePage';

export default function CallsPage() {
  return (
    <ModulePage
      title="Phone Call Log"
      endpoint="/calls"
      searchKeys={['caller_name','phone','purpose']}
      fields={[
        { name: 'caller_name', label: 'Caller' },
        { name: 'phone', label: 'Phone' },
        { name: 'direction', label: 'Direction', type: 'select', options: [
          { value: 'incoming', label: 'Incoming' }, { value: 'outgoing', label: 'Outgoing' }] },
        { name: 'purpose', label: 'Purpose' },
        { name: 'note', label: 'Note', type: 'textarea' },
        { name: 'call_date', label: 'Date', formatter: v => v ? new Date(v).toLocaleString() : '—', hideInForm: true },
      ]}
    />
  );
}
