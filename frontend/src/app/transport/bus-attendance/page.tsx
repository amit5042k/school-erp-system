'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, localDate } from '@/lib/api';

type Route = { id: number; name: string; vehicle_no?: string };
type Row = { student_id: number; admission_no: string; full_name: string; class: string | null; pickup_stop: string | null; status: 'present' | 'absent' | null };
type Sheet = { route: Route & { capacity?: number; driver_name?: string }; date: string; trip: string; rows: Row[] };

export default function BusAttendancePage() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [routeId, setRouteId] = useState('');
  const [date, setDate] = useState(localDate());
  const [trip, setTrip] = useState<'pickup' | 'drop'>('pickup');
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [marks, setMarks] = useState<Record<number, 'present' | 'absent'>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const flash = (text: string, ok = true) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), ok ? 3000 : 6000); };

  useEffect(() => {
    api<Route[]>('/routes').then(r => { setRoutes(r); if (r[0]) setRouteId(String(r[0].id)); }).catch(e => flash(e.message, false));
  }, []);

  useEffect(() => {
    if (!routeId) return;
    api<Sheet>(`/tr/bus-attendance?route_id=${routeId}&date=${date}&trip=${trip}`).then(s => {
      setSheet(s);
      // Unmarked students default to present so the conductor only taps the absentees.
      setMarks(Object.fromEntries(s.rows.map(r => [r.student_id, r.status || 'present'])));
    }).catch(e => flash(e.message, false));
  }, [routeId, date, trip]);

  async function save() {
    if (!sheet) return;
    try {
      const records = sheet.rows.map(r => ({ student_id: r.student_id, status: marks[r.student_id] }));
      await api('/tr/bus-attendance', { method: 'POST', body: JSON.stringify({ route_id: Number(routeId), date, trip, records }) });
      flash(`Saved ${records.length} student(s) for ${trip}.`);
      setSheet(s => s && { ...s, rows: s.rows.map(r => ({ ...r, status: marks[r.student_id] })) });
    } catch (e: any) { flash(e.message, false); }
  }

  const absent = Object.values(marks).filter(v => v === 'absent').length;
  const marked = sheet?.rows.some(r => r.status);

  return (
    <Shell>
      <div className="flex flex-wrap items-end justify-between gap-2 mb-4">
        <div>
          <div className="text-xs text-gray-500 mb-1">Transport › Bus Attendance</div>
          <h2 className="text-xl font-bold text-brand-700">Bus Attendance</h2>
          <div className="text-sm text-gray-500">Daily boarding attendance by route</div>
        </div>
        <div className="flex gap-2">
          <Link href="/transport" className="btn bg-gray-200 text-sm">Transport</Link>
          <Link href="/report/bus-attendance" className="btn bg-gray-200 text-sm">Bus Attendance Report</Link>
        </div>
      </div>
      {msg && <div className={`text-sm rounded px-3 py-2 mb-3 border ${msg.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>{msg.text}</div>}

      <div className="card p-4 mb-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div className="col-span-2"><label className="label">Route</label>
          <select className="input" value={routeId} onChange={e => setRouteId(e.target.value)}>
            {!routes.length && <option value="">No routes yet</option>}
            {routes.map(r => <option key={r.id} value={r.id}>{r.name}{r.vehicle_no ? ` (${r.vehicle_no})` : ''}</option>)}
          </select></div>
        <div><label className="label">Date</label><input className="input" type="date" max={localDate()} value={date} onChange={e => setDate(e.target.value)} /></div>
        <div><label className="label">Trip</label>
          <select className="input" value={trip} onChange={e => setTrip(e.target.value as any)}>
            <option value="pickup">Pickup (morning)</option><option value="drop">Drop (afternoon)</option>
          </select></div>
      </div>

      {sheet && (
        <div className="card p-4 overflow-x-auto">
          <div className="flex flex-wrap justify-between items-center gap-2 mb-3 text-sm">
            <div>
              <b>{sheet.rows.length}</b> student(s) · <span className="text-green-700">{sheet.rows.length - absent} present</span> · <span className="text-red-700">{absent} absent</span>
              {marked ? <span className="ml-2 badge badge-green">Already marked</span> : <span className="ml-2 badge badge-amber">Not marked yet</span>}
            </div>
            <div className="flex gap-2">
              <button className="btn bg-gray-200 text-xs" onClick={() => setMarks(Object.fromEntries(sheet.rows.map(r => [r.student_id, 'present'])))}>All Present</button>
              <button className="btn btn-primary text-sm" onClick={save} disabled={!sheet.rows.length}>Save Attendance</button>
            </div>
          </div>
          <table className="table text-sm">
            <thead><tr><th>Stop</th><th>Adm No</th><th>Student</th><th>Class</th><th>Present</th><th>Absent</th></tr></thead>
            <tbody>
              {sheet.rows.map(r => (
                <tr key={r.student_id} className={marks[r.student_id] === 'absent' ? 'bg-red-50' : ''}>
                  <td>{r.pickup_stop || '—'}</td><td>{r.admission_no}</td><td className="font-medium">{r.full_name}</td><td>{r.class || '—'}</td>
                  {(['present', 'absent'] as const).map(v => (
                    <td key={v}><input type="radio" name={`s${r.student_id}`} aria-label={`${r.full_name} ${v}`} checked={marks[r.student_id] === v}
                      onChange={() => setMarks(m => ({ ...m, [r.student_id]: v }))} /></td>
                  ))}
                </tr>
              ))}
              {!sheet.rows.length && <tr><td colSpan={6} className="text-center text-gray-500 py-4">No active students are assigned to this route.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
