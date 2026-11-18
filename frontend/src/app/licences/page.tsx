'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, fmtDate, fmtDateTime } from '@/lib/api';

type Area = { key: string; label: string };
type Licence = {
  id: number; email: string; school_name: string; domain: string | null; plan_name: string | null; areas: string[] | null;
  max_students: number | null; expires_on: string | null; status: 'active' | 'trial' | 'suspended';
  contact_name: string | null; contact_phone: string | null; notes: string | null;
  installs: number; last_seen: string | null; students: number | null; seen_at: string | null;
};
type Install = { install_id: string; email: string; domain: string | null; ip: string; students: number | null; result: string; first_seen: string; last_seen: string };

const blank = { email: '', school_name: '', domain: '', plan_name: '', areas: null as string[] | null, max_students: '', expires_on: '', status: 'active', contact_name: '', contact_phone: '', notes: '' };
const oneYear = () => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); d.setDate(d.getDate() - 1); return d.toLocaleDateString('en-CA'); };

/** The ERP provider's list of school licences (only on the licence server install). */
export default function LicencesPage() {
  const [rows, setRows] = useState<Licence[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [form, setForm] = useState<any>({ ...blank, expires_on: oneYear() });
  const [editId, setEditId] = useState<number | null>(null);
  const [installs, setInstalls] = useState<{ id: number; rows: Install[] } | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const load = () => api<{ areas: Area[]; rows: Licence[] }>('/licences').then(r => { setRows(r.rows); setAreas(r.areas); })
    .catch(e => setMsg({ text: e.message, ok: false }));
  useEffect(() => { load(); }, []);
  const set = (k: string) => (e: any) => setForm((f: any) => ({ ...f, [k]: e.target.value }));
  const allAreas = form.areas == null;
  const toggleArea = (k: string) => setForm((f: any) => {
    const cur: string[] = f.areas ?? areas.map(a => a.key);
    const next = cur.includes(k) ? cur.filter(x => x !== k) : [...cur, k];
    return { ...f, areas: next.length === areas.length ? null : next };
  });

  async function save(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    try {
      const body = JSON.stringify({ ...form, max_students: form.max_students === '' ? null : Number(form.max_students) });
      if (editId) await api(`/licences/${editId}`, { method: 'PUT', body });
      else await api('/licences', { method: 'POST', body });
      setMsg({ text: editId ? 'Licence saved. The school picks it up within 10 minutes (or at once with Check now on its Licence page).' : 'Licence created. Ask the school\'s Super Admin to enter this email on their Licence page.', ok: true });
      setForm({ ...blank, expires_on: oneYear() }); setEditId(null); load();
    } catch (ex: any) { setMsg({ text: ex.message, ok: false }); }
  }
  function edit(l: Licence) {
    setEditId(l.id);
    setForm({ ...l, domain: l.domain || '', plan_name: l.plan_name || '', max_students: l.max_students ?? '', expires_on: l.expires_on || '',
      contact_name: l.contact_name || '', contact_phone: l.contact_phone || '', notes: l.notes || '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function remove(l: Licence) {
    if (!confirm(`Delete the licence for ${l.school_name}?`)) return;
    try { await api(`/licences/${l.id}`, { method: 'DELETE' }); load(); } catch (ex: any) { setMsg({ text: ex.message, ok: false }); }
  }
  async function showInstalls(id: number) {
    try { setInstalls({ id, rows: await api<Install[]>(`/licences/${id}/installs`) }); } catch (ex: any) { setMsg({ text: ex.message, ok: false }); }
  }
  const today = new Date().toLocaleDateString('en-CA');
  const state = (l: Licence) => l.status === 'suspended' ? ['Suspended', 'text-red-700'] : l.expires_on && l.expires_on < today ? ['Expired', 'text-red-700']
    : l.status === 'trial' ? ['Trial', 'text-amber-700'] : ['Active', 'text-green-700'];

  return (
    <Shell>
      <h1 className="text-xl font-bold text-brand-700 mb-1">Licences</h1>
      <p className="text-sm text-gray-600 mb-4">Each school is licensed to its registered email. The school&apos;s Super Admin enters that email on their Licence page;
        their install checks here every 10 minutes. Expired or suspended schools become read-only (their data is never deleted).</p>
      {msg && <div className={`text-sm rounded px-3 py-2 mb-3 ${msg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</div>}

      <form onSubmit={save} className="card p-4 mb-4 text-sm">
        <h2 className="font-semibold text-brand-700 mb-3">{editId ? 'Edit licence' : 'New licence'}</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div><label className="label">Registered email *</label><input className="input" type="email" required autoCapitalize="none" value={form.email} onChange={set('email')} /></div>
          <div><label className="label">School name *</label><input className="input" required value={form.school_name} onChange={set('school_name')} /></div>
          <div><label className="label">Web address</label><input className="input" placeholder="erp.yourschool.in" value={form.domain} onChange={set('domain')} /></div>
          <div><label className="label">Status</label>
            <select className="input" value={form.status} onChange={set('status')}><option value="active">Active</option><option value="trial">Trial</option><option value="suspended">Suspended</option></select></div>
          <div><label className="label">Valid until</label><input className="input" type="date" value={form.expires_on} onChange={set('expires_on')} /><div className="text-xs text-gray-500">Blank = no expiry</div></div>
          <div><label className="label">Maximum students</label><input className="input" type="number" min={1} value={form.max_students} onChange={set('max_students')} /><div className="text-xs text-gray-500">Blank = no limit</div></div>
          <div><label className="label">Plan name</label><input className="input" placeholder="Basic / Standard / Premium" value={form.plan_name} onChange={set('plan_name')} /></div>
          <div><label className="label">Contact</label><input className="input" placeholder="Name" value={form.contact_name} onChange={set('contact_name')} />
            <input className="input mt-1" placeholder="Phone" value={form.contact_phone} onChange={set('contact_phone')} /></div>
        </div>
        <div className="mt-3">
          <div className="label">Modules in the plan {allAreas && <span className="text-gray-500 font-normal">(all)</span>}</div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-1">
            {areas.map(a => (
              <label key={a.key} className="flex items-center gap-2">
                <input type="checkbox" disabled={a.key === 'administration'} checked={allAreas || form.areas.includes(a.key) || a.key === 'administration'} onChange={() => toggleArea(a.key)} />
                {a.label}{a.key === 'administration' && <span className="text-xs text-gray-500">(always)</span>}
              </label>
            ))}
          </div>
        </div>
        <div className="mt-3"><label className="label">Notes</label><textarea className="input" rows={2} value={form.notes} onChange={set('notes')} /></div>
        <div className="mt-3 flex gap-2">
          <button className="btn btn-primary">{editId ? 'Save licence' : 'Create licence'}</button>
          {editId && <button type="button" className="btn bg-gray-200" onClick={() => { setEditId(null); setForm({ ...blank, expires_on: oneYear() }); }}>Cancel</button>}
        </div>
      </form>

      <div className="card p-4 overflow-x-auto">
        <table className="table text-sm">
          <thead><tr><th>School</th><th>Registered email</th><th>Web address</th><th>Plan</th><th>Students</th><th>Valid until</th><th>Status</th><th>Last check</th><th></th></tr></thead>
          <tbody>
            {rows.map(l => {
              const [label, cls] = state(l);
              return (
                <tr key={l.id}>
                  <td>{l.school_name}{l.contact_phone && <div className="text-xs text-gray-500">{l.contact_name} {l.contact_phone}</div>}</td>
                  <td>{l.email}</td>
                  <td>{l.domain || <span className="text-gray-400">any</span>}{l.seen_at && l.seen_at !== l.domain && <div className="text-xs text-gray-500">seen at {l.seen_at}</div>}</td>
                  <td>{l.plan_name || '—'}<div className="text-xs text-gray-500">{l.areas ? `${l.areas.length} modules` : 'all modules'}</div></td>
                  <td>{l.students ?? '—'}{l.max_students ? ` / ${l.max_students}` : ''}</td>
                  <td>{l.expires_on ? fmtDate(l.expires_on) : 'No expiry'}</td>
                  <td className={cls}>{label}</td>
                  <td>{l.last_seen ? fmtDateTime(`${l.last_seen.replace(' ', 'T')}Z`) : <span className="text-gray-400">never</span>}</td>
                  <td className="whitespace-nowrap text-xs">
                    <button className="text-brand-600 hover:underline mr-2" onClick={() => edit(l)}>Edit</button>
                    <button className="text-brand-600 hover:underline mr-2" onClick={() => showInstalls(l.id)}>Installs ({l.installs})</button>
                    {!l.installs && <button className="text-red-600 hover:underline" onClick={() => remove(l)}>Delete</button>}
                  </td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={9} className="text-center py-4 text-gray-500">No licences yet.</td></tr>}
          </tbody>
        </table>
        <button className="text-xs text-brand-600 underline mt-2" onClick={() => showInstalls(0)}>Checks from emails without a licence</button>
      </div>

      {installs && (
        <div className="card p-4 mt-4 overflow-x-auto text-sm">
          <div className="flex justify-between mb-2"><h3 className="font-semibold text-brand-700">{installs.id ? 'Installs using this licence' : 'Checks from emails without a licence'}</h3>
            <button className="text-gray-500" onClick={() => setInstalls(null)}>Close</button></div>
          <table className="table text-sm">
            <thead><tr><th>Email</th><th>Web address</th><th>Result</th><th>Students</th><th>IP</th><th>First seen</th><th>Last seen</th></tr></thead>
            <tbody>
              {installs.rows.map(i => (
                <tr key={i.install_id}><td>{i.email}</td><td>{i.domain || '—'}</td><td>{i.result}</td><td>{i.students ?? '—'}</td><td>{i.ip}</td>
                  <td>{fmtDateTime(`${i.first_seen.replace(' ', 'T')}Z`)}</td><td>{fmtDateTime(`${i.last_seen.replace(' ', 'T')}Z`)}</td></tr>
              ))}
              {!installs.rows.length && <tr><td colSpan={7} className="text-center py-4 text-gray-500">None.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
