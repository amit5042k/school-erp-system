'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, fmtDate } from '@/lib/api';
import { Flash, OUTPASS_UI, useFlash, when } from '../_ui';

type Mine = {
  hostel: { hostel_id: number; hostel_name: string; room_no: string } | null;
  roll_call: { date: string; session: string; status: string; remarks: string | null }[];
  menu: { meals: string[]; days: ({ day: number; name: string } & Record<string, string>)[] } | null;
  can_request_outpass: boolean;
};
type Pass = { id: number; reason: string; destination: string | null; out_at: string; expected_return_at: string; status: string; remarks: string | null; overdue: number };

const ROLL_CLS: Record<string, string> = { present: 'badge-green', late: 'badge-amber', leave: 'badge-gray', absent: 'badge-red' };
const blank = { reason: '', destination: '', escort: '', out_at: '', expected_return_at: '' };

export default function MyHostelPage() {
  const [d, setD] = useState<Mine | null>(null);
  const [passes, setPasses] = useState<Pass[]>([]);
  const [f, setF] = useState(blank);
  const [show, setShow] = useState(false);
  const { msg, flash } = useFlash();
  const loadPasses = () => api<Pass[]>('/hostel-ops/outpasses').then(setPasses).catch(() => {});
  useEffect(() => { api<Mine>('/hostel-ops/my').then(setD).catch(e => flash(e.message, false)); loadPasses(); /* eslint-disable-next-line */ }, []);

  async function request(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api('/hostel-ops/outpasses', { method: 'POST', body: JSON.stringify({ ...f,
        out_at: f.out_at && new Date(f.out_at).toISOString(), expected_return_at: f.expected_return_at && new Date(f.expected_return_at).toISOString() }) });
      setF(blank); setShow(false); flash('Out-pass requested. The warden will approve it.'); loadPasses();
    } catch (e: any) { flash(e.message, false); }
  }
  async function cancel(p: Pass) {
    if (!confirm('Cancel this out-pass?')) return;
    try { await api(`/hostel-ops/outpasses/${p.id}/action`, { method: 'POST', body: JSON.stringify({ action: 'cancel' }) }); loadPasses(); }
    catch (e: any) { flash(e.message, false); }
  }
  const todayIdx = (new Date().getDay() + 6) % 7;

  return (
    <Shell>
      <h2 className="text-xl font-bold text-brand-700 mb-4">My Hostel</h2>
      <Flash msg={msg} />
      {d && !d.hostel && <div className="card p-6 text-center text-gray-500">Not staying in a hostel at the moment.</div>}
      {d?.hostel && (
        <>
          <div className="card p-4 mb-4 flex flex-wrap justify-between gap-2 items-center">
            <div><div className="text-xs text-gray-500">Hostel</div><div className="font-semibold text-brand-700">{d.hostel.hostel_name} · Room {d.hostel.room_no}</div></div>
            {d.can_request_outpass && <button className="btn btn-primary text-sm" onClick={() => setShow(s => !s)}>{show ? 'Close' : 'Request Out-pass'}</button>}
          </div>
          {show && (
            <form onSubmit={request} className="card p-4 mb-4 grid md:grid-cols-3 gap-3 text-sm">
              <div><label className="label">Leaving *</label><input className="input" type="datetime-local" value={f.out_at} onChange={e => setF({ ...f, out_at: e.target.value })} /></div>
              <div><label className="label">Back by *</label><input className="input" type="datetime-local" value={f.expected_return_at} onChange={e => setF({ ...f, expected_return_at: e.target.value })} /></div>
              <div><label className="label">Reason *</label><input className="input" value={f.reason} onChange={e => setF({ ...f, reason: e.target.value })} /></div>
              <div><label className="label">Going to</label><input className="input" value={f.destination} onChange={e => setF({ ...f, destination: e.target.value })} /></div>
              <div><label className="label">Picked up by</label><input className="input" value={f.escort} onChange={e => setF({ ...f, escort: e.target.value })} /></div>
              <div className="flex items-end"><button className="btn btn-primary w-full">Send Request</button></div>
            </form>
          )}
          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <div className="card p-4">
              <div className="font-semibold text-brand-700 mb-2">Out-passes</div>
              {passes.map(p => {
                const st = OUTPASS_UI[p.status] || OUTPASS_UI.requested;
                return (
                  <div key={p.id} className="border-b last:border-0 py-2 text-sm">
                    <div className="flex justify-between gap-2"><span>{p.reason}</span><span><span className={`badge ${st.cls}`}>{st.label}</span>{p.overdue ? <span className="badge badge-red ml-1">Overdue</span> : null}</span></div>
                    <div className="text-xs text-gray-500">{when(p.out_at)} → {when(p.expected_return_at)}{p.remarks ? ` · ${p.remarks}` : ''}</div>
                    {['requested', 'approved'].includes(p.status) && <button className="text-xs text-red-600 hover:underline" onClick={() => cancel(p)}>Cancel</button>}
                  </div>
                );
              })}
              {!passes.length && <div className="text-sm text-gray-500">No out-passes yet.</div>}
            </div>
            <div className="card p-4">
              <div className="font-semibold text-brand-700 mb-2">Recent roll calls</div>
              <table className="table text-sm"><tbody>
                {d.roll_call.map((r, i) => (
                  <tr key={i}><td>{fmtDate(r.date)}</td><td className="capitalize">{r.session}</td><td><span className={`badge ${ROLL_CLS[r.status] || 'badge-gray'} capitalize`}>{r.status}</span></td><td className="text-xs text-gray-500">{r.remarks || ''}</td></tr>
                ))}
                {!d.roll_call.length && <tr><td className="text-gray-500">No roll calls recorded yet.</td></tr>}
              </tbody></table>
            </div>
          </div>
        </>
      )}
      {d?.menu && (
        <div className="card p-4 overflow-x-auto">
          <div className="font-semibold text-brand-700 mb-2">This week&apos;s mess menu</div>
          <table className="table text-sm min-w-max">
            <thead><tr><th>Day</th>{d.menu.meals.map(m => <th key={m} className="capitalize">{m}</th>)}</tr></thead>
            <tbody>{d.menu.days.map(day => (
              <tr key={day.day} className={day.day === todayIdx ? 'bg-brand-50' : ''}>
                <td className="font-medium">{day.name}</td>{d.menu!.meals.map(m => <td key={m} className="whitespace-pre-wrap">{day[m] || '—'}</td>)}
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
