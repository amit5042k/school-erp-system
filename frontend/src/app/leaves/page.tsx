'use client';

import { useEffect, useMemo, useState } from 'react';
import Shell from '@/components/Shell';
import FileUpload, { FileLinks } from '@/components/FileUpload';
import { api, fileUrl, getUser, localDate } from '@/lib/api';

// Used only until the school's own Leave Types list (Masters) has loaded.
const DEFAULT_LEAVE_TYPES = [
  'Casual Leave',
  'Casual Leave Jan_June',
  'Casual Leave July_Dec',
  'Compensatory Casual leave',
  'Earned Leave',
  'Leave without Pay',
  'Medical Leave',
  'On Duty',
];

const STATUSES = ['Pending', 'Approved', 'Rejected', 'Cancelled'];

type Leave = {
  id: number;
  teacher_id: number;
  teacher_name: string;
  employee_no: string;
  department?: string;
  phone?: string;
  photo_url?: string;
  leave_type: string;
  from_date: string;
  to_date: string;
  reason?: string;
  attachment?: string;
  session?: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  approved_from?: string;
  approved_to?: string;
  remarks?: string;
  applied_on: string;
};

type BalanceRow = { leave_type: string; allowed: number; availed: number; extra: number; balance: number };

function todayStr() { return localDate(); }

