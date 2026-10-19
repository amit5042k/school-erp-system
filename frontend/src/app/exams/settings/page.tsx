'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, getUser } from '@/lib/api';
import { Flash, PageHead, useFlash } from '../_shared';

type Settings = Record<string, string>;

export default function ExamSettingsPage() {
  const isAdmin = getUser<any>()?.role === 'admin';
  const { msg, flash } = useFlash();
  const [s, setS] = useState<Settings | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { api<Settings>('/exam/settings').then(setS).catch(e => flash(e.message, false)); }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try { await api('/exam/settings', { method: 'PUT', body: JSON.stringify(s) }); flash('Examination settings saved.'); }
    catch (ex: any) { flash(ex.message, false); }
  }

  const field = (k: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div><label className="label">{label}</label>
      <input className="input" disabled={!isAdmin} value={s?.[k] ?? ''} onChange={e => setS(x => ({ ...(x || {}), [k]: e.target.value }))} {...props} /></div>
  );

  return (
    <Shell>
      <PageHead title="Examination Settings" subtitle="Rules and wording used on report cards." />
      <Flash msg={msg} />
      {s && (
        <form onSubmit={save} className="card p-4 grid md:grid-cols-2 gap-3 text-sm max-w-3xl">
          {field('passing_pct', 'Passing Percentage (per subject)', { type: 'number', min: 0, max: 100 })}
          <div><label className="label">Show Rank on Report Card</label>
            <select className="input" disabled={!isAdmin} value={s.show_rank} onChange={e => setS({ ...s, show_rank: e.target.value })}>
              <option value="1">Yes</option><option value="0">No</option>
            </select></div>
          {field('header_text', 'Report Card Heading (blank = school name)')}
          {field('sub_header', 'Report Card Title')}
          {field('signature_1', 'Signature 1')}
          {field('signature_2', 'Signature 2')}
          {field('signature_3', 'Signature 3')}
          {field('footer_note', 'Footer Note')}
          {isAdmin && <div className="md:col-span-2"><button className="btn btn-primary">Save Settings</button></div>}
          <div className="md:col-span-2 text-xs text-gray-500 flex flex-wrap gap-4 pt-2 border-t">
            <Link className="text-brand-600 underline" href="/masters/exam-types">Exam Types / Terms</Link>
            <Link className="text-brand-600 underline" href="/exams/grades">Scholastic Grades</Link>
            <Link className="text-brand-600 underline" href="/exams/manage">Manage Exams</Link>
            <Link className="text-brand-600 underline" href="/exams/class-subjects">Class Subjects</Link>
          </div>
        </form>
      )}
    </Shell>
  );
}
