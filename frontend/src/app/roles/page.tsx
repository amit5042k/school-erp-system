'use client';

import { useEffect, useMemo, useState } from 'react';
import Shell from '@/components/Shell';
import { api, getStoredUser } from '@/lib/api';

type Level = 'none' | 'standard' | 'full';
type Area = { key: string; label: string };
type Role = { key: string; name: string; builtin: boolean; users: number; perms: Record<string, Level> };

const LEVEL_UI: { key: Level; label: string; hint: string; on: string }[] = [
  { key: 'none', label: 'No access', hint: 'Hidden, except their own records', on: 'bg-gray-700 text-white' },
  { key: 'standard', label: 'Standard', hint: 'Like a teacher: view and day-to-day entry', on: 'bg-brand-600 text-white' },
  { key: 'full', label: 'Full', hint: 'Like the Super Admin for this area', on: 'bg-green-600 text-white' },
];

export default function RolesPage() {
  const me = getStoredUser<any>();
  const [areas, setAreas] = useState<Area[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [sel, setSel] = useState<string>('principal');
  const [draft, setDraft] = useState<Record<string, Level> | null>(null);
  const [name, setName] = useState('');
  const [newRole, setNewRole] = useState({ name: '', copy_from: 'staff' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const flash = (text: string, ok = true) => { setMsg({ ok, text }); if (ok) setTimeout(() => setMsg(null), 3000); };

  async function load(keep?: string) {
    try {
      const r = await api<{ areas: Area[]; roles: Role[] }>('/roles');
      setAreas(r.areas); setRoles(r.roles);
      const k = keep && r.roles.some(x => x.key === keep) ? keep : r.roles[0]?.key;
      if (k) pick(k, r.roles);
    } catch (e: any) { flash(e.message, false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  function pick(key: string, list = roles) {
    const r = list.find(x => x.key === key);
    if (!r) return;
    setSel(key); setDraft({ ...r.perms }); setName(r.name);
  }

  const role = roles.find(r => r.key === sel);
  const ownRole = me?.baseRole === 'teacher' && me?.roleKey === sel;
  const dirty = useMemo(() => !!role && !!draft && (name !== role.name || areas.some(a => draft[a.key] !== role.perms[a.key])), [role, draft, name, areas]);

  async function save() {
    if (!role || !draft) return;
    try {
      await api(`/roles/${role.key}`, { method: 'PUT', body: JSON.stringify({ name, perms: draft }) });
      flash(`${name} saved. People with this role get the change straight away.`);
      load(role.key);
    } catch (e: any) { flash(e.message, false); }
  }
  async function add(e: React.FormEvent) {
    e.preventDefault();
    try {
      const { key } = await api<{ key: string }>('/roles', { method: 'POST', body: JSON.stringify(newRole) });
      setNewRole({ name: '', copy_from: 'staff' });
      flash('Role added. Set its permissions, then assign it in Users & Roles.');
      load(key);
    } catch (e: any) { flash(e.message, false); }
  }
  async function remove() {
    if (!role || !confirm(`Delete the role "${role.name}"?`)) return;
    try { await api(`/roles/${role.key}`, { method: 'DELETE' }); flash('Role deleted.'); load(); }
    catch (e: any) { flash(e.message, false); }
  }
  const setAll = (lvl: Level) => setDraft(d => (d ? Object.fromEntries(areas.map(a => [a.key, lvl])) as Record<string, Level> : d));

  return (
    <Shell>
      <div className="text-xs text-gray-500 mb-1">Settings › Roles &amp; Permissions</div>
      <h2 className="text-xl font-bold text-brand-700">Roles &amp; Permissions</h2>
      <p className="text-sm text-gray-600 mb-4 max-w-3xl">
        Each staff login has one role. For every area choose <b>No access</b>, <b>Standard</b> (what a teacher can do) or <b>Full</b> (what the Super Admin can do).
        Everyone can always see their own leaves, payslips, timetable and school notices. Students and parents aren&apos;t affected.
      </p>

      {msg && <div className={`text-sm rounded px-3 py-2 mb-3 border ${msg.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>{msg.text}</div>}

      <div className="grid lg:grid-cols-[16rem_1fr] gap-4">
        <div className="space-y-3">
          <div className="card p-2">
            {roles.map(r => (
              <button key={r.key} onClick={() => pick(r.key)}
                className={`w-full text-left px-3 py-2 rounded text-sm flex justify-between items-center ${r.key === sel ? 'bg-brand-600 text-white' : 'hover:bg-brand-50'}`}>
                <span>{r.name}</span><span className={`text-[11px] ${r.key === sel ? 'opacity-90' : 'text-gray-500'}`}>{r.users} login{r.users === 1 ? '' : 's'}</span>
              </button>
            ))}
          </div>
          <form onSubmit={add} className="card p-3 text-sm space-y-2">
            <div className="font-semibold text-brand-700">Add a role</div>
            <input className="input" placeholder="e.g. Librarian" required value={newRole.name} onChange={e => setNewRole({ ...newRole, name: e.target.value })} />
            <label className="label">Start from</label>
            <select className="input" value={newRole.copy_from} onChange={e => setNewRole({ ...newRole, copy_from: e.target.value })}>
              {roles.map(r => <option key={r.key} value={r.key}>{r.name}</option>)}
            </select>
            <button className="btn btn-primary w-full">Add Role</button>
          </form>
        </div>

        {role && draft && (
          <div className="card p-4">
            <div className="flex flex-wrap items-end gap-3 mb-3">
              <div className="flex-1 min-w-[12rem]"><label className="label">Role name</label>
                <input className="input" value={name} onChange={e => setName(e.target.value)} disabled={ownRole} /></div>
              <div className="flex gap-1 text-xs">
                <span className="text-gray-500 self-center mr-1">Set all:</span>
                {LEVEL_UI.map(l => <button key={l.key} type="button" disabled={ownRole} className="px-2 py-1 rounded border hover:bg-gray-50 disabled:opacity-50" onClick={() => setAll(l.key)}>{l.label}</button>)}
              </div>
            </div>
            {ownRole && <div className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded px-3 py-2 mb-3">This is your own role, so only a Super Admin can change it.</div>}

            <div className="overflow-x-auto">
              <table className="table text-sm">
                <thead><tr><th>Area</th><th className="w-[22rem]">Access</th></tr></thead>
                <tbody>
                  {areas.map(a => (
                    <tr key={a.key}>
                      <td className="font-medium">{a.label}</td>
                      <td>
                        <div className="inline-flex rounded border overflow-hidden">
                          {LEVEL_UI.map(l => (
                            <button key={l.key} type="button" title={l.hint} disabled={ownRole}
                              onClick={() => setDraft(d => ({ ...(d || {}), [a.key]: l.key }))}
                              className={`px-3 py-1 text-xs border-r last:border-r-0 ${draft[a.key] === l.key ? l.on : 'bg-white hover:bg-gray-50'} disabled:cursor-not-allowed`}>
                              {l.label}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap gap-2 mt-4">
              <button className="btn btn-primary" onClick={save} disabled={!dirty || ownRole}>Save Changes</button>
              <button className="btn bg-gray-200" onClick={() => pick(role.key)} disabled={!dirty}>Undo</button>
              {!role.builtin && <button className="btn bg-red-600 text-white hover:bg-red-700 ml-auto" onClick={remove}>Delete Role</button>}
            </div>
            <p className="text-xs text-gray-500 mt-3">
              {LEVEL_UI.map(l => <span key={l.key} className="mr-4"><b>{l.label}:</b> {l.hint}</span>)}
            </p>
          </div>
        )}
      </div>
    </Shell>
  );
}
