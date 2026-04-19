'use client';

import { useState } from 'react';
import Shell from '@/components/Shell';

type Event = {
  id: number;
  event_date: string;
  type: 'Event' | 'Holiday' | 'Special Day' | 'Workshop For Teachers' | 'Workshop For Students';
  name: string;
  description: string;
  attachment?: string;
};

const TYPES: Event['type'][] = ['Event', 'Holiday', 'Special Day', 'Workshop For Teachers', 'Workshop For Students'];

export default function CalendarPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [draft, setDraft] = useState<Omit<Event, 'id'>>({ event_date: '', type: 'Event', name: '', description: '', attachment: '' });
  const [msg, setMsg] = useState<string | null>(null);

  function flash(m: string) { setMsg(m); setTimeout(() => setMsg(null), 2500); }

  function save(row?: Event) {
    if (row) {
      setEvents(x => x.map(e => e.id === row.id ? row : e));
      flash('Event updated.');
    } else {
      if (!draft.name || !draft.event_date) return;
      setEvents(x => [{ ...draft, id: Date.now() }, ...x]);
      setDraft({ event_date: '', type: 'Event', name: '', description: '', attachment: '' });
      flash('Event added.');
    }
  }

  return (
    <Shell>
      <div className="text-xs text-gray-500 mb-1">Dashboard › School Calendar</div>
      <div className="flex items-baseline gap-3 mb-4">
        <span className="text-brand-600 text-2xl leading-none">📅</span>
        <h2 className="text-xl font-bold text-brand-700">Manage School Calendar</h2>
        <span className="text-sm text-gray-500">Events, Holidays & Workshops</span>
      </div>

      {msg && <div className="text-sm bg-green-50 border border-green-200 text-green-700 rounded px-3 py-2 mb-3">{msg}</div>}

      <div className="card p-4 overflow-x-auto">
        <table className="table text-sm">
          <thead><tr>
            <th>Event Date</th><th>Type</th><th>Event Name</th><th>Description</th><th>Upload File</th><th>Attachment</th><th>Action</th>
          </tr></thead>
          <tbody>
            <tr className="bg-brand-50/40">
              <td><input className="input" type="date" value={draft.event_date} onChange={e => setDraft({ ...draft, event_date: e.target.value })} /></td>
              <td>
                <select className="input" value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value as Event['type'] })}>
                  {TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </td>
              <td><input className="input" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="Event Name" /></td>
              <td><input className="input" value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} placeholder="Description" /></td>
              <td><input className="input" type="file" onChange={e => setDraft({ ...draft, attachment: e.target.files?.[0]?.name || '' })} /></td>
              <td>{draft.attachment || '—'}</td>
              <td><button className="btn btn-primary text-xs py-1" onClick={() => save()}>Save</button></td>
            </tr>
            {events.map(ev => (
              <tr key={ev.id}>
                <td><input className="input" type="date" value={ev.event_date}
                  onChange={e => setEvents(x => x.map(r => r.id === ev.id ? { ...r, event_date: e.target.value } : r))} /></td>
                <td>
                  <select className="input" value={ev.type}
                    onChange={e => setEvents(x => x.map(r => r.id === ev.id ? { ...r, type: e.target.value as Event['type'] } : r))}>
                    {TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </td>
                <td><input className="input" value={ev.name}
                  onChange={e => setEvents(x => x.map(r => r.id === ev.id ? { ...r, name: e.target.value } : r))} /></td>
                <td><input className="input" value={ev.description}
                  onChange={e => setEvents(x => x.map(r => r.id === ev.id ? { ...r, description: e.target.value } : r))} /></td>
                <td><input className="input" type="file" /></td>
                <td>{ev.attachment || '—'}</td>
                <td>
                  <button className="btn btn-primary text-xs py-1 mr-1" onClick={() => save(ev)}>Save</button>
                  <button className="text-xs text-red-600 hover:underline" onClick={() => setEvents(x => x.filter(r => r.id !== ev.id))}>Delete</button>
                </td>
              </tr>
            ))}
            {!events.length && <tr><td colSpan={7} className="text-center py-3 text-gray-500">No events yet. Add one in the top row.</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
