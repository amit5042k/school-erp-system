'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, fmtDate, getUser } from '@/lib/api';

type Item = { id: number; sku: string; name: string; unit: string; qty_on_hand: number };
type Req = {
  id: number; teacher_id: number; staff_name: string; employee_no: string; department: string | null; item_id: number | null;
  item_label: string; sku: string | null; unit: string | null; qty_on_hand: number | null; qty: number; purpose: string | null;
  status: string; requested_on: string; decided_on: string | null; decided_by_name: string | null; remarks: string | null;
};
type Decision = { item_id: string; qty: string; remarks: string };

const BADGE: Record<string, string> = { pending: 'badge-amber', approved: 'badge-green', rejected: 'badge-red', cancelled: 'badge-gray' };

export default function StaffRequestsPage() {
  const isAdmin = getUser<any>()?.role === 'admin';
  const [rows, setRows] = useState<Req[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [status, setStatus] = useState(isAdmin ? 'pending' : '');
  const [form, setForm] = useState({ teacher_id: '', item_id: '', item_name: '', qty: '1', purpose: '' });
  const [deciding, setDeciding] = useState<Record<number, Decision>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const flash = (text: string, ok = true) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), ok ? 3000 : 6000); };

  const load = () => {
    api<Req[]>(`/inv/requests${status ? `?status=${status}` : ''}`).then(setRows).catch(e => flash(e.message, false));
    api<Item[]>('/inv/items').then(setItems).catch(() => {});
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [status]);
  useEffect(() => { if (isAdmin) api<any[]>('/teachers').then(setStaff).catch(() => {}); }, [isAdmin]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api('/inv/requests', { method: 'POST', body: JSON.stringify({
        teacher_id: form.teacher_id ? Number(form.teacher_id) : undefined,
        item_id: form.item_id ? Number(form.item_id) : null, item_name: form.item_id ? null : form.item_name,
        qty: Number(form.qty), purpose: form.purpose || null,
      }) });
      flash('Request submitted.');
      setForm({ teacher_id: '', item_id: '', item_name: '', qty: '1', purpose: '' }); load();
    } catch (err: any) { flash(err.message, false); }
  }

  async function decide(r: Req, action: 'approve' | 'reject') {
    const d = deciding[r.id];
    try {
      const res = await api<{ status: string }>(`/inv/requests/${r.id}/decision`, { method: 'POST', body: JSON.stringify({
        action, remarks: d.remarks, item_id: d.item_id ? Number(d.item_id) : undefined, qty: d.qty ? Number(d.qty) : undefined,
      }) });
      flash(res.status === 'approved' ? `Approved and allocated to ${r.staff_name}.` : 'Request rejected.');
      setDeciding(x => { const n = { ...x }; delete n[r.id]; return n; });
      load();
    } catch (err: any) { flash(err.message, false); }
  }

  async function cancel(r: Req) {
    if (!confirm('Cancel this request?')) return;
    try { await api(`/inv/requests/${r.id}/cancel`, { method: 'POST', body: '{}' }); load(); }
    catch (err: any) { flash(err.message, false); }
  }

  return (
    <Shell>
      <div className="flex flex-wrap items-end justify-between gap-2 mb-4">
        <div>
          <div className="text-xs text-gray-500 mb-1">Inventory › Staff Requests</div>
          <h2 className="text-xl font-bold text-brand-700">Staff Requests</h2>
          <div className="text-sm text-gray-500">{isAdmin ? 'Approve to issue from stock, or reject with a reason' : 'Ask the store for items you need'}</div>
        </div>
        <div className="flex gap-2">
          <Link href="/inventory/allocations" className="btn bg-gray-200 text-sm">{isAdmin ? 'Allocations' : 'My Items'}</Link>
          {isAdmin && <Link href="/report/inventory-requests" className="btn bg-gray-200 text-sm">Requests Report</Link>}
        </div>
      </div>
      {msg && <div className={`text-sm rounded px-3 py-2 mb-3 border ${msg.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>{msg.text}</div>}

      <form onSubmit={submit} className="card p-4 mb-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <h3 className="col-span-2 md:col-span-4 font-semibold text-brand-700">New Request</h3>
        {isAdmin && (
          <div className="col-span-2"><label className="label">On behalf of *</label>
            <select className="input" required value={form.teacher_id} onChange={e => setForm({ ...form, teacher_id: e.target.value })}>
              <option value="">-- Select staff --</option>
              {staff.map(t => <option key={t.id} value={t.id}>{t.employee_no} — {t.full_name}</option>)}
            </select></div>
        )}
        <div className="col-span-2"><label className="label">Item</label>
          <select className="input" value={form.item_id} onChange={e => setForm({ ...form, item_id: e.target.value })}>
            <option value="">Not in the list — describe below</option>
            {items.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit || 'units'})</option>)}
          </select></div>
        {!form.item_id && (
          <div className="col-span-2"><label className="label">Item Needed *</label>
            <input className="input" required placeholder="e.g. Whiteboard markers" value={form.item_name} onChange={e => setForm({ ...form, item_name: e.target.value })} /></div>
        )}
        <div><label className="label">Quantity *</label><input className="input" type="number" min={1} required value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} /></div>
        <div className={isAdmin ? 'col-span-2 md:col-span-3' : 'col-span-2 md:col-span-3'}><label className="label">Purpose</label>
          <input className="input" value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })} /></div>
        <div className="col-span-2 md:col-span-4"><button className="btn btn-primary">Submit Request</button></div>
      </form>

      <div className="card p-4 overflow-x-auto">
        <div className="flex flex-wrap gap-2 mb-3">
          {['', 'pending', 'approved', 'rejected', 'cancelled'].map(s => (
            <button key={s} className={`btn text-xs py-1 ${status === s ? 'btn-primary' : 'bg-gray-200'}`} onClick={() => setStatus(s)}>{s ? s[0].toUpperCase() + s.slice(1) : 'All'}</button>
          ))}
        </div>
        <table className="table text-sm">
          <thead><tr><th>Requested</th>{isAdmin && <th>Staff</th>}<th>Item</th><th>Qty</th><th>Purpose</th><th>Status</th><th>Decision</th><th></th></tr></thead>
          <tbody>
            {rows.map(r => {
              const d = deciding[r.id];
              return (
                <tr key={r.id}>
                  <td className="whitespace-nowrap">{fmtDate(r.requested_on)}</td>
                  {isAdmin && <td>{r.staff_name}<div className="text-[11px] text-gray-500">{r.employee_no}{r.department ? ` · ${r.department}` : ''}</div></td>}
                  <td>{r.item_label}{r.item_id != null && r.status === 'pending' && <div className="text-[11px] text-gray-500">{r.qty_on_hand} in stock</div>}</td>
                  <td>{r.qty}</td>
                  <td>{r.purpose || '—'}</td>
                  <td><span className={`badge ${BADGE[r.status] || 'badge-gray'}`}>{r.status}</span></td>
                  <td className="text-xs">{r.decided_on ? <>{fmtDate(r.decided_on)}{r.decided_by_name ? ` · ${r.decided_by_name}` : ''}{r.remarks && <div>{r.remarks}</div>}</> : '—'}</td>
                  <td className="text-xs whitespace-nowrap">
                    {r.status === 'pending' && isAdmin && !d && (
                      <button className="btn btn-primary text-xs py-1" onClick={() => setDeciding(x => ({ ...x, [r.id]: { item_id: r.item_id ? String(r.item_id) : '', qty: String(r.qty), remarks: '' } }))}>Decide</button>
                    )}
                    {r.status === 'pending' && isAdmin && d && (
                      <div className="flex flex-col gap-1 min-w-[14rem]">
                        <select className="input" value={d.item_id} onChange={e => setDeciding(x => ({ ...x, [r.id]: { ...d, item_id: e.target.value } }))}>
                          <option value="">-- Stock item to issue --</option>
                          {items.map(i => <option key={i.id} value={i.id} disabled={i.qty_on_hand <= 0}>{i.name} ({i.qty_on_hand} left)</option>)}
                        </select>
                        <input className="input" type="number" min={1} value={d.qty} onChange={e => setDeciding(x => ({ ...x, [r.id]: { ...d, qty: e.target.value } }))} />
                        <input className="input" placeholder="Remarks (required to reject)" value={d.remarks} onChange={e => setDeciding(x => ({ ...x, [r.id]: { ...d, remarks: e.target.value } }))} />
                        <div className="flex gap-2">
                          <button className="btn bg-green-600 text-white hover:bg-green-700 text-xs py-1" onClick={() => decide(r, 'approve')}>Approve & Issue</button>
                          <button className="btn bg-red-600 text-white hover:bg-red-700 text-xs py-1" onClick={() => decide(r, 'reject')}>Reject</button>
                          <button className="text-gray-500 hover:underline" onClick={() => setDeciding(x => { const n = { ...x }; delete n[r.id]; return n; })}>Close</button>
                        </div>
                      </div>
                    )}
                    {r.status === 'pending' && !isAdmin && <button className="text-red-600 hover:underline" onClick={() => cancel(r)}>Cancel</button>}
                  </td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={8} className="text-center text-gray-500 py-4">No requests.</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