export default function LeavesPage() {
  const isAdmin = getUser<any>()?.role === 'admin';
  const [rows, setRows] = useState<Leave[]>([]);
  const [balances, setBalances] = useState<Record<number, BalanceRow[]>>({});
  const [err, setErr] = useState<string | null>(null);
  const [filters, setFilters] = useState({ status: isAdmin ? 'Pending' : '', type: '', from: '', to: '' });
  const blankApply = { teacher_id: '', leave_type: DEFAULT_LEAVE_TYPES[0], from_date: localDate(), to_date: localDate(), reason: '', attachment: '' };
  const [applying, setApplying] = useState(!isAdmin);
  const [apply, setApply] = useState(blankApply);
  const [staff, setStaff] = useState<{ id: number; employee_no: string; full_name: string }[]>([]);
  const [ok, setOk] = useState<string | null>(null);
  useEffect(() => { if (isAdmin) api<any[]>('/teachers').then(setStaff).catch(() => {}); }, [isAdmin]);
  // The leave types the school keeps in Masters → Leave Types (the server accepts only these).
  const [LEAVE_TYPES, setLeaveTypes] = useState<string[]>(DEFAULT_LEAVE_TYPES);
  useEffect(() => {
    api<{ name: string; active?: number }[]>('/masters/leave-types').then(list => {
      const names = list.filter(x => x.active !== 0).map(x => x.name);
      if (!names.length) return;
      setLeaveTypes(names);
      setApply(a => (names.includes(a.leave_type) ? a : { ...a, leave_type: names[0] }));
    }).catch(() => {});
  }, []);

  async function submitLeave(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setOk(null);
    if (apply.to_date < apply.from_date) return setErr('To date cannot be before From date.');
    try {
      const body: Record<string, string> = { ...apply };
      if (!isAdmin) delete body.teacher_id;
      await api('/leaves', { method: 'POST', body: JSON.stringify(body) });
      setApply({ ...blankApply, leave_type: LEAVE_TYPES[0], teacher_id: apply.teacher_id });
      setOk('Leave application submitted.');
      load();
    } catch (e: any) { setErr(e.message); }
  }

  async function withdraw(id: number) {
    if (!confirm('Withdraw this leave application?')) return;
    try { await api(`/leaves/${id}`, { method: 'DELETE' }); load(); } catch (e: any) { setErr(e.message); }
  }
  const [editing, setEditing] = useState<Record<number, { approved_from: string; approved_to: string; remarks: string }>>({});

  async function load() {
    try {
      const data: Leave[] = await api('/leaves');
      setRows(data);
      // Fetch balances for every teacher that appears
      const ids = Array.from(new Set(data.map(r => r.teacher_id)));
      const bal: Record<number, BalanceRow[]> = {};
      await Promise.all(ids.map(async id => {
        try {
          const b = await api(`/leaves/balance/${id}`);
          bal[id] = b.rows;
        } catch { bal[id] = []; }
      }));
      setBalances(bal);
    } catch (e: any) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => rows.filter(r => {
    if (filters.status && r.status !== filters.status.toLowerCase()) return false;
    if (filters.type && r.leave_type !== filters.type) return false;
    if (filters.from && r.from_date < filters.from) return false;
    if (filters.to && r.to_date > filters.to) return false;
    return true;
  }), [rows, filters]);

  function getEdit(id: number, seed: Leave) {
    return editing[id] || {
      approved_from: seed.approved_from || seed.from_date,
      approved_to: seed.approved_to || seed.to_date,
      remarks: seed.remarks || '',
    };
  }
  function setEdit(id: number, patch: Partial<{ approved_from: string; approved_to: string; remarks: string }>) {
    setEditing(prev => ({ ...prev, [id]: { ...(prev[id] || {} as any), ...patch } }));
  }

  async function decide(id: number, action: 'approve' | 'reject' | 'cancel') {
    const seed = rows.find(r => r.id === id)!;
    const e = getEdit(id, seed);
    try {
      await api(`/leaves/${id}/decision`, {
        method: 'POST',
        body: JSON.stringify({ action, approved_from: e.approved_from, approved_to: e.approved_to, remarks: e.remarks }),
      });
      setEditing(prev => { const n = { ...prev }; delete n[id]; return n; });
      load();
    } catch (e: any) { setErr(e.message); }
  }

  function downloadCsv() {
    const header = ['Employee', 'Department', 'Leave Type', 'From', 'To', 'Status', 'Reason'];
    const body = filtered.map(r => [r.employee_no + ' ' + r.teacher_name, r.department || '', r.leave_type, r.from_date, r.to_date, r.status, (r.reason || '').replace(/"/g, "'")]);
    const csv = [header, ...body].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `staff-leaves-${todayStr()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Shell>
      {/* Breadcrumb + title */}
      <div className="text-xs text-gray-500 mb-1">Leave Management &nbsp;›&nbsp; {isAdmin ? 'Approve/Reject Leaves' : 'My Leaves'}</div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <div>
          <h2 className="text-xl font-bold text-brand-700 mb-1">{isAdmin ? 'Approve/Reject Leave' : 'My Leave Applications'}</h2>
          <div className="text-sm text-gray-500">Staff Leaves Report</div>
        </div>
        <button className="btn btn-primary text-sm" onClick={() => setApplying(v => !v)}>{applying ? 'Close Form' : 'Apply for Leave'}</button>
      </div>
      {err && <div className="text-red-700 text-sm mb-2">{err}</div>}
      {ok && <div className="text-green-700 text-sm mb-2">{ok}</div>}

      {applying && (
        <form onSubmit={submitLeave} className="card p-4 mb-4 grid md:grid-cols-4 gap-3 text-sm">
          <h3 className="md:col-span-4 font-semibold text-brand-700">Apply for Leave{isAdmin && ' (on behalf of staff)'}</h3>
          {isAdmin && (
            <div><label className="label">Staff *</label>
              <select className="input" required value={apply.teacher_id} onChange={e => setApply({ ...apply, teacher_id: e.target.value })}>
                <option value="">-- Select --</option>{staff.map(t => <option key={t.id} value={t.id}>{t.employee_no} — {t.full_name}</option>)}
              </select></div>
          )}
          <div><label className="label">Leave Type *</label>
            <select className="input" value={apply.leave_type} onChange={e => setApply({ ...apply, leave_type: e.target.value })}>
              {LEAVE_TYPES.map(t => <option key={t}>{t}</option>)}
            </select></div>
          <div><label className="label">From *</label><input type="date" className="input" required value={apply.from_date} onChange={e => setApply({ ...apply, from_date: e.target.value, to_date: apply.to_date < e.target.value ? e.target.value : apply.to_date })} /></div>
          <div><label className="label">To *</label><input type="date" className="input" required min={apply.from_date} value={apply.to_date} onChange={e => setApply({ ...apply, to_date: e.target.value })} /></div>
          <div className="md:col-span-2"><label className="label">Reason *</label><input className="input" required value={apply.reason} onChange={e => setApply({ ...apply, reason: e.target.value })} /></div>
          <div>
            <FileUpload label="Attachment (e.g. medical certificate)" accept=".pdf,.jpg,.jpeg,.png" onUploaded={f => setApply(a => ({ ...a, attachment: f[0].url }))} />
            {apply.attachment && <div className="text-xs mt-1"><FileLinks value={apply.attachment} names="Attached file" /> <button type="button" className="text-red-600 ml-2" onClick={() => setApply({ ...apply, attachment: '' })}>Remove</button></div>}
          </div>
          <div className="flex items-end"><button className="btn btn-primary">Submit Application</button></div>
        </form>
      )}

      {/* Filters */}
      <div className="card p-4 mb-4 grid sm:grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div>
          <label className="label">Leave Status</label>
          <select className="input" value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
            <option value="">All</option>
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Leave Type</label>
          <select className="input" value={filters.type} onChange={e => setFilters(f => ({ ...f, type: e.target.value }))}>
            <option value="">All</option>
            {LEAVE_TYPES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div><label className="label">From Date</label><input type="date" className="input" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} /></div>
        <div><label className="label">To Date</label><input type="date" className="input" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} /></div>
        <div className="sm:col-span-2 md:col-span-4 flex flex-wrap items-end gap-2">
          <button className="btn btn-primary" onClick={load}>Search</button>
          <button className="btn btn-accent" onClick={downloadCsv}>Download Excel</button>
          <button className="btn bg-red-600 text-white hover:bg-red-700" onClick={() => window.print()}>Download Pdf</button>
        </div>
      </div>

      {/* Leave cards */}
      <div className="space-y-4">
        {filtered.map(leave => {
          const e = getEdit(leave.id, leave);
          const bal = balances[leave.teacher_id] || [];
          return (
            <div key={leave.id} className="card p-0 overflow-hidden">
              {/* Employee header */}
              <div className="bg-brand-50 px-4 py-2 flex items-center gap-3 border-b">
                <div className="w-10 h-10 rounded-full bg-brand-700 text-white grid place-items-center font-bold">
                  {leave.teacher_name.split(' ').map(w => w[0]).slice(0, 2).join('')}
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-brand-700">{leave.teacher_name} <span className="text-xs text-gray-500">({leave.employee_no})</span></div>
                  <div className="text-xs text-gray-600">
                    {leave.department || '—'}
                    {leave.phone && <> · ☎ {leave.phone}</>}
                  </div>
                </div>
                <span className={`badge ${
                  leave.status === 'approved' ? 'badge-green' :
                  leave.status === 'rejected' || leave.status === 'cancelled' ? 'badge-red' : 'badge-amber'
                }`}>{leave.status}</span>
              </div>

              <div className="grid md:grid-cols-3 gap-0 text-sm">
                {/* Leave balance grid */}
                <div className="p-3 border-r">
                  <div className="font-semibold mb-2 text-brand-700">Leave Balance ({leave.session || '—'})</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-brand-600 text-white">
                          <th className="px-2 py-1 text-left">Leave Type</th>
                          <th className="px-2 py-1">Allowed</th>
                          <th className="px-2 py-1">Availed</th>
                          <th className="px-2 py-1">Extra</th>
                          <th className="px-2 py-1">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bal.map((b, i) => (
                          <tr key={b.leave_type} style={{ backgroundColor: i % 2 ? '#E6FFFF' : '#fff' }}>
                            <td className="px-2 py-1">{b.leave_type}</td>
                            <td className="px-2 py-1 text-center">{b.allowed}</td>
                            <td className="px-2 py-1 text-center">{b.availed}</td>
                            <td className="px-2 py-1 text-center">{b.extra}</td>
                            <td className="px-2 py-1 text-center font-semibold">{b.balance}</td>
                          </tr>
                        ))}
                        {!bal.length && <tr><td colSpan={5} className="text-center text-gray-400 py-2">No balance data.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Leave details */}
                <div className="p-3 border-r">
                  <div className="font-semibold mb-2 text-brand-700">Leave Details</div>
                  <dl className="grid grid-cols-3 gap-y-1 text-xs">
                    <dt className="text-gray-500">Leave Type</dt><dd className="col-span-2">{leave.leave_type}</dd>
                    <dt className="text-gray-500">From</dt><dd className="col-span-2">{leave.from_date}</dd>
                    <dt className="text-gray-500">To</dt><dd className="col-span-2">{leave.to_date}</dd>
                    <dt className="text-gray-500">Reason</dt><dd className="col-span-2">{leave.reason || '—'}</dd>
                    <dt className="text-gray-500">Attachment</dt><dd className="col-span-2">{leave.attachment ? <a href={fileUrl(leave.attachment)} target="_blank" rel="noreferrer" className="text-brand-600 underline">View</a> : '—'}</dd>
                    <dt className="text-gray-500">Applied On</dt><dd className="col-span-2">{leave.applied_on?.slice(0, 10)}</dd>
                  </dl>
                </div>

                {/* Action panel */}
                <div className="p-3">
                  <div className="font-semibold mb-2 text-brand-700">Decision</div>
                  {leave.status === 'pending' && !isAdmin ? (
                    <div className="text-xs text-gray-500">
                      Awaiting a decision from the admin.
                      <button className="block mt-2 text-red-600 hover:underline" onClick={() => withdraw(leave.id)}>Withdraw application</button>
                    </div>
                  ) : leave.status === 'pending' ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="label text-[11px]">Approved From</label>
                          <input type="date" className="input" value={e.approved_from} onChange={ev => setEdit(leave.id, { approved_from: ev.target.value })} />
                        </div>
                        <div>
                          <label className="label text-[11px]">Approved To</label>
                          <input type="date" className="input" value={e.approved_to} onChange={ev => setEdit(leave.id, { approved_to: ev.target.value })} />
                        </div>
                      </div>
                      <div>
                        <label className="label text-[11px]">Remarks</label>
                        <textarea className="input" rows={2} value={e.remarks} onChange={ev => setEdit(leave.id, { remarks: ev.target.value })} />
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => decide(leave.id, 'approve')} className="btn bg-green-600 text-white hover:bg-green-700 text-xs flex-1">Approve</button>
                        <button onClick={() => decide(leave.id, 'reject')} className="btn bg-red-600 text-white hover:bg-red-700 text-xs flex-1">Reject</button>
                        <button onClick={() => decide(leave.id, 'cancel')} className="btn bg-gray-500 text-white hover:bg-gray-600 text-xs flex-1">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <dl className="grid grid-cols-3 gap-y-1 text-xs">
                      <dt className="text-gray-500">Decision</dt><dd className="col-span-2 capitalize">{leave.status}</dd>
                      <dt className="text-gray-500">Approved From</dt><dd className="col-span-2">{leave.approved_from || '—'}</dd>
                      <dt className="text-gray-500">Approved To</dt><dd className="col-span-2">{leave.approved_to || '—'}</dd>
                      <dt className="text-gray-500">Remarks</dt><dd className="col-span-2">{leave.remarks || '—'}</dd>
                    </dl>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {!filtered.length && <div className="card p-6 text-center text-gray-500">No leave applications match these filters.</div>}
      </div>
    </Shell>
  );
}
