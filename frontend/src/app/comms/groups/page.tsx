'use client';

import { useEffect, useMemo, useState } from 'react';
import Shell from '@/components/Shell';
import { api, getUser } from '@/lib/api';

type Kind = 'staff' | 'student';
type Group = { id: number; kind: Kind; name: string; description: string | null; member_count: number };

export default function GroupsPage({ searchParams }: { searchParams: { kind?: string } }) {
  const isAdmin = getUser<any>()?.role === 'admin';
  const [kind, setKind] = useState<Kind>(searchParams.kind === 'student' ? 'student' : 'staff');
  const [groups, setGroups] = useState<Group[]>([]);
  const [people, setPeople] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [classFilter, setClassFilter] = useState('');
  const [active, setActive] = useState<Group | null>(null);
  const [members, setMembers] = useState<Set<number>>(new Set());
  const [draft, setDraft] = useState({ name: '', description: '' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const flash = (text: string, ok = true) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 3000); };

  async function load() {
    try { setGroups(await api<Group[]>(`/comm/groups?kind=${kind}`)); } catch (e: any) { flash(e.message, false); }
  }
  useEffect(() => {
    load(); setActive(null);
    api<any[]>(kind === 'staff' ? '/teachers' : '/students').then(setPeople).catch(() => setPeople([]));
    // eslint-disable-next-line
  }, [kind]);
  useEffect(() => { api<any[]>('/classes').then(setClasses).catch(() => {}); }, []);

  async function open(g: Group) {
    try {
      const r = await api<{ members: { id: number }[] }>(`/comm/groups/${g.id}/members`);
      setMembers(new Set(r.members.map(m => m.id))); setActive(g);
    } catch (e: any) { flash(e.message, false); }
  }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      const { id } = await api<{ id: number }>('/comm/groups', { method: 'POST', body: JSON.stringify({ kind, ...draft }) });
      setDraft({ name: '', description: '' }); flash('Group created. Now add members.');
      await load();
      open({ id, kind, name: draft.name, description: draft.description, member_count: 0 });
    } catch (e: any) { flash(e.message, false); }
  }
  async function saveMembers() {
    if (!active) return;
    try {
      await api(`/comm/groups/${active.id}/members`, { method: 'PUT', body: JSON.stringify({ member_ids: [...members] }) });
      flash(`Saved ${members.size} member(s).`); load();
    } catch (e: any) { flash(e.message, false); }
  }
  async function rename(g: Group) {
    const name = prompt('Group name', g.name);
    if (!name || name === g.name) return;
    try { await api(`/comm/groups/${g.id}`, { method: 'PUT', body: JSON.stringify({ name }) }); load(); } catch (e: any) { flash(e.message, false); }
  }
  async function remove(g: Group) {
    if (!confirm(`Delete group "${g.name}"? Members are not affected.`)) return;
    try { await api(`/comm/groups/${g.id}`, { method: 'DELETE' }); if (active?.id === g.id) setActive(null); load(); } catch (e: any) { flash(e.message, false); }
  }

  const shown = useMemo(() => people.filter(p => kind === 'staff' || !classFilter || String(p.class_id) === classFilter), [people, kind, classFilter]);
  const allOn = shown.length > 0 && shown.every(p => members.has(p.id));
  const toggle = (id: number) => setMembers(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <Shell>
      <div className="text-xs text-gray-500 mb-1">Communication › {kind === 'staff' ? 'Manage Staff Groups' : 'Manage Student Groups'}</div>
      <h2 className="text-xl font-bold text-brand-700 mb-4">{kind === 'staff' ? 'Manage Staff Groups' : 'Manage Student Groups'}</h2>
      <div className="flex gap-2 mb-4 border-b">
        {(['staff', 'student'] as Kind[]).map(k => (
          <button key={k} onClick={() => setKind(k)}
            className={`px-3 py-2 text-sm rounded-t border-b-2 -mb-px ${kind === k ? 'border-brand-600 text-brand-700 font-semibold bg-brand-50' : 'border-transparent text-gray-600'}`}>
            {k === 'staff' ? 'Staff Groups' : 'Student Groups'}
          </button>
        ))}
      </div>
      {msg && <div className={`text-sm rounded px-3 py-2 mb-3 border ${msg.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>{msg.text}</div>}

      <div className="grid lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {isAdmin && (
            <form onSubmit={create} className="card p-4 grid gap-2 text-sm">
              <div><label className="label">New Group Name *</label><input className="input" required value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder={kind === 'staff' ? 'e.g. Science Department' : 'e.g. School Choir'} /></div>
              <div><label className="label">Description</label><input className="input" value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></div>
              <div><button className="btn btn-primary">Create Group</button></div>
            </form>
          )}
          <div className="card p-0 overflow-hidden">
            <ul className="divide-y text-sm">
              {groups.map(g => (
                <li key={g.id} className={`px-3 py-2 flex items-center gap-2 ${active?.id === g.id ? 'bg-brand-50' : ''}`}>
                  <button className="flex-1 text-left" onClick={() => open(g)}>
                    <div className="font-medium text-brand-700">{g.name}</div>
                    <div className="text-xs text-gray-500">{g.member_count} member(s){g.description ? ` · ${g.description}` : ''}</div>
                  </button>
                  {isAdmin && <>
                    <button className="text-xs text-brand-600 hover:underline" onClick={() => rename(g)}>Rename</button>
                    <button className="text-xs text-red-600 hover:underline" onClick={() => remove(g)}>Delete</button>
                  </>}
                </li>
              ))}
              {!groups.length && <li className="px-3 py-4 text-gray-500">No groups yet.</li>}
            </ul>
          </div>
        </div>

        <div className="card p-4 lg:col-span-3 text-sm">
          {!active ? <div className="text-gray-500">Choose a group to see {isAdmin ? 'and edit ' : ''}its members.</div> : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h3 className="font-semibold text-brand-700">{active.name}: {members.size} member(s)</h3>
                {isAdmin && <button className="btn btn-primary text-sm" onClick={saveMembers}>Save Members</button>}
              </div>
              {kind === 'student' && (
                <select className="input mb-2 max-w-xs" value={classFilter} onChange={e => setClassFilter(e.target.value)}>
                  <option value="">All classes</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name} {c.section}</option>)}
                </select>
              )}
              <div className="border rounded max-h-[28rem] overflow-y-auto">
                {isAdmin && (
                  <label className="flex items-center gap-2 px-3 py-2 bg-brand-50 font-medium sticky top-0">
                    <input type="checkbox" checked={allOn} onChange={() => setMembers(s => { const n = new Set(s); shown.forEach(p => (allOn ? n.delete(p.id) : n.add(p.id))); return n; })} /> Select all shown
                  </label>
                )}
                {shown.filter(p => isAdmin || members.has(p.id)).map(p => (
                  <label key={p.id} className="flex items-center gap-2 px-3 py-1.5 border-t">
                    {isAdmin && <input type="checkbox" checked={members.has(p.id)} onChange={() => toggle(p.id)} />}
                    <span className="flex-1">{p.full_name} <span className="text-xs text-gray-500">{p.employee_no || p.admission_no}{p.class_name ? ` · ${p.class_name} ${p.class_section}` : ''}</span></span>
                    <span className="text-xs text-gray-500">{p.phone || p.contact || ''}</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </Shell>
  );
}
