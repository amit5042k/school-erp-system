'use client';

import { useEffect, useMemo, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';
import { Flash, HrHeader, useFlash } from '../_ui';

type Staff = { id: number; employee_no: string; full_name: string; department: string | null; designation: string | null; biometric_id: string | null; status: string };
type Unmapped = { pin: string; punches: number; first_punch: string; last_punch: string; devices: string };

export default function BiometricMappingPage() {
  const { msg, flash } = useFlash();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [unmapped, setUnmapped] = useState<Unmapped[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setStaff(await api<Staff[]>('/biometric/mapping'));
      setUnmapped(await api<Unmapped[]>('/biometric/unmapped'));
      setEdits({});
    } catch (e: any) { flash(e.message, false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const shown = useMemo(() => staff.filter(s => !q || `${s.full_name} ${s.employee_no} ${s.department || ''} ${s.biometric_id || ''}`.toLowerCase().includes(q.toLowerCase())), [staff, q]);
  const changed = Object.keys(edits).length;

  async function save() {
    if (!changed) return flash('Nothing changed.');
    setBusy(true);
    try {
      const r = await api<{ saved: number; punches_linked: number; days_updated: number }>('/biometric/mapping', {
        method: 'PUT', body: JSON.stringify({ items: Object.entries(edits).map(([teacher_id, biometric_id]) => ({ teacher_id: Number(teacher_id), biometric_id })) }),
      });
      flash(`Saved ${r.saved}. ${r.punches_linked} earlier punch(es) linked, ${r.days_updated} attendance day(s) filled in.`);
      load();
    } catch (e: any) { flash(e.message, false); }
    finally { setBusy(false); }
  }
  function fillFromEmployeeNo() {
    const next: Record<number, string> = { ...edits };
    for (const s of staff) if (!s.biometric_id && !next[s.id]) next[s.id] = s.employee_no;
    setEdits(next);
  }

  return (
    <Shell>
      <HrHeader title="Map Biometric IDs" subtitle="Link each staff member to the ID they are enrolled under on the device"
        links={[{ label: 'Devices', href: '/hr/biometric-devices' }, { label: 'Live Punches', href: '/hr/biometric-live' }]} />
      <Flash msg={msg} />

      {unmapped.length > 0 && (
        <div className="card p-4 mb-4">
          <h3 className="font-semibold text-brand-700 mb-1">Biometric IDs not linked to anyone</h3>
          <p className="text-xs text-gray-500 mb-2">Type one of these IDs against the right person below and save. Their earlier punches are then applied to attendance (days marked by hand are left alone).</p>
          <div className="flex flex-wrap gap-2">
            {unmapped.map(u => (
              <span key={u.pin} className="text-xs border rounded px-2 py-1 bg-amber-50 border-amber-200" title={`${u.devices} · ${u.first_punch} to ${u.last_punch}`}>
                <span className="font-mono font-semibold">{u.pin}</span> · {u.punches} punch(es) · last {u.last_punch}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="card p-4 mb-3 flex flex-wrap items-end gap-3 text-sm">
        <div className="flex-1 min-w-[12rem]"><label className="label">Search</label><input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder="Name, employee no, department" /></div>
        <button className="btn bg-gray-200" onClick={fillFromEmployeeNo} title="Fill empty biometric IDs with each person's employee number">Use Employee No where empty</button>
        <button className="btn btn-primary" onClick={save} disabled={busy || !changed}>{busy ? 'Saving…' : `Save ${changed || ''} change(s)`}</button>
      </div>
      <p className="text-xs text-gray-500 mb-2">If a biometric ID is left empty, punches under the person&apos;s Employee No are still recognised.</p>

      <div className="card p-4 overflow-x-auto">
        <table className="table text-sm">
          <thead><tr><th>Emp No</th><th>Name</th><th>Department</th><th>Designation</th><th>Status</th><th className="w-48">Biometric ID</th></tr></thead>
          <tbody>
            {shown.map(s => {
              const v = edits[s.id] ?? s.biometric_id ?? '';
              return (
                <tr key={s.id} className={edits[s.id] !== undefined ? 'bg-amber-50' : ''}>
                  <td>{s.employee_no}</td><td>{s.full_name}</td><td>{s.department || '—'}</td><td>{s.designation || '—'}</td>
                  <td><span className={`badge ${s.status === 'active' ? 'badge-green' : 'badge-gray'}`}>{s.status}</span></td>
                  <td><input className="input font-mono" value={v} placeholder={s.employee_no} onChange={e => setEdits({ ...edits, [s.id]: e.target.value })} /></td>
                </tr>
              );
            })}
            {!shown.length && <tr><td colSpan={6} className="text-center py-4 text-gray-500">No staff found.</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
