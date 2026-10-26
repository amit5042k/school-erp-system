'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { t } from '@/lib/i18n';
import { api, fileUrl, upload } from '@/lib/api';

export type FieldDef = {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'date' | 'time' | 'email' | 'textarea' | 'select' | 'file' | 'month';
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
  /** Show an Edit link per row that loads it into the form and saves with PUT. */
  canEdit?: boolean;
  /** Hide the per-row Delete link even when the user can create. */
  canDelete?: boolean;
  /** Optional query string appended to the list request, e.g. '?class_id=3'. */
  listQuery?: string;
};

export default function ModulePage({
  title, endpoint, fields, canCreate = true, createLabel = '+ Add New',
  emptyText = 'No records.', rowActions, initial = {}, searchKeys = [], children,
  canEdit = false, canDelete = true, listQuery = '',
}: Props) {
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<Record<string, any>>(initial);
  const [q, setQ] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);

  async function load() {
    try { setRows(await api<any[]>(endpoint + listQuery)); setError(null); }
    catch (e: any) { setError(e.message); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [endpoint, listQuery]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const payload: any = { ...form };
      for (const f of fields) if (f.type === 'number' && payload[f.name] != null && payload[f.name] !== '') payload[f.name] = Number(payload[f.name]);
      await api(editId ? `${endpoint}/${editId}` : endpoint, { method: editId ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      setForm(initial); setAdding(false); setEditId(null); load();
    } catch (e: any) { setError(e.message); }
  }

  function startEdit(row: any) {
    const f: Record<string, any> = {};
    for (const fd of fields) if (!fd.hideInForm) f[fd.name] = row[fd.name] ?? '';
    setForm(f); setEditId(row.id); setAdding(true);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function pickFile(name: string, files: FileList | null) {
    if (!files || !files.length) return;
    setUploading(true);
    try { const [f] = await upload(files); setForm(x => ({ ...x, [name]: f.url })); }
    catch (e: any) { setError(e.message); }
    finally { setUploading(false); }
  }

  async function remove(id: number) {
    if (!confirm(t('Delete this record?'))) return;
    try { await api(`${endpoint}/${id}`, { method: 'DELETE' }); load(); }
    catch (e: any) { setError(e.message); }
  }

  function display(f: FieldDef, row: any) {
    const v = row[f.name];
    if (f.formatter) return f.formatter(v, row);
    if (v == null || v === '') return '—';
    if (f.type === 'file') return <a href={fileUrl(v)} target="_blank" rel="noreferrer" className="text-brand-600 underline">{t('View')}</a>;
    if (f.type === 'select') return f.options?.find(o => String(o.value) === String(v))?.label ?? v;
    return v;
  }

  const visibleFields = fields.filter(f => !f.hideInTable);
  const formFields = fields.filter(f => !f.hideInForm);
  const filtered = !q ? rows : rows.filter(r => searchKeys.some(k => String(r[k] ?? '').toLowerCase().includes(q.toLowerCase())));

  return (
    <Shell>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-brand-700">{t(title)}</h2>
        {canCreate && <button className="btn btn-primary text-sm" onClick={() => { if (adding) { setForm(initial); setEditId(null); } setAdding(v => !v); }}>{t(adding ? 'Cancel' : createLabel)}</button>}
      </div>

      {children}

      {adding && (
        <form onSubmit={submit} className="card p-4 mb-4 grid md:grid-cols-3 gap-3 text-sm">
          {formFields.map(f => (
            <div key={f.name} className={f.type === 'textarea' ? 'md:col-span-3' : ''}>
              <label className="label">{t(f.label)}{f.required ? ' *' : ''}</label>
              {f.type === 'textarea' ? (
                <textarea className="input" rows={3} required={f.required}
                  value={form[f.name] ?? ''} onChange={e => setForm({ ...form, [f.name]: e.target.value })} />
              ) : f.type === 'select' ? (
                <select className="input" required={f.required}
                  value={form[f.name] ?? ''} onChange={e => setForm({ ...form, [f.name]: e.target.value })}>
                  <option value="">{t('-- Select --')}</option>
                  {(f.options || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : f.type === 'file' ? (
                <div>
                  <input className="input" type="file" disabled={uploading} onChange={e => pickFile(f.name, e.target.files)} />
                  {form[f.name] && <a className="text-xs text-brand-600 underline" href={fileUrl(form[f.name])} target="_blank" rel="noreferrer">{t('Current file')}</a>}
                </div>
              ) : (
                <input className="input" type={f.type || 'text'} required={f.required}
                  placeholder={f.placeholder} value={form[f.name] ?? ''}
                  onChange={e => setForm({ ...form, [f.name]: e.target.value })} />
              )}
            </div>
          ))}
          <div className="md:col-span-3"><button className="btn btn-primary" disabled={uploading}>{t(editId ? 'Save Changes' : 'Save')}</button></div>
        </form>
      )}

      {searchKeys.length > 0 && (
        <div className="mb-3"><input className="input max-w-xs" placeholder={t('Search…')} value={q} onChange={e => setQ(e.target.value)} /></div>
      )}

      <div className="card p-4 overflow-x-auto">
        {error && <div className="text-red-700 text-sm mb-2">{error}</div>}
        <table className="table min-w-max">
          <thead><tr>
            {visibleFields.map(f => <th key={f.name}>{t(f.label)}</th>)}
            {(rowActions || canEdit || (canCreate && canDelete)) && <th>{t('Actions')}</th>}
          </tr></thead>
          <tbody>
            {filtered.map(row => (
              <tr key={row.id}>
                {visibleFields.map(f => <td key={f.name}>{display(f, row)}</td>)}
                {(rowActions || canEdit || (canCreate && canDelete)) && (
                  <td className="whitespace-nowrap">
                    {canEdit && <button onClick={() => startEdit(row)} className="text-xs text-brand-600 hover:underline mr-2">{t('Edit')}</button>}
                    {rowActions ? rowActions(row, load) : canCreate && canDelete && (
                      <button onClick={() => remove(row.id)} className="text-xs text-red-600 hover:underline">{t('Delete')}</button>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan={visibleFields.length + 1} className="text-center py-4 text-gray-500">{t(emptyText)}</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
