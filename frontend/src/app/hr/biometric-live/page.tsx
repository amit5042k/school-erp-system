'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, localDate } from '@/lib/api';
import { Flash, HrHeader, useFlash } from '../_ui';

type Punch = {
  id: number; pin: string; punch_at: string; punch_date: string; punch_time: string; verify_code: string | null;
  device_name: string; sn: string; staff_name: string | null; employee_no: string | null;
  student_name: string | null; admission_no: string | null;
};
type Device = { id: number; name: string };

const VERIFY: Record<string, string> = { '1': 'Fingerprint', '15': 'Face', '4': 'Card', '3': 'Password', '0': 'Password' };

export default function LivePunchesPage() {
  const { msg, flash } = useFlash();
  const [rows, setRows] = useState<Punch[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [date, setDate] = useState(localDate());
  const [updated, setUpdated] = useState<Date | null>(null);

  async function load() {
    try {
      const qs = new URLSearchParams({ limit: '200', ...(deviceId ? { device_id: deviceId } : {}), ...(date ? { date } : {}) });
      setRows(await api<Punch[]>(`/biometric/punches?${qs}`));
      setUpdated(new Date());
    } catch (e: any) { flash(e.message, false); }
  }
  useEffect(() => { api<Device[]>('/biometric/devices').then(setDevices).catch(() => {}); }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, date]);

  const unmapped = rows.filter(r => !r.staff_name && !r.student_name).length;

  return (
    <Shell>
      <HrHeader title="Live Punches" subtitle="Latest punches from all devices, refreshed every 30 seconds"
        links={[{ label: 'Devices', href: '/hr/biometric-devices' }, { label: 'Map Biometric IDs', href: '/hr/biometric-mapping' }]} />
      <Flash msg={msg} />
      <div className="card p-4 mb-4 flex flex-wrap items-end gap-3 text-sm">
        <div><label className="label">Date</label><input type="date" className="input" value={date} max={localDate()} onChange={e => setDate(e.target.value)} /></div>
        <div><label className="label">Device</label>
          <select className="input" value={deviceId} onChange={e => setDeviceId(e.target.value)}>
            <option value="">All devices</option>
            {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select></div>
        <button className="btn btn-primary" onClick={load}>Refresh now</button>
        <div className="text-xs text-gray-500 ml-auto">{rows.length} punch(es){updated ? ` · updated ${updated.toLocaleTimeString()}` : ''}</div>
      </div>
      {unmapped > 0 && (
        <div className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded px-3 py-2 mb-3">
          {unmapped} punch(es) are from biometric IDs not linked to anyone yet. <Link className="underline" href="/hr/biometric-mapping">Map them</Link> and their attendance is filled in automatically.
        </div>
      )}
      <div className="card p-4 overflow-x-auto">
        <table className="table text-sm">
          <thead><tr><th>Time</th><th>Name</th><th>Emp / Adm No</th><th>Biometric ID</th><th>Verified By</th><th>Device</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td className="whitespace-nowrap">{r.punch_date === localDate() ? r.punch_time : r.punch_at}</td>
                <td>{r.staff_name || r.student_name || <span className="badge badge-amber">Unmapped PIN</span>}{r.student_name ? <span className="text-xs text-gray-500"> (student)</span> : null}</td>
                <td>{r.employee_no || r.admission_no || '—'}</td>
                <td className="font-mono">{r.pin}</td>
                <td>{(r.verify_code && VERIFY[r.verify_code]) || r.verify_code || '—'}</td>
                <td>{r.device_name}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="text-center py-4 text-gray-500">No punches for this day yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
