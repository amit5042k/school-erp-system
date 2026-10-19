'use client';

import { useEffect, useMemo, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';
import { Flash, HrHeader, useFlash, useMasterNames } from '../_ui';

type Row = { id: number; employee_no: string; full_name: string; designation: string | null; department: string | null;
  staff_category: string | null; subject: string | null; status: string | null; phone: string | null; email: string | null };
const FIELDS = ['designation', 'department', 'staff_category', 'subject', 'status', 'phone', 'email'] as const;

export default function QuickUpdatesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [dirty, setDirty] = useState<Record<number, Partial<Row>>>({});
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const { msg, flash } = useFlash();
  const lists: Record<string, string[]> = {
    designation: useMasterNames('designations'), department: useMasterNames('departments'),
    staff_category: useMasterNames('staff-categories'), subject: useMasterNames('subjects'),
    status: ['active', 'inactive', 'left'],
  };

  const load = () => api<Row[]>('/teachers').then(r => { setRows(r); setDirty({}); }).catch(e => flash(e.message, false));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const shown = useMemo(() => rows.filter(r => !q || `${r.employee_no} ${r.full_name} ${r.department || ''}`.toLowerCase().includes(q.toLowerCase())), [rows, q]);
  const value = (r: Row, f: keyof Row) => (dirty[r.id] && f in dirty[r.id] ? dirty[r.id][f] : r[f]) ?? (f === 'status' ? 'active' : '');
  const change = (id: number, f: keyof Row, v: string) => setDirty(d => ({ ...d, [id]: { ...d[id], [f]: v } }));
  const count = Object.keys(dirty).length;

  async function saveAll() {
    if (!count) return flash('Nothing has changed.');
    const leaving = Object.entries(dirty).filter(([, d]) => d.status === 'left').length;
    if (leaving && !confirm(`${leaving} employee(s) will be marked as Left and their logins disabled. Continue?`)) return;
    setBusy(true);
    try {
      const r = await api<{ updated: number; logins_disabled: number }>('/hr/employees', {
        method: 'PUT', body: JSON.stringify({ rows: Object.entries(dirty).map(([id, d]) => ({ id: Number(id), ...d })) }),
      });
      flash(`Saved ${r.updated} employee(s).${r.logins_disabled ? ` ${r.logins_disabled} login(s) disabled.` : ''}`);
      load();
    } catch (e: any) { flash(e.message, false); }
    finally { setBusy(false); }
  }

  return (
    <Shell>
      <HrHeader title="Employee Quick Updates" subtitle="Change several employees at once, then press Save All." />
      <Flash msg={msg} />
      <div className="flex flex-wrap gap-2 items-center mb-3">
        <input className="input max-w-xs" placeholder="Search name, emp no, department…" value={q} onChange={e => setQ(e.target.value)} />
        <button className="btn btn-primary" onClick={saveAll} disabled={busy || !count}>{busy ? 'Saving…' : `Save All${count ? ` (${count})` : ''}`}</button>
        {count > 0 && <button className="text-sm text-gray-500 hover:underline" onClick={() => setDirty({})}>Discard changes</button>}
      </div>
      <div className="card p-4 overflow-x-auto">
        <table className="table text-sm min-w-max">
          <thead><tr><th>Emp No</th><th>Name</th><th>Designation</th><th>Department</th><th>Category</th><th>Subject</th><th>Status</th><th>Phone</th><th>Email</th></tr></thead>
          <tbody>
            {shown.map(r => (
              <tr key={r.id} className={dirty[r.id] ? 'bg-amber-50' : ''}>
                <td>{r.employee_no}</td><td className="whitespace-nowrap">{r.full_name}</td>
                {FIELDS.map(f => (
                  <td key={f}>
                    {lists[f] ? (
                      <select className="input min-w-[8rem]" value={String(value(r, f))} onChange={e => change(r.id, f, e.target.value)}>
                        {f !== 'status' && <option value="">—</option>}
                        {value(r, f) && !lists[f].includes(String(value(r, f))) && <option>{String(value(r, f))}</option>}
                        {lists[f].map(o => <option key={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input className="input min-w-[9rem]" type={f === 'email' ? 'email' : 'text'} value={String(value(r, f))} onChange={e => change(r.id, f, e.target.value)} />
                    )}
                  </td>
                ))}
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={9} className="text-center py-4 text-gray-500">No employees.</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
