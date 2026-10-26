'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, localDate } from '@/lib/api';
import { Crumb, Flash, useFlash, useHostels, when } from '../_ui';

type Visitor = { id: number; hostel_name: string; student_name: string | null; admission_no: string | null; visitor_name: string; relation: string | null;
  phone: string | null; id_proof: string | null; purpose: string | null; in_time: string; out_time: string | null };
type Resident = { student_id: number; full_name: string; room_no: string; hostel_id: number };

const blank = { hostel_id: '', student_id: '', visitor_name: '', relation: '', phone: '', id_proof: '', purpose: '' };

export default function VisitorsPage() {
  const hostels = useHostels();
  const [date, setDate] = useState(localDate());
  const [rows, setRows] = useState<Visitor[]>([]);
  const [residents, setResidents] = useState<Resident[]>([]);
  const [f, setF] = useState(blank);
  const { msg, flash } = useFlash();

  const load = () => api<Visitor[]>(`/hostel-ops/visitors?date=${date}`).then(setRows).catch(e => flash(e.message, false));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [date]);
  useEffect(() => { api<Resident[]>('/hostel-ops/residents').then(setResidents).catch(() => {}); }, []);
  useEffect(() => { if (!f.hostel_id && hostels.length) setF(x => ({ ...x, hostel_id: String(hostels[0].id) })); }, [hostels, f.hostel_id]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api('/hostel-ops/visitors', { method: 'POST', body: JSON.stringify({ ...f, hostel_id: Number(f.hostel_id), student_id: Number(f.student_id) || null }) });
      setF({ ...blank, hostel_id: f.hostel_id }); flash('Visitor checked in.');
      if (date !== localDate()) setDate(localDate()); else load();
    } catch (e: any) { flash(e.message, false); }
  }
  async function checkout(v: Visitor) {
    try { await api(`/hostel-ops/visitors/${v.id}/checkout`, { method: 'POST', body: '{}' }); load(); }
    catch (e: any) { flash(e.message, false); }
  }
  const inside = rows.filter(r => !r.out_time).length;

  return (
    <Shell>
      <Crumb title="Visitors" />
      <h2 className="text-xl font-bold text-brand-700 mb-4">Hostel Visitor Log</h2>
      <Flash msg={msg} />
      <form onSubmit={add} className="card p-4 mb-4 grid md:grid-cols-4 gap-3 text-sm">
        <div><label className="label">Hostel *</label>
          <select className="input" value={f.hostel_id} onChange={e => setF({ ...f, hostel_id: e.target.value, student_id: '' })}>
            {hostels.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select></div>
        <div><label className="label">Visiting student</label>
          <select className="input" value={f.student_id} onChange={e => setF({ ...f, student_id: e.target.value })}>
            <option value="">— Not for a student —</option>
            {residents.filter(r => String(r.hostel_id) === f.hostel_id).map(r => <option key={r.student_id} value={r.student_id}>{r.full_name} (Room {r.room_no})</option>)}
          </select></div>
        <div><label className="label">Visitor name *</label><input className="input" value={f.visitor_name} onChange={e => setF({ ...f, visitor_name: e.target.value })} /></div>
        <div><label className="label">Relation</label><input className="input" value={f.relation} onChange={e => setF({ ...f, relation: e.target.value })} placeholder="Father, uncle…" /></div>
        <div><label className="label">Phone</label><input className="input" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /></div>
        <div><label className="label">ID proof</label><input className="input" value={f.id_proof} onChange={e => setF({ ...f, id_proof: e.target.value })} placeholder="Aadhaar last 4, DL…" /></div>
        <div><label className="label">Purpose</label><input className="input" value={f.purpose} onChange={e => setF({ ...f, purpose: e.target.value })} /></div>
        <div className="flex items-end"><button className="btn btn-primary w-full">Check In</button></div>
      </form>
      <div className="card p-4 overflow-x-auto">
        <div className="flex flex-wrap gap-3 items-end mb-3 text-sm">
          <div><label className="label">Date</label><input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
          <div className="text-gray-600">{rows.length} visitor(s){inside ? ` · ${inside} still inside` : ''}</div>
        </div>
        <table className="table text-sm min-w-max">
          <thead><tr><th>In</th><th>Visitor</th><th>Phone / ID</th><th>Visiting</th><th>Hostel</th><th>Purpose</th><th>Out</th></tr></thead>
          <tbody>
            {rows.map(v => (
              <tr key={v.id}>
                <td className="text-xs whitespace-nowrap">{when(v.in_time)}</td>
                <td><div className="font-medium">{v.visitor_name}</div><div className="text-xs text-gray-500">{v.relation || ''}</div></td>
                <td className="text-xs">{v.phone || '—'}<br />{v.id_proof || ''}</td>
                <td>{v.student_name || '—'}</td>
                <td>{v.hostel_name}</td>
                <td>{v.purpose || '—'}</td>
                <td className="text-xs whitespace-nowrap">{v.out_time ? when(v.out_time) : <button className="btn bg-gray-200 text-xs" onClick={() => checkout(v)}>Check Out</button>}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7} className="text-center py-6 text-gray-500">No visitors on this day.</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
