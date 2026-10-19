'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, getUser } from '@/lib/api';
import { Flash, HrHeader, useFlash } from '../_ui';

type Rules = { office_start: string; office_end: string; late_after_minutes: number; half_day_after: string; min_full_hours: number; weekly_off: string };
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'None'];

export default function AttendanceRulesPage() {
  const isAdmin = getUser<any>()?.role === 'admin';
  const [r, setR] = useState<Rules | null>(null);
  const { msg, flash } = useFlash();

  useEffect(() => { api<Rules>('/hr/attendance-rules').then(setR).catch(e => flash(e.message, false)); /* eslint-disable-next-line */ }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try { await api('/hr/attendance-rules', { method: 'PUT', body: JSON.stringify(r) }); flash('Attendance rule saved.'); }
    catch (ex: any) { flash(ex.message, false); }
  }

  if (!r) return <Shell><HrHeader title="Add Attendance Rule" /><Flash msg={msg} /></Shell>;
  const set = (k: keyof Rules) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setR({ ...r, [k]: e.target.value } as Rules);
  const lateAt = (() => {
    const [h, m] = r.office_start.split(':').map(Number);
    const t = h * 60 + m + Number(r.late_after_minutes || 0);
    return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  })();

  return (
    <Shell>
      <HrHeader title="Add Attendance Rule" subtitle="Used to mark staff late or half day from biometric punches."
        links={[{ label: 'Import biometric punches', href: '/hr/biometric-import' }]} />
      <Flash msg={msg} />
      <form onSubmit={save} className="card p-4 grid md:grid-cols-3 gap-3 text-sm max-w-4xl">
        <div><label className="label">Office Start</label><input className="input" type="time" required disabled={!isAdmin} value={r.office_start} onChange={set('office_start')} /></div>
        <div><label className="label">Office End</label><input className="input" type="time" required disabled={!isAdmin} value={r.office_end} onChange={set('office_end')} /></div>
        <div><label className="label">Weekly Off</label>
          <select className="input" disabled={!isAdmin} value={r.weekly_off} onChange={set('weekly_off')}>{DAYS.map(d => <option key={d}>{d}</option>)}</select></div>
        <div><label className="label">Late after (minutes past start)</label><input className="input" type="number" min={0} max={240} required disabled={!isAdmin} value={r.late_after_minutes} onChange={set('late_after_minutes')} /></div>
        <div><label className="label">Half day if arriving after</label><input className="input" type="time" required disabled={!isAdmin} value={r.half_day_after} onChange={set('half_day_after')} /></div>
        <div><label className="label">Minimum hours for a full day</label><input className="input" type="number" step="0.5" min={0.5} max={12} required disabled={!isAdmin} value={r.min_full_hours} onChange={set('min_full_hours')} /></div>
        <div className="md:col-span-3 text-gray-600 bg-brand-50 rounded p-3">
          Arriving by <b>{lateAt}</b> is on time. After {lateAt} is <b>Late</b>. After <b>{r.half_day_after}</b>, or working less than
          <b> {r.min_full_hours} hours</b> between first and last punch, is a <b>Half Day</b>.
        </div>
        {isAdmin && <div className="md:col-span-3"><button className="btn btn-primary">Save Rule</button></div>}
      </form>
    </Shell>
  );
}
