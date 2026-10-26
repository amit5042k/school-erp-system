'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export { Flash, useFlash, when, toLocalInput } from '../online-tests/_ui';

export type Hostel = { id: number; name: string; type?: string };

export function useHostels() {
  const [hostels, setHostels] = useState<Hostel[]>([]);
  useEffect(() => { api<Hostel[]>('/hostels').then(setHostels).catch(() => {}); }, []);
  return hostels;
}

export function Crumb({ title }: { title: string }) {
  return <div className="text-xs text-gray-500 mb-1 no-print"><Link href="/hostel" className="hover:underline">Hostel</Link> › {title}</div>;
}

export const OUTPASS_UI: Record<string, { label: string; cls: string }> = {
  requested: { label: 'Requested', cls: 'badge-amber' },
  approved: { label: 'Approved', cls: 'badge-green' },
  rejected: { label: 'Rejected', cls: 'badge-red' },
  out: { label: 'Out', cls: 'badge-amber' },
  returned: { label: 'Returned', cls: 'badge-gray' },
  cancelled: { label: 'Cancelled', cls: 'badge-gray' },
};
