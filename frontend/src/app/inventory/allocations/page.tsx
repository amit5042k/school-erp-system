'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, fmtDate, getUser, localDate } from '@/lib/api';

type Item = { id: number; sku: string; name: string; unit: string; qty_on_hand: number };
type Alloc = {
  id: number; item_id: number; item_name: string; sku: string; unit: string; teacher_id: number; staff_name: string; employee_no: string;
  department: string | null; qty: number; returned_qty: number; outstanding: number; allocated_on: string; due_back: string | null;
  returnable: number; status: string; remarks: string | null; last_returned_on: string | null;
};

const BLANK = { item_id: '', teacher_id: '', qty: '1', due_back: '', returnable: '1', remarks: '' };

export default function AllocationsPage() {
  const isAdmin = getUser<any>()?.role === 'admin';
  const [rows, setRows] = useState<Alloc[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [form, setForm] = useState<Record<string, string>>(BLANK);
  const [openOnly, setOpenOnly] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const flash = (text: string, ok = true) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), ok ? 3000 : 6000); };

  const load = () => {
    api<Alloc[]>(`/inv/allocations${openOnly ? '?open=1' : ''}`).then(setRows).catch(e => flash(e.message, false));
    api<Item[]>('/inv/items').then(setItems).catch(() => {});
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [openOnly]);
  useEffect(() => { if (isAdmin) api<any[]>('/teachers').then(setStaff).catch(() => {}); }, [isAdmin]);

  const item = items.find(i => String(i.id) === form.item_id);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  async function allocate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api('/inv/allocations', { method: 'POST', body: JSON.stringify({
        item_id: Number(form.item_id), teacher_id: Number(form.teacher_id), qty: Number(form.qty),
        due_back: form.due_back || null, returnable: form.returnable === '1', remarks: form.remarks || null,
      }) });
      flash(`Allocated ${form.qty} × ${item?.name}.`);
      setForm(BLANK); load();
    } catch (err: any) { flash(err.message, false); }
  }

  async function giveBack(a: Alloc) {
    const q = prompt(`How many ${a.unit || 'units'} of ${a.item_name} did ${a.staff_name} return? (${a.outstanding} outstanding)`, String(a.outstanding));
    if (!q) return;
    try {
      const r = await api<{ outstanding: number }>(`/inv/allocations/${a.id}/return`, { method: 'POST', body: JSON.stringify({ qty: Number(q) }) });
      flash(r.outstanding ? `Return recorded; ${r.outstanding} still outstanding.` : 'Fully returned. Stock updated.');
      load();
    } catch (err: any) { flash(err.message, false); }
  }

  const today = localDate();

  return (
    <Shell>
      <div className="flex flex-wrap items-end justify-between gap-2 mb-4">
        <div>
          <div className="text-xs text-gray-500 mb-1">Inventory › Allocate to Staff</div>
          <h2 className="text-xl font-bold text-brand-700">{isAdmin ? 'Allocate to Staff' : 'Items Allocated to Me'}</h2>
          <div className="text-sm text-gray-500">Issued items come out of stock; returns put them back</div>
        </div>
        <div className="flex gap-2">
          <Link href="/inventory/requests" className="btn bg-gray-200 text-sm">Staff Requests</Link>
          {isAdmin && <Link href="/report/inventory-allocations" className="btn bg-gray-200 text-sm">Allocation Report</Link>}
        </div>
      </div>
      {msg && <div className={`text-sm rounded px-3 py-2 mb-3 border ${msg.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>{msg.text}</div>}

      {isAdmin && (
        <form onSubmit={allocate} className="card p-4 mb-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="col-span-2"><label className="label">Item *</label>
            <select className="input" required value={form.item_id} onChange={e => set('item_id', e.target.value)}>
              <option value="">-- Select --</option>
              {items.map(i => <option key={i.id} value={i.id} disabled={i.qty_on_hand <= 0}>{i.sku} — {i.name} ({i.qty_on_hand} {i.unit || ''} in stock)</option>)}
            </select></div>
          <div className="col-span-2"><label className="label">Staff *</label>
            <select className="input" required value={form.teacher_id} onChange={e => set('teacher_id', e.target.value)}>
              <option value="">-- Select --</option>
              {staff.map(t => <option key={t.id} value={t.id}>{t.employee_no} — {t.full_name}{t.department ? ` (${t.department})` : ''}</option>)}
            </select></div>
          <div><label className="label">Quantity *</label>
            <input className="input" type="number" min={1} max={item?.qty_on_hand} required value={form.qty} onChange={e => set('qty', e.target.value)} /></div>
          <div><label className="label">Type</label>
            <select className="input" value={form.returnable} onChange={e => set('returnable', e.target.value)}>
              <option value="1">Returnable</option><option value="0">Consumable (not returned)</option>
            </select></div>
          <div><label className="label">Due Back</label>
            <input className="input" type="date" min={today} disabled={form.returnable === '0'} value={form.due_back} onChange={e => set('due_back', e.target.value)} /></div>
          <div><label className="label">Remarks</label><input className="input" value={form.remarks} onChange={e => set('remarks', e.target.value)} /></div>
          <div className="col-span-2 md:col-span-4"><button className="btn btn-primary">Allocate</button></div>
        </form>
      )}

      <div className="card p-4 overflow-x-auto">
        <label className="text-sm flex items-center gap-2 mb-2">
          <input type="checkbox" checked={openOnly} onChange={e => setOpenOnly(e.target.checked)} /> Show only items not yet returned
        </label>
        <table className="table text-sm">
          <thead><tr><th>Date</th>{isAdmin && <th>Staff</th>}<th>Item</th><th>Issued</th><th>Returned</th><th>Outstanding</th><th>Due Back</th><th>Status</th>{isAdmin && <th></th>}</tr></thead>
          <tbody>
            {rows.map(a => (
              <tr key={a.id}>
                <td>{fmtDate(a.allocated_on)}</td>
                {isAdmin && <td>{a.staff_name}<div className="text-[11px] text-gray-500">{a.employee_no}{a.department ? ` · ${a.department}` : ''}</div></td>}
                <td>{a.item_name}<div className="text-[11px] text-gray-500">{a.sku}{a.remarks ? ` · ${a.remarks}` : ''}</div></td>
                <td>{a.qty} {a.unit}</td>
                <td>{a.returnable ? a.returned_qty : '—'}</td>
                <td>{a.returnable ? a.outstanding : '—'}</td>
                <td className={a.due_back && a.due_back < today && a.outstanding > 0 && a.returnable ? 'text-red-600 font-semibold' : ''}>{fmtDate(a.due_back)}</td>
                <td><span className={`badge ${a.status === 'returned' ? 'badge-green' : a.status === 'consumed' ? 'badge-gray' : 'badge-amber'}`}>{a.status.replace('_', ' ')}</span></td>
                {isAdmin && <td>{a.returnable && a.outstanding > 0 ? <button className="btn btn-primary text-xs py-1" onClick={() => giveBack(a)}>Record Return</button> : null}</td>}
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={9} className="text-center text-gray-500 py-4">No allocations.</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
