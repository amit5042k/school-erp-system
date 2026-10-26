'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, localDate } from '@/lib/api';
import { Crumb, Flash, useFlash, useHostels } from '../_ui';

type Row = { student_id: number; full_name: string; admission_no: string; room_no: string; class: string | null; status: string | null;
  remarks: string | null; suggested: string; on_outpass: boolean };
const STATUSES = [['present', 'P', 'bg-green-600'], ['absent', 'A', 'bg-red-600'], ['leave', 'L', 'bg-blue-600'], ['late', 'Late', 'bg-amber-500']] as const;

export default function RollCallPage() {
  const hostels = useHostels();
  const [hostelId, setHostelId] = useState('');
  const [date, setDate] = useState(localDate());
  const [session, setSession] = useState('night');
  const [rows, setRows] = useState<Row[]>([]);
  const [marked, setMarked] = useState(false);
  const [busy, setBusy] = useState(false);
  const { msg, flash } = useFlash();

  useEffect(() => { if (!hostelId && hostels.length) setHostelId(String(hostels[0].id)); }, [hostels, hostelId]);
  useEffect(() => {
    if (!hostelId) return;
    api<{ rows: Row[]; marked: boolean }>(`/hostel-ops/roll-call?hostel_id=${hostelId}&date=${date}&session=${session}`)
      .then(r => { setRows(r.rows.map(x => ({ ...x, status: x.status || x.suggested }))); setMarked(r.marked); })
      .catch(e => flash(e.message, false));
    /* eslint-disable-next-line */
  }, [hostelId, date, session]);

  const set = (id: number, patch: Partial<Row>) => setRows(l => l.map(r => (r.student_id === id ? { ...r, ...patch } : r)));
  const count = (s: string) => rows.filter(r => r.status === s).length;

  async function save() {
    setBusy(true);
    try {
      await api('/hostel-ops/roll-call', { method: 'POST', body: JSON.stringify({ date, session, hostel_id: Number(hostelId),
        records: rows.map(r => ({ student_id: r.student_id, status: r.status, remarks: r.remarks })) }) });
      setMarked(true);
      flash('Roll call saved. Families of absent students have been notified.');
    } catch (e: any) { flash(e.message, false); }
    finally { setBusy(false); }
  }

  return (
    <Shell>
      <Crumb title="Roll Call" />
      <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
        <h2 className="text-xl font-bold text-brand-700">Hostel Roll Call</h2>
        <div className="flex gap-2 text-sm">
          <Link href="/report/hostel-roll-call" className="btn bg-gray-200 text-sm">Roll Call Report</Link>
          <Link href="/report/hostel-attendance-summary" className="btn bg-gray-200 text-sm">Monthly Summary</Link>
        </div>
      </div>
      <Flash msg={msg} />
      <div className="card p-4 mb-4 flex flex-wrap gap-3 items-end text-sm">
        <div><label className="label">Hostel</label>
          <select className="input" value={hostelId} onChange={e => setHostelId(e.target.value)}>
            {hostels.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select></div>
        <div><label className="label">Date</label><input className="input" type="date" max={localDate()} value={date} onChange={e => setDate(e.target.value)} /></div>
        <div><label className="label">Roll call</label>
          <select className="input" value={session} onChange={e => setSession(e.target.value)}>
            <option value="morning">Morning</option><option value="evening">Evening</option><option value="night">Night</option>
          </select></div>
        <button className="btn bg-gray-200" onClick={() => setRows(l => l.map(r => ({ ...r, status: r.on_outpass ? 'leave' : 'present' })))}>Mark all present</button>
        <div className="ml-auto text-xs text-gray-600">
          {marked ? <span className="badge badge-green mr-2">Saved</span> : <span className="badge badge-gray mr-2">Not saved yet</span>}
          Present {count('present')} · Absent {count('absent')} · Leave {count('leave')} · Late {count('late')}
        </div>
      </div>
      <div className="card p-4 overflow-x-auto">
        <table className="table text-sm">
          <thead><tr><th>Room</th><th>Student</th><th>Class</th><th>Status</th><th>Remarks</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.student_id}>
                <td>{r.room_no}</td>
                <td><div className="font-medium">{r.full_name}</div><div className="text-xs text-gray-500">{r.admission_no}{r.on_outpass ? ' · on out-pass' : ''}</div></td>
                <td>{r.class || '—'}</td>
                <td className="whitespace-nowrap">
                  {STATUSES.map(([s, label, on]) => (
                    <button key={s} onClick={() => set(r.student_id, { status: s })}
                      className={`px-2 py-1 mr-1 rounded text-xs font-semibold ${r.status === s ? `${on} text-white` : 'bg-gray-100 text-gray-600'}`}>{label}</button>
                  ))}
                </td>
                <td><input className="input text-xs" value={r.remarks || ''} onChange={e => set(r.student_id, { remarks: e.target.value })} /></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={5} className="text-center py-6 text-gray-500">No students are staying in this hostel.</td></tr>}
          </tbody>
        </table>
        {!!rows.length && <div className="mt-3 text-right"><button className="btn btn-primary" disabled={busy} onClick={save}>Save Roll Call</button></div>}
      </div>
    </Shell>
  );
}
