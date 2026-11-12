'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, localDate } from '@/lib/api';
import { t } from '@/lib/i18n';

type Day = { date: string; weekday: string; in_time: string | null; out_time: string | null; punches: string[] };
type Data = { month: string; staff: { full_name: string; employee_no: string; designation: string | null }; days: Day[] };

const fmtDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

// A staff member's own in and out times (timing only; attendance itself stays with HR).
export default function MyTimingPage() {
  const [month, setMonth] = useState(localDate().slice(0, 7));
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setErr(null);
    api<Data>(`/hr/my-timing?month=${month}`).then(setData).catch(e => { setData(null); setErr(e.message); });
  }, [month]);

  return (
    <Shell>
      <div className="max-w-2xl mx-auto">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
          <div>
            <h2 className="text-xl font-bold text-brand-700">{t('My In/Out Timing')}</h2>
            {data && <div className="text-sm text-gray-600">{data.staff.full_name} · {data.staff.employee_no}{data.staff.designation ? ` · ${data.staff.designation}` : ''}</div>}
          </div>
          <div>
            <label className="label">{t('Month')}</label>
            <input type="month" className="input" value={month} max={localDate().slice(0, 7)} onChange={e => e.target.value && setMonth(e.target.value)} />
          </div>
        </div>

        {err && <div className="text-red-700 text-sm mb-3">{err}</div>}
        {data && (
          <div className="card p-0 overflow-x-auto">
            <table className="table min-w-full text-sm">
              <thead><tr><th>{t('Date')}</th><th>{t('In')}</th><th>{t('Out')}</th><th>{t('Punches')}</th></tr></thead>
              <tbody>
                {data.days.map(d => (
                  <tr key={d.date}>
                    <td className="whitespace-nowrap"><div className="font-medium">{fmtDay(d.date)}</div><div className="text-[11px] text-gray-500">{d.weekday}</div></td>
                    <td className="font-mono">{d.in_time || '—'}</td>
                    <td className="font-mono">{d.out_time || '—'}</td>
                    <td className="text-[11px] text-gray-600">{d.punches.length ? d.punches.join(', ') : '—'}</td>
                  </tr>
                ))}
                {!data.days.length && <tr><td colSpan={4} className="text-center py-6 text-gray-500">{t('No records.')}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        {!data && !err && <div className="text-gray-500">{t('Loading…')}</div>}
        {data && <p className="text-xs text-gray-500 mt-2">{t('In is your first punch of the day and Out your last. If a time looks wrong, tell the office.')}</p>}
      </div>
    </Shell>
  );
}
