'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, getUser } from '@/lib/api';
import ConfigNotice from '../comms/_lib/ConfigNotice';

type Counts = { sent: number; failed: number; not_configured: number };
type Summary = { days: number; configured: { sms: boolean; email: boolean }; sms: Counts; email: Counts; batches: number };

const QUICK_LINKS = [
  { label: 'Staff Communication', href: '/comms/compose?mode=staff', icon: '👥' },
  { label: 'Manage Staff Groups', href: '/comms/groups?kind=staff', icon: '🗂' },
  { label: 'SMS to Selected Students', href: '/comms/compose?mode=selected', icon: '✉' },
  { label: 'SMS to Many', href: '/comms/compose?mode=many', icon: '📨' },
  { label: 'Manage Student Groups', href: '/comms/groups?kind=student', icon: '🗂' },
  { label: 'SMS Classwise', href: '/comms/compose?mode=classwise', icon: '🏫' },
  { label: 'Transport Communication', href: '/comms/compose?mode=transport', icon: '🚌' },
  { label: 'Message Sent Box', href: '/comms/sent-box', icon: '📤' },
  { label: 'Message Templates', href: '/masters/message-templates', icon: '📝' },
  { label: 'Delivery Report', href: '/report/message-delivery', icon: '📊' },
  { label: 'Announcements & Circulars', href: '/announcements', icon: '📣' },
  { label: 'Send Usernames and Password', href: '/send-credentials', icon: '🔑', adminOnly: true },
];

export default function CommunicationsPage() {
  const isAdmin = getUser<any>()?.role === 'admin';
  const [days, setDays] = useState(30);
  const [s, setS] = useState<Summary | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { api<Summary>(`/comm/summary?days=${days}`).then(setS).catch(e => setErr(e.message)); }, [days]);

  const Card = ({ label, c, tone }: { label: string; c: Counts; tone: string }) => (
    <div className={`rounded border p-3 ${tone}`}>
      <div className="text-xs uppercase font-semibold">{label}</div>
      <div className="text-2xl font-bold">{c.sent}</div>
      <div className="text-xs">delivered</div>
      <div className="text-xs mt-1">{c.failed} failed · {c.not_configured} not configured</div>
    </div>
  );

  return (
    <Shell>
      <div className="text-xs text-gray-500 mb-1">Dashboard › Communication</div>
      <div className="flex items-baseline gap-3 mb-4">
        <span className="text-brand-600 text-2xl leading-none">💬</span>
        <h2 className="text-xl font-bold text-brand-700">Communication</h2>
        <span className="text-sm text-gray-500">Send & Track Messages</span>
      </div>

      <ConfigNotice status={s?.configured || null} />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
        {QUICK_LINKS.filter(q => !q.adminOnly || isAdmin).map(q => (
          <Link key={q.label} href={q.href} className="card p-4 text-sm text-left hover:bg-brand-50 border border-brand-100">
            <div className="text-brand-600 text-xl mb-1">{q.icon}</div>
            <div className="font-semibold text-brand-700 leading-tight">{q.label}</div>
          </Link>
        ))}
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-brand-700">Sent SMS / Email Summary{!isAdmin && ' (sent by me)'}</h3>
          <select className="input max-w-[10rem]" value={days} onChange={e => setDays(Number(e.target.value))}>
            <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={365}>Last 12 months</option>
          </select>
        </div>
        {err && <div className="text-red-700 text-sm mb-2">{err}</div>}
        {s && (
          <div className="grid sm:grid-cols-3 gap-3">
            <Card label="SMS" c={s.sms} tone="border-brand-100 bg-brand-50 text-brand-700" />
            <Card label="Email" c={s.email} tone="border-amber-100 bg-amber-50 text-amber-800" />
            <div className="rounded border border-green-100 bg-green-50 p-3 text-green-800">
              <div className="text-xs uppercase font-semibold">Messages sent out</div>
              <div className="text-2xl font-bold">{s.batches}</div>
              <div className="text-xs">batches · <Link href="/comms/sent-box" className="underline">open Sent Box</Link></div>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
