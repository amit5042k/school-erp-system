'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import ExploreOptions from '@/components/ExploreOptions';
import { api, fmtDateTime } from '@/lib/api';

export default function InventoryPage() {
  const [tab, setTab] = useState<null | 'items' | 'movements'>(null);
  const [items, setItems] = useState<any[]>([]);
  const [mv, setMv] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [cats, setCats] = useState<{ id: number; name: string }[]>([]);
  const [stores, setStores] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    api<any[]>('/masters/item-categories').then(setCats).catch(() => {});
    api<any[]>('/inv/stores').then(r => setStores(r.filter(x => x.active))).catch(() => {});
  }, []);

  async function load() {
    try {
      setItems(await api('/inv/items'));
      setMv(await api('/inventory/movements'));
    } catch (e: any) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    const f = e.target as any;
    try {
      const created = await api<{ id: number }>('/inventory/items', { method: 'POST', body: JSON.stringify({
        sku: f.sku.value, name: f.name.value, category: f.category.value,
        unit: f.unit.value, qty_on_hand: Number(f.qty_on_hand.value) || 0,
        reorder_level: Number(f.reorder_level.value) || 0, unit_price: Number(f.unit_price.value) || 0,
      }) });
      if (f.store_id.value) await api(`/inv/items/${created.id}/store`, { method: 'PUT', body: JSON.stringify({ store_id: Number(f.store_id.value) }) });
      f.reset(); setErr(null); load();
    } catch (e: any) { setErr(e.message); }
  }
  async function move(e: React.FormEvent) {
    e.preventDefault();
    const f = e.target as any;
    try {
      await api('/inventory/movements', { method: 'POST', body: JSON.stringify({
        item_id: Number(f.item_id.value), movement_type: f.movement_type.value,
        qty: Number(f.qty.value), reference: f.reference.value, note: f.note.value,
      }) });
      f.reset(); load();
    } catch (e: any) { setErr(e.message); }
  }

  return (
    <Shell>
      <ExploreOptions
        icon="📦"
        title="Inventory"
        subtitle="Stores, Stock & Allocation — Explore Options"
        breadcrumb={['Dashboard', 'Inventory']}
        columns={3}
        groups={[
          { title: 'Stores', actions: [
            { label: 'Store Categories', href: '/masters/store-categories' },
            { label: 'Store Type', href: '/masters/store-types' },
            { label: 'Store', href: '/inventory/stores' },
            { label: 'Manage Departments', href: '/masters/departments' },
          ]},
          { title: 'Items & Stock', actions: [
            { label: 'Item Category', href: '/masters/item-categories' },
            { label: 'Store Items', onClick: () => setTab('items') },
            { label: 'Add New Stock', onClick: () => setTab('movements') },
            { label: 'New Stock Details', onClick: () => setTab('movements') },
            { label: 'Stock Report', onClick: () => setTab('items') },
          ]},
          { title: 'Allocation', actions: [
            { label: 'Allocate to Staff', href: '/inventory/allocations' },
            { label: 'Staff Requests', href: '/inventory/requests' },
            { label: 'Staff Allocation Report', href: '/report/inventory-allocations' },
            { label: 'Staff Requests Report', href: '/report/inventory-requests' },
          ]},
        ]}
      />

      {err && <div className="text-red-700 text-sm mt-4">{err}</div>}

      {tab && (
        <>
          <div className="flex items-center justify-between mt-6 mb-3">
            <div className="flex gap-2">
              <button className={`btn text-sm ${tab === 'items' ? 'btn-primary' : 'bg-gray-200'}`} onClick={() => setTab('items')}>Items</button>
              <button className={`btn text-sm ${tab === 'movements' ? 'btn-primary' : 'bg-gray-200'}`} onClick={() => setTab('movements')}>Movements</button>
            </div>
            <button className="text-xs text-gray-500 hover:underline" onClick={() => setTab(null)}>Close</button>
          </div>

          {tab === 'items' && (
            <>
              <form onSubmit={addItem} className="card p-4 mb-4 grid md:grid-cols-4 gap-3 text-sm">
                <div><label className="label">SKU *</label><input className="input" name="sku" required /></div>
                <div><label className="label">Name *</label><input className="input" name="name" required /></div>
                <div><label className="label">Category</label>
                  <select className="input" name="category"><option value="">—</option>{cats.map(c => <option key={c.id}>{c.name}</option>)}</select></div>
                <div><label className="label">Store</label>
                  <select className="input" name="store_id"><option value="">—</option>{stores.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}</select></div>
                <div><label className="label">Unit</label><input className="input" name="unit" placeholder="pcs/kg/ltr" /></div>
                <div><label className="label">Qty on hand</label><input className="input" name="qty_on_hand" type="number" /></div>
                <div><label className="label">Reorder level</label><input className="input" name="reorder_level" type="number" /></div>
                <div><label className="label">Unit price</label><input className="input" name="unit_price" type="number" /></div>
                <div className="md:col-span-4"><button className="btn btn-primary">Add Item</button></div>
              </form>
              <div className="card p-4 overflow-x-auto">
                <table className="table"><thead><tr><th>SKU</th><th>Name</th><th>Cat</th><th>Store</th><th>Unit</th><th>Qty</th><th>Reorder</th><th>Price</th></tr></thead>
                  <tbody>{items.map(i => (
                    <tr key={i.id}><td>{i.sku}</td><td>{i.name}</td><td>{i.category}</td><td>{i.store_name || '—'}</td><td>{i.unit}</td>
                      <td><span className={`badge ${i.qty_on_hand <= i.reorder_level ? 'badge-red' : 'badge-green'}`}>{i.qty_on_hand}</span></td>
                      <td>{i.reorder_level}</td><td>₹{i.unit_price}</td></tr>
                  ))}
                    {!items.length && <tr><td colSpan={8} className="text-center py-3 text-gray-500">No items.</td></tr>}
                  </tbody></table>
              </div>
            </>
          )}

          {tab === 'movements' && (
            <>
              <form onSubmit={move} className="card p-4 mb-4 grid md:grid-cols-5 gap-3 text-sm">
                <div><label className="label">Item</label>
                  <select className="input" name="item_id" required>
                    <option value="">-- Select --</option>
                    {items.map(i => <option key={i.id} value={i.id}>{i.sku} — {i.name}</option>)}
                  </select></div>
                <div><label className="label">Type</label>
                  <select className="input" name="movement_type" required>
                    <option value="purchase">Purchase (+)</option>
                    <option value="issue">Issue (−)</option>
                    <option value="adjust">Adjust</option>
                  </select></div>
                <div><label className="label">Qty</label><input className="input" name="qty" type="number" required /></div>
                <div><label className="label">Reference</label><input className="input" name="reference" /></div>
                <div><label className="label">Note</label><input className="input" name="note" /></div>
                <div className="md:col-span-5"><button className="btn btn-primary">Record Movement</button></div>
              </form>
              <div className="card p-4 overflow-x-auto">
                <table className="table"><thead><tr><th>Date</th><th>Item</th><th>Type</th><th>Qty</th><th>Reference</th><th>Note</th></tr></thead>
                  <tbody>{mv.map(m => <tr key={m.id}><td>{fmtDateTime(m.moved_at)}</td>
                    <td>{m.sku} — {m.item_name}</td><td><span className="badge badge-gray">{m.movement_type}</span></td>
                    <td>{m.qty}</td><td>{m.reference}</td><td>{m.note}</td></tr>)}
                    {!mv.length && <tr><td colSpan={6} className="text-center py-3 text-gray-500">No movements.</td></tr>}
                  </tbody></table>
              </div>
            </>
          )}
        </>
      )}
    </Shell>
  );
}
