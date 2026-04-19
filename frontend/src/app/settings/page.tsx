'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';

export default function SettingsPage() {
  const [s, setS] = useState<any>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { api('/settings').then(setS); }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api('/settings', { method: 'PUT', body: JSON.stringify(s) });
      setMsg('Settings saved.'); setTimeout(() => setMsg(null), 2500);
    } catch (e: any) { setMsg(e.message); }
  }

  if (!s) return <Shell><div className="text-gray-500">Loading…</div></Shell>;

  return (
    <Shell>
      <h2 className="text-xl font-bold text-brand-700 mb-4">School Settings</h2>
      {msg && <div className="text-sm bg-green-50 border border-green-200 text-green-700 rounded px-3 py-2 mb-3">{msg}</div>}

      <form onSubmit={save} className="card p-4 grid md:grid-cols-2 gap-3 text-sm">
        <div><label className="label">School Name</label><input className="input" value={s.school_name || ''} onChange={e => setS({ ...s, school_name: e.target.value })} /></div>
        <div><label className="label">Academic Year</label><input className="input" value={s.academic_year || ''} onChange={e => setS({ ...s, academic_year: e.target.value })} /></div>
        <div className="md:col-span-2"><label className="label">Address</label><input className="input" value={s.address || ''} onChange={e => setS({ ...s, address: e.target.value })} /></div>
        <div><label className="label">Phone</label><input className="input" value={s.phone || ''} onChange={e => setS({ ...s, phone: e.target.value })} /></div>
        <div><label className="label">Email</label><input className="input" type="email" value={s.email || ''} onChange={e => setS({ ...s, email: e.target.value })} /></div>
        <div><label className="label">Website</label><input className="input" value={s.website || ''} onChange={e => setS({ ...s, website: e.target.value })} /></div>
        <div><label className="label">Logo URL</label><input className="input" value={s.logo_url || ''} onChange={e => setS({ ...s, logo_url: e.target.value })} /></div>
        <div className="md:col-span-2"><button className="btn btn-primary">Save Settings</button></div>
      </form>
    </Shell>
  );
}
