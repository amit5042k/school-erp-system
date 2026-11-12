'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, localDate } from '@/lib/api';
import { t } from '@/lib/i18n';

type Punch = { time: string; via: string };
type Day = {
  date: string; weekday: string; weekly_off: boolean; status: string | null; in_time: string | null; out_time: string | null;
  hours: number | null; late_minutes: number; source: string | null; remarks: string | null; leave_type: string | null; punches: Punch[];
};
type Data = {
  month: string; staff: { full_name: string; employee_no: string; department: string | null; designation: string | null };
  rules: { office_start: string; office_end: string; late_after_minutes: number; half_day_after: string; weekly_off: string };
  summary: { present: number; late: number; half_day: number; absent: number; leave: number; not_marked: number; hours: number };
  days: Day[];
};

const STATUS: Record<string, { label: string; cls: string }> = {
  present: { label: 'Present', cls: 'badge-green' }, late: { label: 'Late', cls: 'badge-amber' },
  half_day: { label: 'Half Day', cls: 'badge-amber' }, absent: { label: 'Absent', cls: 'badge-red' }, leave: { label: 'Leave', cls: 'badge-gray' },
};
const fmtDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

export default function MyAttendancePage() {
  const [month, setMonth] = useState(localDate().slice(0, 7));
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setErr(null);
    api<Data>(`/hr/my-attendance?month=${month}`).then(setData).catch(e => { setData(null); setErr(e.message); });
  }, [month]);

  const s = data?.summary;
  const cards = s ? [
    { label: 'Present', value: s.present, tone: 'bg-green-600' }, { label: 'Late', value: s.late, tone: 'bg-amber-600' },
    { label: 'Half Day', value: s.half_day, tone: 'bg-orange-600' }, { label: 'Absent', value: s.absent, tone: 'bg-red-600' },
    { label: 'Leave', value: s.leave, tone: 'bg-slate-500' }, { label: 'Hours worked', value: s.hours, tone: 'bg-brand-600' },
  ] : [];

  return (
    <Shell>
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
          <div>
            <div className="text-xs text-gray-500">{t('Human Resource')} › {t('My Attendance')}</div>
            <h2 className="text-xl font-bold text-brand-700">{t('My Attendance')}</h2>
            {data && <div className="text-sm text-gray-600">{data.staff.full_name} · {data.staff.employee_no}{data.staff.designation ? ` · ${data.staff.designation}` : ''}</div>}
          </div>
          <div>
            <label className="label">{t('Month')}</label>
            <input type="month" className="input" value={month} max={localDate().slice(0, 7)} onChange={e => e.target.value && setMonth(e.target.value)} />
          </div>
        </div>

        {err && <div className="text-red-700 text-sm mb-3">{err}</div>}
        {data && (
          <>
            <div className="text-xs text-gray-500 mb-3">
              {t('School timing')}: {data.rules.office_start}–{data.rules.office_end} · {t('late after')} {data.rules.late_after_minutes} {t('min')} ·
              {' '}{t('half day if in after')} {data.rules.half_day_after} · {t('weekly off')}: {data.rules.weekly_off}
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
              {cards.map(c => (
                <div key={c.label} className={`rounded-xl p-2.5 text-white ${c.tone}`}>
                  <div className="text-[10px] uppercase tracking-wide opacity-90">{t(c.label)}</div>
                  <div className="text-lg font-bold">{c.value}</div>
                </div>
              ))}
            </div>

            <div className="card p-0 overflow-x-auto">
              <table className="table min-w-full text-sm">
                <thead><tr><th>{t('Date')}</th><th>{t('In')}</th><th>{t('Out')}</th><th className="text-right">{t('Hours')}</th><th>{t('Status')}</th><th>{t('Punches')}</th></tr></thead>
                <tbody>
                  {data.days.map(d => {
                    const st = d.status ? STATUS[d.status] : null;
                    return (
                      <tr key={d.date} className={d.weekly_off && !d.status ? 'bg-gray-50 text-gray-400' : ''}>
                        <td className="whitespace-nowrap"><div className="font-medium">{fmtDay(d.date)}</div><div className="text-[11px] text-gray-500">{d.weekday}</div></td>
                        <td className="font-mono">{d.in_time || '—'}{d.late_minutes > 0 && <div className="text-[11px] text-amber-700 font-sans">{d.late_minutes} {t('min late')}</div>}</td>
                        <td className="font-mono">{d.out_time || '—'}</td>
                        <td className="text-right">{d.hours ?? '—'}</td>
                        <td>
                          {st ? <span className={`badge ${st.cls}`}>{t(st.label)}</span> : d.weekly_off ? <span className="text-xs">{t('Weekly off')}</span> : <span className="text-xs text-gray-400">{t('Not marked')}</span>}
                          {d.leave_type && <div className="text-[11px] text-gray-500">{d.leave_type}</div>}
                          {d.remarks && <div className="text-[11px] text-gray-500">{d.remarks}</div>}
                        </td>
                        <td className="text-[11px] text-gray-600">
                          {d.punches.length ? d.punches.map(p => p.time).join(', ') : d.source === 'manual' ? t('Marked by office') : '—'}
                        </td>
                      </tr>
                    );
                  })}
                  {!data.days.length && <tr><td colSpan={6} className="text-center py-6 text-gray-500">{t('No records.')}</td></tr>}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500 mt-2">{t('In and out come from the biometric device (first and last punch of the day) or from the office. If something looks wrong, tell the office so they can correct it.')}</p>
          </>
        )}
        {!data && !err && <div className="text-gray-500">{t('Loading…')}</div>}
      </div>
    </Shell>
  );
}
