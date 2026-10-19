'use client';
import ModulePage from '@/components/ModulePage';
import { api, fileUrl, fmtDate } from '@/lib/api';
import { useRole } from '../_lib/lookups';

const STATUS: Record<string, string> = { unclaimed: 'badge-amber', claimed: 'badge-green', disposed: 'badge-gray' };

export default function LostFoundPage() {
  const { isStaff } = useRole();

  async function claim(row: any, reload: () => void) {
    const who = prompt(`Who is collecting "${row.item_name}"? (name and class / phone)`);
    if (!who) return;
    try { await api(`/comm/lost-found/${row.id}`, { method: 'PUT', body: JSON.stringify({ status: 'claimed', claimed_by: who }) }); reload(); }
    catch (e: any) { alert(e.message); }
  }
  async function setStatus(row: any, status: string, reload: () => void) {
    try { await api(`/comm/lost-found/${row.id}`, { method: 'PUT', body: JSON.stringify({ status }) }); reload(); }
    catch (e: any) { alert(e.message); }
  }
  async function remove(row: any, reload: () => void) {
    if (!confirm(`Delete "${row.item_name}"?`)) return;
    try { await api(`/comm/lost-found/${row.id}`, { method: 'DELETE' }); reload(); } catch (e: any) { alert(e.message); }
  }

  return (
    <ModulePage
      title="Lost and Found"
      endpoint="/comm/lost-found"
      canCreate={isStaff}
      canEdit={isStaff}
      createLabel="+ Upload Lost and Found"
      emptyText="Nothing in lost and found."
      searchKeys={['item_name', 'description', 'location']}
      fields={[
        { name: 'photo_url', label: 'Photo', type: 'file',
          formatter: v => v ? <a href={fileUrl(v)} target="_blank" rel="noreferrer"><img src={fileUrl(v)} alt="" className="w-16 h-16 object-cover rounded border" /></a> : '—' },
        { name: 'item_name', label: 'Item', required: true },
        { name: 'description', label: 'Description' },
        { name: 'location', label: 'Found At' },
        { name: 'found_date', label: 'Found On', type: 'date', required: true, formatter: v => fmtDate(v) },
        { name: 'status', label: 'Status', hideInForm: true,
          formatter: (v, r) => <><span className={`badge ${STATUS[v] || 'badge-gray'}`}>{v}</span>
            {v === 'claimed' && <div className="text-xs text-gray-500 mt-1">{r.claimed_by} · {fmtDate(r.claimed_on)}</div>}</> },
      ]}
      rowActions={isStaff ? (row, reload) => (
        <>
          {row.status === 'unclaimed' && <button className="text-xs text-brand-600 hover:underline mr-2" onClick={() => claim(row, reload)}>Mark Claimed</button>}
          {row.status === 'unclaimed' && <button className="text-xs text-gray-600 hover:underline mr-2" onClick={() => setStatus(row, 'disposed', reload)}>Disposed</button>}
          {row.status !== 'unclaimed' && <button className="text-xs text-amber-700 hover:underline mr-2" onClick={() => setStatus(row, 'unclaimed', reload)}>Reopen</button>}
          <button className="text-xs text-red-600 hover:underline" onClick={() => remove(row, reload)}>Delete</button>
        </>
      ) : undefined}
    />
  );
}
