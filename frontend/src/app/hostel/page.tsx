'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, fmtDate } from '@/lib/api';

export default function HostelPage() {
  const [tab, setTab] = useState<'hostels'|'rooms'|'allotments'>('hostels');
  const [hostels, setHostels] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [allotments, setAllotments] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      setHostels(await api('/hostels'));
      setRooms(await api('/hostel-rooms'));
      setAllotments(await api('/hostel-allotments'));
      setStudents(await api('/students'));
    } catch (e: any) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function addHostel(e: React.FormEvent) {
    e.preventDefault();
    const f = e.target as any;
    try {
      await api('/hostels', { method: 'POST', body: JSON.stringify({ name: f.name.value, type: f.type.value, warden: f.warden.value }) });
      f.reset(); load();
    } catch (e: any) { setErr(e.message); }
  }
  async function addRoom(e: React.FormEvent) {
    e.preventDefault();
    const f = e.target as any;
    try {
      await api('/hostel-rooms', { method: 'POST', body: JSON.stringify({
        hostel_id: Number(f.hostel_id.value), room_no: f.room_no.value,
        capacity: Number(f.capacity.value) || 2, fee: Number(f.fee.value) || 0,
      }) });
      f.reset(); load();
    } catch (e: any) { setErr(e.message); }
  }
  async function allot(e: React.FormEvent) {
    e.preventDefault();
    const f = e.target as any;
    try {
      await api('/hostel-allotments', { method: 'POST', body: JSON.stringify({
        student_id: Number(f.student_id.value), room_id: Number(f.room_id.value),
      }) });
      f.reset(); load();
    } catch (e: any) { setErr(e.message); }
  }

  async function vacate(id: number) {
    if (!confirm('Mark this student as vacated today?')) return;
    try { await api(`/hostel-allotments/${id}/vacate`, { method: 'POST', body: '{}' }); load(); }
    catch (e: any) { setErr(e.message); }
  }

  return (
    <Shell>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-brand-700">Hostel</h2>
        <div className="flex gap-2">
          {(['hostels','rooms','allotments'] as const).map(t => (
            <button key={t} className={`btn text-sm ${tab === t ? 'btn-primary' : 'bg-gray-200'}`} onClick={() => setTab(t)}>{t[0].toUpperCase()+t.slice(1)}</button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {[['/hostel/roll-call', 'Roll Call', 'Daily present / absent / leave'], ['/hostel/mess', 'Mess', 'Menu, meal counts, mess fee'],
          ['/hostel/visitors', 'Visitors', 'Visitor in / out log'], ['/hostel/out-pass', 'Out-passes', 'Requests, approvals, overdue']].map(([href, t, d]) => (
          <Link key={href} href={href} className="card p-3 hover:shadow-md transition">
            <div className="font-semibold text-brand-700">{t}</div><div className="text-xs text-gray-500">{d}</div>
          </Link>
        ))}
      </div>
      {err && <div className="text-red-700 text-sm mb-2">{err}</div>}

      {tab === 'hostels' && (
        <>
          <form onSubmit={addHostel} className="card p-4 mb-4 grid md:grid-cols-3 gap-3 text-sm">
            <div><label className="label">Name *</label><input className="input" name="name" required /></div>
            <div><label className="label">Type</label>
              <select className="input" name="type"><option value="boys">Boys</option><option value="girls">Girls</option><option value="staff">Staff</option></select>
            </div>
            <div><label className="label">Warden</label><input className="input" name="warden" /></div>
            <div className="md:col-span-3"><button className="btn btn-primary">Add Hostel</button></div>
          </form>
          <div className="card p-4 overflow-x-auto">
            <table className="table"><thead><tr><th>Name</th><th>Type</th><th>Warden</th></tr></thead>
              <tbody>{hostels.map(h => <tr key={h.id}><td>{h.name}</td><td>{h.type}</td><td>{h.warden}</td></tr>)}
                {!hostels.length && <tr><td colSpan={3} className="text-center py-3 text-gray-500">No hostels.</td></tr>}
              </tbody></table>
          </div>
        </>
      )}

      {tab === 'rooms' && (
        <>
          <form onSubmit={addRoom} className="card p-4 mb-4 grid md:grid-cols-4 gap-3 text-sm">
            <div><label className="label">Hostel</label>
              <select className="input" name="hostel_id" required>
                <option value="">-- Select --</option>
                {hostels.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select></div>
            <div><label className="label">Room No *</label><input className="input" name="room_no" required /></div>
            <div><label className="label">Capacity</label><input className="input" name="capacity" type="number" defaultValue={2} /></div>
            <div><label className="label">Fee</label><input className="input" name="fee" type="number" /></div>
            <div className="md:col-span-4"><button className="btn btn-primary">Add Room</button></div>
          </form>
          <div className="card p-4 overflow-x-auto">
            <table className="table"><thead><tr><th>Hostel</th><th>Room</th><th>Capacity</th><th>Fee</th></tr></thead>
              <tbody>{rooms.map(r => <tr key={r.id}><td>{r.hostel_name}</td><td>{r.room_no}</td><td>{r.capacity}</td><td>₹{r.fee}</td></tr>)}
                {!rooms.length && <tr><td colSpan={4} className="text-center py-3 text-gray-500">No rooms.</td></tr>}
              </tbody></table>
          </div>
        </>
      )}

      {tab === 'allotments' && (
        <>
          <form onSubmit={allot} className="card p-4 mb-4 grid md:grid-cols-3 gap-3 text-sm">
            <div><label className="label">Student</label>
              <select className="input" name="student_id" required>
                <option value="">-- Select --</option>
                {students.map(s => <option key={s.id} value={s.id}>{s.admission_no} — {s.full_name}</option>)}
              </select></div>
            <div><label className="label">Room</label>
              <select className="input" name="room_id" required>
                <option value="">-- Select --</option>
                {rooms.map(r => <option key={r.id} value={r.id}>{r.hostel_name} — {r.room_no}</option>)}
              </select></div>
            <div className="flex items-end"><button className="btn btn-primary">Allot</button></div>
          </form>
          <div className="card p-4 overflow-x-auto">
            <table className="table"><thead><tr><th>Student</th><th>Hostel</th><th>Room</th><th>Allotted</th><th>Vacated</th><th></th></tr></thead>
              <tbody>{allotments.map(a => <tr key={a.id}><td>{a.student_name}</td><td>{a.hostel_name}</td><td>{a.room_no}</td>
                <td>{fmtDate(a.allotted_on)}</td><td>{a.vacated_on ? fmtDate(a.vacated_on) : <span className="badge badge-green">Current</span>}</td>
                <td>{!a.vacated_on && <button className="text-xs text-red-600 hover:underline" onClick={() => vacate(a.id)}>Vacate</button>}</td></tr>)}
                {!allotments.length && <tr><td colSpan={6} className="text-center py-3 text-gray-500">No allotments.</td></tr>}
              </tbody></table>
          </div>
        </>
      )}
    </Shell>
  );
}
