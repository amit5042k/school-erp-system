'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';

type Parent = { id: number; username: string; full_name: string; phone: string | null; active: number; children: number; child_names: string | null };
type Child = { student_id: number; full_name: string; admission_no: string; class_name: string | null; class_section: string | null; active: number };
type Student = { id: number; full_name: string; admission_no: string; class_name?: string; class_section?: string };

export default function ParentChildrenPage() {
  const [parents, setParents] = useState<Parent[]>([]);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Parent | null>(null);
  const [kids, setKids] = useState<Child[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [find, setFind] = useState('');
  const [pick, setPick] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const flash = (text: string, ok = true) => { setMsg({ ok, text }); if (ok) setTimeout(() => setMsg(null), 3000); };

  const loadParents = () => api<Parent[]>('/family/parents').then(setParents).catch(e => flash(e.message, false));
  useEffect(() => {
    loadParents();
    api<Student[]>('/students').then(setStudents).catch(() => {});
  }, []);

  async function open(p: Parent) {
    setSel(p); setPick(''); setFind('');
    try { setKids(await api<Child[]>(`/family/parents/${p.id}/children`)); } catch (e: any) { flash(e.message, false); }
  }
  async function add() {
    if (!sel || !pick) return;
    try {
      await api(`/family/parents/${sel.id}/children`, { method: 'POST', body: JSON.stringify({ student_id: Number(pick) }) });
      flash('Child added.'); setPick(''); setFind(''); open(sel); loadParents();
    } catch (e: any) { flash(e.message, false); }
  }
  async function remove(c: Child) {
    if (!sel || !confirm(`Remove ${c.full_name} from ${sel.full_name}'s login?`)) return;
    try { await api(`/family/parents/${sel.id}/children/${c.student_id}`, { method: 'DELETE' }); flash('Child removed.'); open(sel); loadParents(); }
    catch (e: any) { flash(e.message, false); }
  }

  const shownParents = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? parents.filter(p => `${p.username} ${p.full_name} ${p.phone || ''} ${p.child_names || ''}`.toLowerCase().includes(s)) : parents;
  }, [parents, q]);
  const candidates = useMemo(() => {
    const s = find.trim().toLowerCase();
    const linked = new Set(kids.map(k => k.student_id));
    return students.filter(st => !linked.has(st.id) && (!s || `${st.admission_no} ${st.full_name}`.toLowerCase().includes(s))).slice(0, 200);
  }, [students, kids, find]);

  return (
    <Shell>
      <div className="text-xs text-gray-500 mb-1"><Link href="/users" className="hover:underline">Users &amp; Roles</Link> › Parent Children</div>
      <h2 className="text-xl font-bold text-brand-700">Parents with several children</h2>
      <p className="text-sm text-gray-600 mb-4 max-w-3xl">
        Link brothers and sisters to one parent login. The parent then picks which child to view from the menu at the top of every page.
        To add many at once, use <Link href="/imports" className="text-brand-600 underline">Bulk Import › Parent Logins</Link> and repeat the same username for each child.
      </p>
      {msg && <div className={`text-sm rounded px-3 py-2 mb-3 border ${msg.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>{msg.text}</div>}

      <div className="grid lg:grid-cols-[22rem_1fr] gap-4">
        <div className="card p-3">
          <input className="input mb-2" placeholder="Search parent, phone or child…" value={q} onChange={e => setQ(e.target.value)} />
          <div className="max-h-[32rem] overflow-y-auto divide-y">
            {shownParents.map(p => (
              <button key={p.id} onClick={() => open(p)}
                className={`w-full text-left px-2 py-2 text-sm ${sel?.id === p.id ? 'bg-brand-50' : 'hover:bg-gray-50'}`}>
                <div className="flex justify-between gap-2">
                  <span className="font-medium">{p.full_name}</span>
                  <span className={`badge ${p.children > 1 ? 'badge-green' : 'badge-gray'}`}>{p.children} child{p.children === 1 ? '' : 'ren'}</span>
                </div>
                <div className="text-[11px] text-gray-500 truncate">{p.username}{p.phone ? ` · ${p.phone}` : ''}{p.child_names ? ` · ${p.child_names}` : ''}{!p.active ? ' · disabled' : ''}</div>
              </button>
            ))}
            {!shownParents.length && <div className="text-sm text-gray-500 py-4 text-center">No parent logins found.</div>}
          </div>
        </div>

        <div className="card p-4">
          {!sel ? <div className="text-sm text-gray-500">Choose a parent login on the left.</div> : (
            <>
              <h3 className="font-semibold text-brand-700">{sel.full_name} <span className="text-xs text-gray-500 font-normal">({sel.username})</span></h3>
              <table className="table text-sm mt-3">
                <thead><tr><th>Child</th><th>Adm No</th><th>Class</th><th></th></tr></thead>
                <tbody>
                  {kids.map(c => (
                    <tr key={c.student_id}>
                      <td>{c.full_name} {c.active ? <span className="badge badge-green ml-1">Showing now</span> : null}</td>
                      <td className="font-mono text-xs">{c.admission_no}</td>
                      <td>{c.class_name ? `${c.class_name} ${c.class_section || ''}` : '—'}</td>
                      <td className="text-right">
                        <button className="text-xs text-red-600 hover:underline disabled:opacity-40" disabled={kids.length === 1} title={kids.length === 1 ? 'A parent login needs at least one child' : ''} onClick={() => remove(c)}>Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="grid md:grid-cols-[1fr_1fr_auto] gap-2 items-end mt-4 text-sm">
                <div><label className="label">Find student</label><input className="input" placeholder="Name or admission no" value={find} onChange={e => setFind(e.target.value)} /></div>
                <div><label className="label">Add child</label>
                  <select className="input" value={pick} onChange={e => setPick(e.target.value)}>
                    <option value="">— Select student —</option>
                    {candidates.map(st => <option key={st.id} value={st.id}>{st.admission_no} — {st.full_name}{st.class_name ? ` (${st.class_name} ${st.class_section || ''})` : ''}</option>)}
                  </select></div>
                <button className="btn btn-primary" onClick={add} disabled={!pick}>Add Child</button>
              </div>
            </>
          )}
        </div>
      </div>
    </Shell>
  );
}
