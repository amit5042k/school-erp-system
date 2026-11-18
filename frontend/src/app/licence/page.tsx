'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, fmtDate, fmtDateTime, getUser } from '@/lib/api';

type Status = {
  mode: string; issuer?: boolean; status?: string; trial?: boolean; readOnly: boolean; reason?: string | null;
  expires_on?: string | null; days_left?: number | null; school_name?: string | null; plan?: { name: string | null } | null;
  areas?: string[] | null; max_students?: number | null; students?: number; email?: string | null; domain?: string | null;
  last_error?: string | null; checked_at?: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  trial: 'Free trial', active: 'Active', expired: 'Expired', suspended: 'Suspended', unverified: 'Could not be verified',
};

/** This school's licence: trial days left, the plan, and the Super Admin's form to register the school's email. */
export default function LicencePage() {
  const me = getUser<any>();
  const superAdmin = (me?.baseRole || me?.role) === 'admin';
  const [s, setS] = useState<Status | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const load = () => api<Status>('/licence/status').then(x => { setS(x); setEmail(e => e || x.email || ''); }).catch(e => setMsg({ text: e.message, ok: false }));
  useEffect(() => { load(); }, []);

  async function register(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const r = await api<Status>('/licence/register', { method: 'POST', body: JSON.stringify({ email }) });
      setS(r); setMsg({ text: 'Licence activated.', ok: true });
      setTimeout(() => window.location.reload(), 1500);   // the banner at the top reads the licence when a page opens
    } catch (ex: any) { setMsg({ text: ex.message, ok: false }); load(); }
    finally { setBusy(false); }
  }
  async function checkNow() {
    setBusy(true); setMsg(null);
    try { const r = await api<Status>('/licence/check-now', { method: 'POST' }); if (s && (r.status !== s.status || r.readOnly !== s.readOnly)) window.location.reload(); else setS(r); } catch (ex: any) { setMsg({ text: ex.message, ok: false }); }
    finally { setBusy(false); }
  }

  const row = (label: string, value: React.ReactNode) => (
    <div className="flex flex-wrap gap-x-3 py-1.5 border-b last:border-0"><div className="w-40 text-gray-500">{label}</div><div className="font-medium">{value}</div></div>
  );

  return (
    <Shell>
      <h1 className="text-xl font-bold text-brand-700 mb-1">Licence</h1>
      <p className="text-sm text-gray-600 mb-4">The ERP is licensed to your school&apos;s registered email by your ERP provider.</p>
      {msg && <div className={`text-sm rounded px-3 py-2 mb-3 ${msg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</div>}
      {s && s.mode === 'unlimited' && (
        <div className="card p-4 text-sm max-w-2xl">
          {s.issuer ? <>This install is the <b>licence server</b>. Schools are licensed on the <Link className="text-brand-600 underline" href="/licences">Licences</Link> page.</>
            : 'This install has no licence limits.'}
        </div>
      )}
      {s && s.mode !== 'unlimited' && (
        <div className="grid lg:grid-cols-2 gap-4 [&>*]:min-w-0">
          <div className="card p-4 text-sm">
            <h2 className="font-semibold text-brand-700 mb-2">Status</h2>
            {row('Status', <span className={s.readOnly ? 'text-red-700' : s.status === 'trial' ? 'text-amber-700' : 'text-green-700'}>
              {STATUS_LABEL[s.status || ''] || s.status}{s.readOnly ? ' — read-only' : ''}</span>)}
            {s.reason && row('Why', s.reason)}
            {s.school_name && row('Licensed to', s.school_name)}
            {s.email && row('Registered email', s.email)}
            {s.domain && row('Web address', s.domain)}
            {row(s.trial ? 'Trial ends' : 'Valid until', s.expires_on ? `${fmtDate(s.expires_on)}${s.days_left != null && s.days_left >= 0 ? ` (${s.days_left} day${s.days_left === 1 ? '' : 's'} left)` : ''}` : 'No expiry')}
            {!s.trial && row('Plan', s.plan?.name || 'All modules')}
            {!s.trial && row('Students', s.max_students ? `${s.students ?? 0} of ${s.max_students}` : `${s.students ?? 0} (no limit)`)}
            {s.checked_at && row('Last checked', fmtDateTime(s.checked_at))}
            {s.last_error && row('Last check', <span className="text-red-700">{s.last_error}</span>)}
            {s.email && superAdmin && <button className="btn bg-gray-200 mt-3" disabled={busy} onClick={checkNow}>Check now</button>}
          </div>
          <div className="card p-4 text-sm">
            <h2 className="font-semibold text-brand-700 mb-2">{s.email ? 'Change the registered email' : 'Activate your licence'}</h2>
            {superAdmin ? (
              <form onSubmit={register} className="space-y-3">
                <p className="text-gray-600">Enter the email address your ERP provider registered the licence to. The ERP checks it with the licence server
                  and shows the plan here. If the trial or licence has ended, everything stays saved and visible; changes are possible again as soon as the
                  licence is active.</p>
                <div><label className="label">Registered email</label>
                  <input className="input" type="email" required autoCapitalize="none" value={email} onChange={e => setEmail(e.target.value)} placeholder="office@yourschool.in" /></div>
                <button className="btn btn-primary" disabled={busy}>{busy ? 'Checking…' : 'Activate'}</button>
              </form>
            ) : <p className="text-gray-600">Only the Super Admin can register the licence.</p>}
          </div>
        </div>
      )}
    </Shell>
  );
}
