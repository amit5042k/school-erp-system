'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';

type Field = { name: string; label: string; type?: 'text' | 'number' | 'select' | 'date' | 'textarea'; options?: (string | { value: string; label: string })[] };
type MasterType = { type: string; title: string; group: string; description?: string; fields: Field[]; can_write: boolean };
type Row = { id: number; name: string; code: string | null; sort_order: number; active: number; [k: string]: any };

const opt = (o: any) => (typeof o === 'string' ? { value: o, label: o } : o);

export default function MasterPage({ params }: { params: { type: string } }) {
  const [meta, setMeta] = useState<MasterType | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [draft, setDraft] = useState<Record<string, any>>({ name: '' });
  const [editing, setEditing] = useState<Record<number, Record<string, any>>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const flash = (text: string, ok = true) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 3000); };

  async function load() {
    try {
      const types = await api<MasterType[]>('/master-types');
      const t = types.find(x => x.type === params.type);
      if (!t) return flash('This list does not exist or you do not have access to it.', false);
      setMeta(t);
      setRows(await api<Row[]>(`/masters/${params.type}?all=1`));
    } catch (e: any) { flash(e.message, false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [params.type]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api(`/masters/${params.type}`, { method: 'POST', body: JSON.stringify(draft) });
      setDraft({ name: '' }); flash('Added.'); load();
    } catch (e: any) { flash(e.message, false); }
  }
  async function save(id: number, body: Record<string, any>) {
    try {
      await api(`/masters/${params.type}/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      setEditing(x => { const n = { ...x }; delete n[id]; return n; }); flash('Saved.'); load();
    } catch (e: any) { flash(e.message, false); }
  }
  async function remove(r: Row) {
    if (!confirm(`Delete "${r.name}"? If it is in use, set it Inactive instead.`)) return;
    try { await api(`/masters/${params.type}/${r.id}`, { method: 'DELETE' }); load(); }
    catch (e: any) { flash(e.message, false); }
  }
  async function move(r: Row, dir: -1 | 1) {
    const i = rows.findIndex(x => x.id === r.id), j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const other = rows[j];
    try {
      await api(`/masters/${params.type}/${r.id}`, { method: 'PUT', body: JSON.stringify({ sort_order: j }) });
      await api(`/masters/${params.type}/${other.id}`, { method: 'PUT', body: JSON.stringify({ sort_order: i }) });
      load();
    } catch (e: any) { flash(e.message, false); }
  }

  const fieldInput = (f: Field, value: any, set: (v: any) => void) => {
    if (f.type === 'select') return (
      <select className="input" value={value ?? ''} onChange={e => set(e.target.value)}>
        <option value="">—</option>
        {(f.options || []).map(o => { const x = opt(o); return <option key={x.value} value={x.value}>{x.label}</option>; })}
      </select>);
    if (f.type === 'textarea') return <textarea className="input" rows={1} value={value ?? ''} onChange={e => set(e.target.value)} />;
    return <input className="input" type={f.type || 'text'} value={value ?? ''} onChange={e => set(e.target.value)} />;
  };

  const canWrite = !!meta?.can_write;
  const extra = meta?.fields || [];

  return (
    <Shell>
      <div className="text-xs text-gray-500 mb-1">{meta?.group || 'Settings'} › {meta?.title || params.type}</div>
      <h2 className="text-xl font-bold text-brand-700">{meta?.title || 'List'}</h2>
      {meta?.description && <div className="text-sm text-gray-500">{meta.description}</div>}

      {msg && (
        <div className={`text-sm rounded px-3 py-2 my-3 border ${msg.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>{msg.text}</div>
      )}

      {canWrite && (
        <form onSubmit={add} className="card p-4 my-4 grid md:grid-cols-4 gap-3 text-sm">
          <div><label className="label">Name *</label><input className="input" required value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></div>
          <div><label className="label">Code</label><input className="input" value={draft.code || ''} onChange={e => setDraft({ ...draft, code: e.target.value })} /></div>
          {extra.map(f => (
            <div key={f.name}><label className="label">{f.label}</label>{fieldInput(f, draft[f.name], v => setDraft({ ...draft, [f.name]: v }))}</div>
          ))}
          <div className="flex items-end"><button className="btn btn-primary">Add</button></div>
        </form>
      )}

      <div className="card p-4 overflow-x-auto mt-4">
        <table className="table text-sm">
          <thead><tr>
            {canWrite && <th className="w-16">Order</th>}
            <th>Name</th><th>Code</th>{extra.map(f => <th key={f.name}>{f.label}</th>)}<th>Status</th>{canWrite && <th></th>}
          </tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const ed = editing[r.id];
              const set = (k: string, v: any) => setEditing(x => ({ ...x, [r.id]: { ...x[r.id], [k]: v } }));
              return (
                <tr key={r.id} className={r.active ? '' : 'opacity-60'}>
                  {canWrite && (
                    <td className="whitespace-nowrap">
                      <button type="button" className="px-1 text-gray-500 hover:text-brand-700 disabled:opacity-30" disabled={i === 0} onClick={() => move(r, -1)} aria-label="Move up">▲</button>
                      <button type="button" className="px-1 text-gray-500 hover:text-brand-700 disabled:opacity-30" disabled={i === rows.length - 1} onClick={() => move(r, 1)} aria-label="Move down">▼</button>
                    </td>
                  )}
                  <td>{ed ? <input className="input" value={ed.name} onChange={e => set('name', e.target.value)} /> : r.name}</td>
                  <td>{ed ? <input className="input w-24" value={ed.code || ''} onChange={e => set('code', e.target.value)} /> : r.code || '—'}</td>
                  {extra.map(f => (
                    <td key={f.name}>{ed ? fieldInput(f, ed[f.name], v => set(f.name, v)) : (r[f.name] ?? '—')}</td>
                  ))}
                  <td><span className={`badge ${r.active ? 'badge-green' : 'badge-gray'}`}>{r.active ? 'Active' : 'Inactive'}</span></td>
                  {canWrite && (
                    <td className="whitespace-nowrap text-xs">
                      {ed ? (
                        <>
                          <button className="btn btn-primary text-xs py-1 mr-1" onClick={() => save(r.id, ed)}>Save</button>
                          <button className="text-gray-500 hover:underline" onClick={() => setEditing(x => { const n = { ...x }; delete n[r.id]; return n; })}>Cancel</button>
                        </>
                      ) : (
                        <>
                          <button className="text-brand-600 hover:underline mr-2" onClick={() => setEditing(x => ({ ...x, [r.id]: { ...r } }))}>Edit</button>
                          <button className="text-amber-700 hover:underline mr-2" onClick={() => save(r.id, { active: r.active ? 0 : 1 })}>{r.active ? 'Deactivate' : 'Activate'}</button>
                          <button className="text-red-600 hover:underline" onClick={() => remove(r)}>Delete</button>
                        </>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={4 + extra.length} className="text-center py-4 text-gray-500">Nothing here yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
