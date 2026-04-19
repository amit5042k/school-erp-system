'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';

export type FieldDef = {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'date' | 'time' | 'email' | 'textarea' | 'select';
  required?: boolean;
  options?: { value: string | number; label: string }[];
  hideInForm?: boolean;
  hideInTable?: boolean;
  formatter?: (v: any, row: any) => any;
  placeholder?: string;
};

type Props = {
  title: string;
  endpoint: string;        // e.g. '/enquiries'
  fields: FieldDef[];
  canCreate?: boolean;
  createLabel?: string;
  emptyText?: string;
  rowActions?: (row: any, reload: () => void) => React.ReactNode;
  initial?: Record<string, any>;
  searchKeys?: string[];
  children?: React.ReactNode;
};

export default function ModulePage({
  title, endpoint, fields, canCreate = true, createLabel = '+ Add New',
  emptyText = 'No records.', rowActions, initial = {}, searchKeys = [], children,
}: Props) {
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<Record<string, any>>(initial);
  const [q, setQ] = useState('');

  async function load() {
    try { setRows(await api<any[]>(endpoint)); setError(null); }
    catch (e: any) { setError(e.message); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [endpoint]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const payload: any = { ...form };
      for (const f of fields) if (f.type === 'number' && payload[f.name] != null && payload[f.name] !== '') payload[f.name] = Number(payload[f.name]);
      await api(endpoint, { method: 'POST', body: JSON.stringify(payload) });
      setForm(initial); setAdding(false); load();
    } catch (e: any) { setError(e.message); }
  }

  async function remove(id: number) {
    if (!confirm('Delete this record?')) return;
    try { await api(`${endpoint}/${id}`, { method: 'DELETE' }); load(); }
    catch (e: any) { setError(e.message); }
  }

  const visibleFields = fields.filter(f => !f.hideInTable);
  const formFields = fields.filter(f => !f.hideInForm);
  const filtered = !q ? rows : rows.filter(r => searchKeys.some(k => String(r[k] ?? '').toLowerCase().includes(q.toLowerCase())));

  return (
    <Shell>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-brand-700">{title}</h2>
        {canCreate && <button className="btn btn-primary text-sm" onClick={() => setAdding(v => !v)}>{adding ? 'Cancel' : createLabel}</button>}
      </div>

      {children}

      {adding && (
        <form onSubmit={submit} className="card p-4 mb-4 grid md:grid-cols-3 gap-3 text-sm">
          {formFields.map(f => (
            <div key={f.name} className={f.type === 'textarea' ? 'md:col-span-3' : ''}>
              <label className="label">{f.label}{f.required ? ' *' : ''}</label>
              {f.type === 'textarea' ? (
                <textarea className="input" rows={3} required={f.required}
                  value={form[f.name] ?? ''} onChange={e => setForm({ ...form, [f.name]: e.target.value })} />
              ) : f.type === 'select' ? (
                <select className="input" required={f.required}
                  value={form[f.name] ?? ''} onChange={e => setForm({ ...form, [f.name]: e.target.value })}>
                  <option value="">-- Select --</option>
                  {(f.options || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <input className="input" type={f.type || 'text'} required={f.required}
                  placeholder={f.placeholder} value={form[f.name] ?? ''}
                  onChange={e => setForm({ ...form, [f.name]: e.target.value })} />
              )}
            </div>
          ))}
          <div className="md:col-span-3"><button className="btn btn-primary">Save</button></div>
        </form>
      )}

      {searchKeys.length > 0 && (
        <div className="mb-3"><input className="input max-w-xs" placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} /></div>
      )}

      <div className="card p-4 overflow-x-auto">
        {error && <div className="text-red-700 text-sm mb-2">{error}</div>}
        <table className="table min-w-max">
          <thead><tr>
            {visibleFields.map(f => <th key={f.name}>{f.label}</th>)}
            {rowActions && <th>Actions</th>}
            {canCreate && !rowActions && <th></th>}
          </tr></thead>
          <tbody>
            {filtered.map(row => (
              <tr key={row.id}>
                {visibleFields.map(f => <td key={f.name}>{f.formatter ? f.formatter(row[f.name], row) : (row[f.name] ?? '—')}</td>)}
                {rowActions && <td>{rowActions(row, load)}</td>}
                {canCreate && !rowActions && (
                  <td><button onClick={() => remove(row.id)} className="text-xs text-red-600 hover:underline">Delete</button></td>
                )}
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan={visibleFields.length + 1} className="text-center py-4 text-gray-500">{emptyText}</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
