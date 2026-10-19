'use client';

import { useEffect, useState } from 'react';
import ModulePage from '@/components/ModulePage';
import { api, getUser } from '@/lib/api';

type Opt = { value: string | number; label: string };

export default function StoresPage() {
  const isAdmin = getUser<any>()?.role === 'admin';
  const [types, setTypes] = useState<Opt[]>([]);
  const [cats, setCats] = useState<Opt[]>([]);
  const [staff, setStaff] = useState<Opt[]>([]);
  useEffect(() => {
    const names = (r: { name: string }[]) => r.map(x => ({ value: x.name, label: x.name }));
    api<any[]>('/masters/store-types').then(r => setTypes(names(r))).catch(() => {});
    api<any[]>('/masters/store-categories').then(r => setCats(names(r))).catch(() => {});
    api<any[]>('/teachers').then(r => setStaff(r.map(t => ({ value: t.id, label: `${t.employee_no} — ${t.full_name}` })))).catch(() => {});
  }, []);
  return (
    <ModulePage
      title="Store"
      endpoint="/inv/stores"
      canCreate={isAdmin}
      canEdit={isAdmin}
      createLabel="+ Add Store"
      emptyText="No stores yet."
      searchKeys={['name', 'location', 'incharge_name']}
      initial={{ active: 1 }}
      fields={[
        { name: 'name', label: 'Store Name', required: true },
        { name: 'store_type', label: 'Store Type', type: 'select', options: types },
        { name: 'category', label: 'Store Category', type: 'select', options: cats },
        { name: 'location', label: 'Location', placeholder: 'Block / Room' },
        { name: 'incharge_teacher_id', label: 'In-charge', type: 'select', options: staff, hideInTable: true },
        { name: 'incharge_name', label: 'In-charge', hideInForm: true },
        { name: 'item_count', label: 'Items', hideInForm: true },
        { name: 'active', label: 'Status', type: 'select', options: [{ value: 1, label: 'Active' }, { value: 0, label: 'Inactive' }],
          formatter: v => <span className={`badge ${v ? 'badge-green' : 'badge-gray'}`}>{v ? 'Active' : 'Inactive'}</span> },
        { name: 'remarks', label: 'Remarks', type: 'textarea', hideInTable: true },
      ]}
    />
  );
}
