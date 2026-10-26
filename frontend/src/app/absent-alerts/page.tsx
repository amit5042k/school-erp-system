'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, fmtDateTime, getUser, localDate } from '@/lib/api';

type Settings = {
  enabled: boolean; channels: ('sms' | 'whatsapp')[]; template: string; cutoff_time: string;
  configured: { sms: boolean; whatsapp: boolean; email: boolean }; default_template: string; placeholders: string[];
};
type LogRow = { id: number; full_name: string; admission_no: string; class_name?: string; class_section?: string; phone: string | null; result: string | null; sent_by_name?: string; created_at: string };

export default function AbsentAlertsPage() {
  const isAdmin = getUser<any>()?.role === 'admin';
  const [s, setS] = useState<Settings | null>(null);
  const [preview, setPreview] = useState('');
  const [date, setDate] = useState(localDate());
  const [log, setLog] = useState<LogRow[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const flash = (text: string, ok = true) => { setMsg({ ok, text }); if (ok) setTimeout(() => setMsg(null), 4000); };

  useEffect(() => {
    if (isAdmin) api<Settings>('/absent-alerts/settings').then(setS).catch(e => flash(e.message, false));
  }, [isAdmin]);
  useEffect(() => { api<LogRow[]>(`/absent-alerts/log?date=${date}`).then(setLog).catch(e => flash(e.message, false)); }, [date]);
  useEffect(() => {
    if (!s) return;
    const t = setTimeout(() => api<{ text: string }>(`/absent-alerts/preview?template=${encodeURIComponent(s.template)}`).then(r => setPreview(r.text)).catch(() => {}), 300);
    return () => clearTimeout(t);
  }, [s?.template]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!s) return;
    try {
      setS({ ...s, ...(await api<Partial<Settings>>('/absent-alerts/settings', { method: 'PUT', body: JSON.stringify({ enabled: s.enabled, channels: s.channels, template: s.template, cutoff_time: s.cutoff_time }) })) });
      flash('Saved.');
    } catch (e: any) { flash(e.message, false); }
  }
  async function runNow() {
    if (!confirm("Send the absent alert now to parents of today's absent students who haven't been alerted yet?")) return;
    try {
      const r = await api<any>('/absent-alerts/run', { method: 'POST' });
      flash(`${r.absent} absent today · ${r.alerted || 0} alerted now${r.no_phone ? ` · ${r.no_phone} without a phone number` : ''}.`);
      setDate(localDate()); api<LogRow[]>(`/absent-alerts/log?date=${localDate()}`).then(setLog);
    } catch (e: any) { flash(e.message, false); }
  }
  const toggleCh = (c: 'sms' | 'whatsapp') => s && setS({ ...s, channels: s.channels.includes(c) ? s.channels.filter(x => x !== c) : [...s.channels, c] });

  return (
    <Shell>
      <div className="text-xs text-gray-500 mb-1">Communication › Absent Alerts</div>
      <h2 className="text-xl font-bold text-brand-700 mb-1">Absent Alerts to Parents</h2>
      <p className="text-sm text-gray-600 mb-4 max-w-3xl">When a teacher saves today&apos;s attendance, parents of students marked <b>absent</b> get a message on the student&apos;s contact number,
        once per day per student. Re-saving the sheet never sends twice. Phone app notifications for absence are sent separately.</p>
      {msg && <div className={`text-sm rounded px-3 py-2 mb-3 border ${msg.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>{msg.text}</div>}

      {isAdmin && s && (
        <div className="card p-4 mb-5 grid md:grid-cols-2 gap-4 text-sm">
          <div className="space-y-3">
            <label className="flex items-center gap-2 font-semibold">
              <input type="checkbox" checked={s.enabled} onChange={e => setS({ ...s, enabled: e.target.checked })} /> Send absent alerts automatically
            </label>
            <div>
              <div className="label">Send by</div>
              {(['sms', 'whatsapp'] as const).map(c => (
                <label key={c} className="flex items-center gap-2 mb-1">
                  <input type="checkbox" checked={s.channels.includes(c)} onChange={() => toggleCh(c)} />
                  {c === 'sms' ? 'SMS' : 'WhatsApp'}
                  {!s.configured[c] && <span className="text-[11px] text-amber-700">(not configured on the server — messages will be logged only)</span>}
                </label>
              ))}
            </div>
            <div>
              <label className="label">Don&apos;t send after (optional)</label>
              <input className="input max-w-[10rem]" type="time" value={s.cutoff_time} onChange={e => setS({ ...s, cutoff_time: e.target.value })} />
              <div className="text-[11px] text-gray-500 mt-1">E.g. 11:00, so corrections made late in the day don&apos;t alarm parents. Empty = any time.</div>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-primary" onClick={save}>Save Settings</button>
              <button className="btn bg-gray-200" onClick={runNow}>Send for today now</button>
            </div>
          </div>
          <div>
            <label className="label">Message</label>
            <textarea className="input" rows={4} maxLength={600} value={s.template} onChange={e => setS({ ...s, template: e.target.value })} />
            <div className="text-[11px] text-gray-500 mt-1">Use {s.placeholders.join(' ')} · <button className="underline" onClick={() => setS({ ...s, template: s.default_template })}>Reset to default</button></div>
            {preview && <div className="mt-2 p-2 rounded bg-gray-50 border text-xs"><b>Preview:</b> {preview}</div>}
          </div>
        </div>
      )}

      <div className="card p-4 overflow-x-auto">
        <div className="flex flex-wrap items-end justify-between gap-2 mb-3">
          <h3 className="font-semibold text-brand-700">Alerts sent</h3>
          <div><label className="label">Date</label><input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
        </div>
        <table className="table text-sm">
          <thead><tr><th>Student</th><th>Class</th><th>Phone</th><th>Result</th><th>Time</th></tr></thead>
          <tbody>
            {log.map(l => (
              <tr key={l.id}>
                <td>{l.full_name} <span className="text-xs text-gray-500">({l.admission_no})</span></td>
                <td>{l.class_name} {l.class_section}</td><td>{l.phone || '—'}</td>
                <td className="text-xs">{l.result || 'sending…'}</td><td className="text-xs whitespace-nowrap">{fmtDateTime(l.created_at)}</td>
              </tr>
            ))}
            {!log.length && <tr><td colSpan={5} className="text-center py-4 text-gray-500">No alerts on this date.</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
