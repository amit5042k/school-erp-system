'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';
import { Notice, PageHead, useFlash } from '../_lib/shared';

type Settings = Record<string, string>;

export default function StudentProspectusSettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [next, setNext] = useState<{ admission_no: string; tc_no: string; reg_no: string } | null>(null);
  const { msg, flash } = useFlash();

  const load = () => {
    api<Settings>('/stu/settings').then(setS).catch(e => flash(e.message, false));
    api<any>('/stu/next-numbers').then(setNext).catch(() => {});
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try { setS(await api<Settings>('/stu/settings', { method: 'PUT', body: JSON.stringify(s) })); flash('Settings saved.'); load(); }
    catch (err: any) { flash(err.message, false); }
  }

  const input = (k: string, label: string, hint?: string, type = 'text') => (
    <div><label className="label">{label}</label>
      <input className="input" type={type} min={type === 'number' ? 0 : undefined} value={s?.[k] ?? ''} onChange={e => setS(x => ({ ...(x || {}), [k]: e.target.value }))} />
      {hint && <div className="text-[11px] text-gray-500 mt-1">{hint}</div>}
    </div>
  );

  return (
    <Shell>
      <PageHead crumb="Student › Student Prospectus Settings" title="Student Prospectus Settings" subtitle="Fees and number series for prospectus, registration, admission and TC">
        <Link href="/masters/student-custom-fields" className="btn bg-gray-200 text-sm">Custom Fields</Link>
        <Link href="/masters/student-documents" className="btn bg-gray-200 text-sm">Document Checklist</Link>
      </PageHead>
      <Notice msg={msg} />
      {s && (
        <form onSubmit={save} className="space-y-4 max-w-4xl">
          <section className="card p-4 grid md:grid-cols-3 gap-3 text-sm">
            <h3 className="md:col-span-3 font-semibold text-brand-700">Prospectus</h3>
            {input('prospectus_fee', 'Prospectus Fee (₹)', 'Default amount on a new prospectus.', 'number')}
            {input('prospectus_start', 'Prospectus Number Series', 'First number of the series, e.g. UE/26-27/001. New prospectus numbers continue from the last one issued.')}
          </section>
          <section className="card p-4 grid md:grid-cols-3 gap-3 text-sm">
            <h3 className="md:col-span-3 font-semibold text-brand-700">Registration</h3>
            {input('registration_fee', 'Registration Fee (₹)', 'Default fee on a new registration.', 'number')}
            {input('registration_prefix', 'Registration No Prefix', next ? `Next: ${next.reg_no}` : undefined)}
          </section>
          <section className="card p-4 grid md:grid-cols-3 gap-3 text-sm">
            <h3 className="md:col-span-3 font-semibold text-brand-700">Admission & TC</h3>
            {input('admission_prefix', 'Admission No Prefix', next ? `Next suggested: ${next.admission_no}` : undefined)}
            {input('tc_prefix', 'TC No Prefix', next ? `Next: ${next.tc_no}` : undefined)}
          </section>
          <button className="btn btn-primary">Save Settings</button>
        </form>
      )}
    </Shell>
  );
}
