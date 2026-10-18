'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, getUser } from '@/lib/api';

type EventType = 'Event' | 'Holiday' | 'Special Day' | 'Workshop For Teachers' | 'Workshop For Students';
type Event = {
  id: number;
  event_date: string;
  type: EventType;
  name: string;
  description: string | null;
  attachment?: string | null;
};
type Draft = Omit<Event, 'id'>;

const TYPES: EventType[] = ['Event', 'Holiday', 'Special Day', 'Workshop For Teachers', 'Workshop For Students'];
const EMPTY: Draft = { event_date: '', type: 'Event', name: '', description: '', attachment: '' };

export default function CalendarPage() {
  const isAdmin = getUser<any>()?.role === 'admin';
  const [events, setEvents] = useState<Event[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function flash(text: string, ok = true) { setMsg({ ok, text }); setTimeout(() => setMsg(null), 3000); }

  async function load() {
    try { setEvents(await api<Event[]>('/events')); } catch (e: any) { flash(e.message, false); }
  }
  useEffect(() => { load(); }, []);

  const patch = (id: number, p: Partial<Event>) => setEvents(x => x.map(r => (r.id === id ? { ...r, ...p } : r)));

  async function add() {
    if (!draft.name || !draft.event_date) return flash('Event Date and Event Name are required.', false);
    try {
      await api('/events', { method: 'POST', body: JSON.stringify(draft) });
      setDraft(EMPTY);
      flash('Event added.');
      load();
    } catch (e: any) { flash(e.message, false); }
  }

  async function update(ev: Event) {
    try {
      const { id, ...body } = ev;
      await api(`/events/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      flash('Event updated.');
      load();
    } catch (e: any) { flash(e.message, false); }
  }

  async function remove(ev: Event) {
    if (!confirm(`Delete "${ev.name}"?`)) return;
    try {
      await api(`/events/${ev.id}`, { method: 'DELETE' });
      flash('Event deleted.');
      load();
    } catch (e: any) { flash(e.message, false); }
  }

  return (
    <Shell>
      <div className="text-xs text-gray-500 mb-1">Dashboard › School Calendar</div>
      <div className="flex items-baseline gap-3 mb-4">
        <span className="text-brand-600 text-2xl leading-none">📅</span>
        <h2 className="text-xl font-bold text-brand-700">{isAdmin ? 'Manage School Calendar' : 'School Calendar'}</h2>
        <span className="text-sm text-gray-500">Events, Holidays & Workshops</span>
      </div>

      {msg && (
        <div className={`text-sm rounded px-3 py-2 mb-3 border ${msg.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {msg.text}
        </div>
      )}

      <div className="card p-4 overflow-x-auto">
        <table className="table text-sm">
          <thead><tr>
            <th>Event Date</th><th>Type</th><th>Event Name</th><th>Description</th><th>Attachment</th>{isAdmin && <th>Action</th>}
          </tr></thead>
          <tbody>
            {isAdmin && (
              <tr className="bg-brand-50/40">
                <td><input className="input" type="date" value={draft.event_date} onChange={e => setDraft({ ...draft, event_date: e.target.value })} /></td>
                <td>
                  <select className="input" value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value as EventType })}>
                    {TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </td>
                <td><input className="input" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="Event Name" /></td>
                <td><input className="input" value={draft.description || ''} onChange={e => setDraft({ ...draft, description: e.target.value })} placeholder="Description" /></td>
                <td><input className="input" value={draft.attachment || ''} onChange={e => setDraft({ ...draft, attachment: e.target.value })} placeholder="Link to file (https://…)" /></td>
                <td><button className="btn btn-primary text-xs py-1" onClick={add}>Save</button></td>
              </tr>
            )}
            {events.map(ev => isAdmin ? (
              <tr key={ev.id}>
                <td><input className="input" type="date" value={ev.event_date} onChange={e => patch(ev.id, { event_date: e.target.value })} /></td>
                <td>
                  <select className="input" value={ev.type} onChange={e => patch(ev.id, { type: e.target.value as EventType })}>
                    {TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </td>
                <td><input className="input" value={ev.name} onChange={e => patch(ev.id, { name: e.target.value })} /></td>
                <td><input className="input" value={ev.description || ''} onChange={e => patch(ev.id, { description: e.target.value })} /></td>
                <td><input className="input" value={ev.attachment || ''} onChange={e => patch(ev.id, { attachment: e.target.value })} placeholder="https://…" /></td>
                <td className="whitespace-nowrap">
                  <button className="btn btn-primary text-xs py-1 mr-1" onClick={() => update(ev)}>Save</button>
                  <button className="text-xs text-red-600 hover:underline" onClick={() => remove(ev)}>Delete</button>
                </td>
              </tr>
            ) : (
              <tr key={ev.id}>
                <td>{ev.event_date}</td><td>{ev.type}</td><td>{ev.name}</td><td>{ev.description || '—'}</td>
                <td>{ev.attachment ? <a href={ev.attachment} target="_blank" rel="noreferrer" className="text-brand-600 underline">View</a> : '—'}</td>
              </tr>
            ))}
            {!events.length && <tr><td colSpan={isAdmin ? 6 : 5} className="text-center py-3 text-gray-500">No events yet.{isAdmin && ' Add one in the top row.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
