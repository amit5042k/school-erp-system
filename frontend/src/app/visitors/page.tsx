'use client';
import ModulePage from '@/components/ModulePage';

export default function VisitorsPage() {
  return (
    <ModulePage
      title="Visitor Book (Front Office)"
      endpoint="/visitors"
      searchKeys={['visitor_name','phone','to_meet']}
      fields={[
        { name: 'visitor_name', label: 'Visitor Name', required: true },
        { name: 'phone', label: 'Phone' },
        { name: 'purpose', label: 'Purpose' },
        { name: 'to_meet', label: 'To Meet' },
        { name: 'id_proof', label: 'ID Proof' },
        { name: 'in_time', label: 'In Time', formatter: v => v ? new Date(v).toLocaleString() : '—' },
        { name: 'out_time', label: 'Out Time', formatter: v => v ? new Date(v).toLocaleString() : '—', hideInForm: true },
        { name: 'remarks', label: 'Remarks', type: 'textarea' },
      ]}
    />
  );
}
