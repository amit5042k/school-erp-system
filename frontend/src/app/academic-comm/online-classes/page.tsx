'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, parseDate } from '@/lib/api';
import { Breadcrumb, useLookups, useRole } from '../_lib/lookups';

type OnlineClass = {
  id: number; class_id: number; class_name: string; class_section: string; subject: string; teacher_id: number | null;
  teacher_name: string | null; start_at: string; ends_at: string; duration_min: number; meeting_url: string; notes: string | null;
  state: 'upcoming' | 'live' | 'ended'; posted_by: number;
};
const EMPTY = { class_id: '', subject: '', teacher_id: '', start_at: '', duration_min: '40', meeting_url: '', notes: '' };
const BADGE = { upcoming: 'badge-amber', live: 'badge-green', ended: 'badge-gray' } as const;
const when = (v: string) => parseDate(v)?.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) || v;

export default function OnlineClassesPage() {
  const { isStaff } = useRole();
  const { opts } = useLookups(['classes', 'subjects', 'teachers']);
  const [rows, setRows] = useState<OnlineClass[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [form, setForm] = useState<Record<string, string>>(EMPTY);
  const [editId, setEditId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const flash = (text: string, ok = true) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 3000); };

  async function load() {
    try { setRows(await api<OnlineClass[]>(`/comm/online-classes${showAll ? '?all=1' : ''}`)); } catch (e: any) { flash(e.message, false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [showAll]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const body = { ...form, class_id: Number(form.class_id), teacher_id: form.teacher_id ? Number(form.teacher_id) : null, duration_min: Number(form.duration_min) };
    try {
      await api(editId ? `/comm/online-classes/${editId}` : '/comm/online-classes', { method: editId ? 'PUT' : 'POST', body: JSON.stringify(body) });
      setForm(EMPTY); setEditId(null); setOpen(false); flash('Online class saved.'); load();
    } catch (e: any) { flash(e.message, false); }
  }
  function edit(r: OnlineClass) {
    setForm({ class_id: String(r.class_id), subject: r.subject, teacher_id: r.teacher_id ? String(r.teacher_id) : '', start_at: r.start_at,
      duration_min: String(r.duration_min), meeting_url: r.meeting_url, notes: r.notes || '' });
    setEditId(r.id); setOpen(true); window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function remove(r: OnlineClass) {
    if (!confirm(`Cancel the ${r.subject} class on ${when(r.start_at)}?`)) return;
    try { await api(`/comm/online-classes/${r.id}`, { method: 'DELETE' }); load(); } catch (e: any) { flash(e.message, false); }
  }
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <Shell>
      <Breadcrumb trail={['Academic Communication', 'Online Classes']} />
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 className="text-xl font-bold text-brand-700">Online Classes</h2>
        <div className="flex items-center gap-3">
          <label className="text-sm flex items-center gap-1"><input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} /> Show past classes</label>
          {isStaff && <button className="btn btn-primary text-sm" onClick={() => { setOpen(o => !o); setForm(EMPTY); setEditId(null); }}>{open ? 'Cancel' : '+ Schedule Class'}</button>}
        </div>
      </div>
      {msg && <div className={`text-sm rounded px-3 py-2 mb-3 border ${msg.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>{msg.text}</div>}

      {open && (
        <form onSubmit={save} className="card p-4 mb-4 grid md:grid-cols-3 gap-3 text-sm">
          <div><label className="label">Class *</label>
            <select className="input" required value={form.class_id} onChange={set('class_id')}>
              <option value="">-- Select --</option>{opts.classes.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select></div>
          <div><label className="label">Subject *</label>
            <select className="input" required value={form.subject} onChange={set('subject')}>
              <option value="">-- Select --</option>{opts.subjects.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select></div>
          <div><label className="label">Teacher</label>
            <select className="input" value={form.teacher_id} onChange={set('teacher_id')}>
              <option value="">—</option>{opts.teachers.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select></div>
          <div><label className="label">Starts At *</label><input className="input" type="datetime-local" required value={form.start_at} onChange={set('start_at')} /></div>
          <div><label className="label">Duration (minutes)</label><input className="input" type="number" min={5} max={480} value={form.duration_min} onChange={set('duration_min')} /></div>
          <div><label className="label">Meeting Link *</label><input className="input" type="url" required placeholder="https://meet.google.com/…" value={form.meeting_url} onChange={set('meeting_url')} /></div>
          <div className="md:col-span-3"><label className="label">Notes for students</label><textarea className="input" rows={2} value={form.notes} onChange={set('notes')} /></div>
          <div className="md:col-span-3"><button className="btn btn-primary">{editId ? 'Save Changes' : 'Schedule'}</button></div>
        </form>
      )}

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {rows.map(r => (
          <div key={r.id} className={`card p-4 ${r.state === 'ended' ? 'opacity-70' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold text-brand-700">{r.subject}</div>
                <div className="text-xs text-gray-500">{r.class_name} {r.class_section}{r.teacher_name ? ` · ${r.teacher_name}` : ''}</div>
              </div>
              <span className={`badge ${BADGE[r.state]}`}>{r.state === 'live' ? 'Live now' : r.state}</span>
            </div>
            <div className="text-sm mt-2">{when(r.start_at)} · {r.duration_min} min</div>
            {r.notes && <div className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">{r.notes}</div>}
            <div className="flex items-center justify-between mt-3">
              {r.state !== 'ended'
                ? <a href={r.meeting_url} target="_blank" rel="noreferrer noopener" className="btn btn-primary text-xs py-1">Join Class</a>
                : <span className="text-xs text-gray-400">Class ended</span>}
              {isStaff && (
                <span className="text-xs">
                  <button className="text-brand-600 hover:underline mr-2" onClick={() => edit(r)}>Edit</button>
                  <button className="text-red-600 hover:underline" onClick={() => remove(r)}>Cancel</button>
                </span>
              )}
            </div>
          </div>
        ))}
        {!rows.length && <div className="card p-6 text-center text-gray-500 md:col-span-3">No {showAll ? '' : 'upcoming '}online classes.</div>}
      </div>
    </Shell>
  );
}
