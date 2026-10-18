'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { FlashBox, useClasses, useFlash, type ClassRow } from './common';

type Teacher = { id: number; full_name: string };

export default function SectionsPanel() {
  const { classes, reload } = useClasses();
  const { msg, flash } = useFlash();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [draft, setDraft] = useState({ name: '', section: '' });
  const [renaming, setRenaming] = useState<Record<number, string>>({});

  useEffect(() => { api<Teacher[]>('/teachers').then(setTeachers).catch(() => {}); }, []);

  const groups = useMemo(() => {
    const m = new Map<string, ClassRow[]>();
    for (const c of classes) m.set(c.name, [...(m.get(c.name) || []), c]);
    return [...m.entries()];
  }, [classes]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.name.trim() || !draft.section.trim()) return flash('Class and section are required.', false);
    try {
      await api('/classes', { method: 'POST', body: JSON.stringify({ name: draft.name.trim(), section: draft.section.trim().toUpperCase() }) });
      flash(`Section ${draft.section.toUpperCase()} added to ${draft.name}.`);
      setDraft({ name: draft.name, section: '' });
      reload();
    } catch (e: any) { flash(e.message, false); }
  }

  async function update(c: ClassRow, body: Partial<ClassRow>, done: string) {
    try {
      await api(`/classes/${c.id}`, { method: 'PUT', body: JSON.stringify(body) });
      flash(done);
      setRenaming(r => { const n = { ...r }; delete n[c.id]; return n; });
      reload();
    } catch (e: any) { flash(e.message, false); }
  }

  async function remove(c: ClassRow) {
    if (!confirm(`Delete section ${c.name} ${c.section}?`)) return;
    try { await api(`/classes/${c.id}`, { method: 'DELETE' }); flash('Section deleted.'); reload(); }
    catch (e: any) { flash(e.message, false); }
  }

  return (
    <div>
      <FlashBox msg={msg} />
      <form onSubmit={add} className="card p-4 mb-4 grid md:grid-cols-4 gap-3 text-sm">
        <div>
          <label className="label">Class *</label>
          <input className="input" list="academic-class-names" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Class 8" />
          <datalist id="academic-class-names">{groups.map(([n]) => <option key={n} value={n} />)}</datalist>
        </div>
        <div><label className="label">New Section *</label><input className="input" value={draft.section} onChange={e => setDraft({ ...draft, section: e.target.value })} placeholder="e.g. C" /></div>
        <div className="flex items-end"><button className="btn btn-primary">Add Section</button></div>
      </form>

      <div className="grid lg:grid-cols-2 gap-4">
        {groups.map(([name, secs]) => (
          <div key={name} className="card p-0 overflow-hidden">
            <div className="bg-brand-600 text-white px-3 py-2 text-sm font-semibold flex justify-between">
              <span>{name}</span><span>{secs.reduce((n, s) => n + (s.strength || 0), 0)} students</span>
            </div>
            <div className="overflow-x-auto">
              <table className="table text-sm">
                <thead><tr><th>Section</th><th>Strength</th><th>Class Teacher</th><th></th></tr></thead>
                <tbody>
                  {secs.map(c => (
                    <tr key={c.id}>
                      <td>
                        {c.id in renaming ? (
                          <span className="flex gap-1">
                            <input className="input w-20" value={renaming[c.id]} onChange={e => setRenaming(r => ({ ...r, [c.id]: e.target.value }))} />
                            <button className="btn btn-primary text-xs py-1" onClick={() => update(c, { section: renaming[c.id].trim().toUpperCase() }, 'Section renamed.')}>Save</button>
                          </span>
                        ) : <b>{c.section}</b>}
                      </td>
                      <td>{c.strength ?? 0}</td>
                      <td>
                        <select className="input" value={c.class_teacher_id ?? ''}
                          onChange={e => update(c, { class_teacher_id: e.target.value ? Number(e.target.value) : null }, `Class teacher updated for ${c.name} ${c.section}.`)}>
                          <option value="">— None —</option>
                          {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                        </select>
                      </td>
                      <td className="whitespace-nowrap text-xs">
                        {!(c.id in renaming) && <button className="text-brand-600 hover:underline mr-2" onClick={() => setRenaming(r => ({ ...r, [c.id]: c.section }))}>Rename</button>}
                        <button className="text-red-600 hover:underline disabled:opacity-40" disabled={!!c.strength}
                          title={c.strength ? 'Move the students out first' : ''} onClick={() => remove(c)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        {!groups.length && <div className="text-sm text-gray-500">No classes yet.</div>}
      </div>
    </div>
  );
}
