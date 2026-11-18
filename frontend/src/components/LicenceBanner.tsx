'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export type LicenceStatus = {
  mode: 'unlimited' | 'server' | 'file' | 'email';
  issuer?: boolean;
  trial?: boolean;
  status?: string;
  readOnly: boolean;
  reason?: string | null;
  expires_on?: string | null;
  days_left?: number | null;
  plan?: { key: string | null; name: string | null } | null;
  areas?: string[] | null;
  max_students?: number | null;
  students?: number;
};

/** Licence state for this school, or null while loading / on single-school installs without a licence. */
export function useLicence(): LicenceStatus | null {
  const [lic, setLic] = useState<LicenceStatus | null>(null);
  useEffect(() => {
    let alive = true;
    api<LicenceStatus>('/licence/status').then(l => { if (alive) setLic(l); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return lic;
}

/** Shows a warning when the licence ends within 30 days, and a red bar while the ERP is read-only. */
export default function LicenceBanner({ licence }: { licence?: LicenceStatus | null }) {
  const own = useLicence();
  const lic = licence === undefined ? own : licence;
  if (!lic || lic.mode === 'unlimited') return null;

  if (lic.readOnly) {
    return (
      <div className="bg-red-600 text-white text-sm px-4 py-2 no-print" role="alert">
        <b>Read-only:</b> {lic.reason || 'The licence is not active'}. You can view everything, but changes are disabled until the licence is renewed.{' '}
        <Link href="/licence" className="underline font-semibold">Licence</Link>
      </div>
    );
  }
  const near = lic.days_left != null && lic.days_left <= 30;
  const full = lic.max_students != null && lic.students != null && lic.students >= lic.max_students;
  if (!near && !full) return null;
  return (
    <div className="bg-amber-100 text-amber-900 border-b border-amber-200 text-sm px-4 py-2 no-print" role="status">
      {near && <span>{lic.trial ? 'Free trial' : `Licence ${lic.status === 'trial' ? 'trial ' : ''}`} ends in <b>{lic.days_left} day{lic.days_left === 1 ? '' : 's'}</b> ({lic.expires_on}).{' '}
        {lic.trial ? 'Enter your school\'s registered email to activate the licence: ' : 'Contact your ERP provider to renew. '}<Link href="/licence" className="underline font-semibold">Licence</Link> </span>}
      {full && <span>Student limit reached ({lic.students}/{lic.max_students}) for the {lic.plan?.name || 'current'} plan.</span>}
    </div>
  );
}
