'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import ExploreOptions from '@/components/ExploreOptions';
import { api } from '@/lib/api';

type Visitor = { id: number; visitor_name: string; phone: string; purpose: string; to_meet: string; id_proof: string; in_time: string; out_time?: string; remarks?: string };

export default function VisitorsPage() {
  const [rows, setRows] = useState<Visitor[]>([]);
  const [adding, setAdding] = useState(false);
  const [listing, setListing] = useState(false);
  const [form, setForm] = useState<any>({ visitor_name: '', phone: '', purpose: '', to_meet: '', id_proof: '', remarks: '' });
  const [err, setErr] = useState<string | null>(null);

  async function load() { try { setRows(await api<Visitor[]>('/visitors')); } catch (e: any) { setErr(e.message); } }
  useEffect(() => { load(); }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api('/visitors', { method: 'POST', body: JSON.stringify({ ...form, in_time: new Date().toISOString() }) });
      setForm({ visitor_name: '', phone: '', purpose: '', to_meet: '', id_proof: '', remarks: '' });
      setAdding(false);
      setListing(true);
      load();
    } catch (e: any) { setErr(e.message); }
  }

  return (
    <Shell>
      <ExploreOptions
        icon="🏢"
        title="Front Office"
        subtitle="Visitor Book & Incidents — Explore Options"
        breadcrumb={['Dashboard', 'Front Office']}
        columns={3}
        groups={[
          { title: 'Visitors', actions: [
            { label: 'Add Visitor', onClick: () => setAdding(true) },
            { label: 'Manage Visitor', onClick: () => setListing(true) },
            { label: 'Manage Purposes To Meet' },
          ]},
          { title: 'Incidents', actions: [
            { label: 'Add Incident Categories' },
            { label: 'Add Incident Purpose' },
            { label: 'Add Student Incident', href: '/incidents' },
            { label: 'Incident Dashboard', href: '/incidents' },
            { label: 'View Incident Report', href: '/incidents' },
          ]},
          { title: 'Prospectus', actions: [
            { label: 'Enter Prospectus', href: '/prospectus' },
            { label: 'Manage Prospectus', href: '/prospectus' },
          ]},
        ]}
      />

      {err && <div className="text-red-700 text-sm mt-4">{err}</div>}

      {adding && (
        <form onSubmit={save} className="card p-4 mt-6 mb-4 grid md:grid-cols-3 gap-3 text-sm">
          <div className="md:col-span-3 flex items-center justify-between">
            <h3 className="font-semibold text-brand-700">Add Visitor</h3>
            <button type="button" className="text-xs text-gray-500 hover:underline" onClick={() => setAdding(false)}>Cancel</button>
          </div>
          <div><label className="label">Visitor Name *</label><input className="input" required value={form.visitor_name} onChange={e => setForm({ ...form, visitor_name: e.target.value })} /></div>
          <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
          <div><label className="label">Purpose</label><input className="input" value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })} /></div>
          <div><label className="label">To Meet</label><input className="input" value={form.to_meet} onChange={e => setForm({ ...form, to_meet: e.target.value })} /></div>
          <div><label className="label">ID Proof</label><input className="input" value={form.id_proof} onChange={e => setForm({ ...form, id_proof: e.target.value })} /></div>
          <div className="md:col-span-3"><label className="label">Remarks</label><textarea className="input" value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} /></div>
          <div className="md:col-span-3"><button className="btn btn-primary">Save Visitor</button></div>
        </form>
      )}

      {listing && (
        <div className="card p-4 mt-6 overflow-x-auto">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-brand-700">Manage Visitor</h3>
            <button className="text-xs text-gray-500 hover:underline" onClick={() => setListing(false)}>Close</button>
          </div>
          <table className="table">
            <thead><tr><th>Visitor</th><th>Phone</th><th>Purpose</th><th>To Meet</th><th>In</th><th>Out</th></tr></thead>
            <tbody>
              {rows.map(v => (
                <tr key={v.id}>
                  <td>{v.visitor_name}</td><td>{v.phone}</td><td>{v.purpose}</td><td>{v.to_meet}</td>
                  <td>{v.in_time ? new Date(v.in_time).toLocaleString() : '—'}</td>
                  <td>{v.out_time ? new Date(v.out_time).toLocaleString() : '—'}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={6} className="text-center py-4 text-gray-500">No visitors.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
