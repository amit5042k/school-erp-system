'use client';

import { useEffect, useMemo, useState } from 'react';
import Shell from '@/components/Shell';
import { api, fileUrl } from '@/lib/api';
import { Flash, HrHeader, useFlash } from '../_ui';

type Staff = { id: number; employee_no: string; full_name: string; phone: string | null; email: string | null; photo_url: string | null; status: string | null };
type Result = { sent: number; failed: number; skipped: number; links: { name: string; link: string }[] };

export default function PhotoLinksPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [channel, setChannel] = useState<'sms' | 'email' | 'screen'>('screen');
  const [status, setStatus] = useState({ sms: false, email: false });
  const [res, setRes] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const { msg, flash } = useFlash();

  useEffect(() => {
    api<Staff[]>('/teachers').then(setStaff).catch(e => flash(e.message, false));
    api<{ sms: boolean; email: boolean }>('/messaging/status').then(s => { setStatus(s); setChannel(s.sms ? 'sms' : s.email ? 'email' : 'screen'); }).catch(() => {});
    /* eslint-disable-next-line */
  }, []);

  const shown = useMemo(() => staff.filter(s => (s.status || 'active') === 'active' && (!onlyMissing || !s.photo_url)), [staff, onlyMissing]);
  const all = shown.length > 0 && shown.every(s => picked.has(s.id));
  const toggle = (id: number) => setPicked(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function send() {
    if (!picked.size) return flash('Select at least one staff member.', false);
    setBusy(true); setRes(null);
    try {
      const r = await api<Result>('/hr/photo-links', { method: 'POST', body: JSON.stringify({ teacher_ids: [...picked], channel }) });
      setRes(r);
      if (channel !== 'screen') flash(`Sent ${r.sent}, failed ${r.failed}, no ${channel === 'sms' ? 'phone' : 'email'}: ${r.skipped}.`, !r.failed);
    } catch (e: any) { flash(e.message, false); }
    finally { setBusy(false); }
  }

  return (
    <Shell>
      <HrHeader title="Send Image Upload Link" subtitle="Staff get a private link (valid 7 days, usable once) to upload their own photo — no login needed." />
      <Flash msg={msg} />
      <div className="card p-4 mb-4 flex flex-wrap items-end gap-3 text-sm">
        <div><label className="label">Send By</label>
          <select className="input" value={channel} onChange={e => setChannel(e.target.value as any)}>
            <option value="sms" disabled={!status.sms}>SMS{status.sms ? '' : ' (not configured)'}</option>
            <option value="email" disabled={!status.email}>Email{status.email ? '' : ' (not configured)'}</option>
            <option value="screen">Show links on screen</option>
          </select></div>
        <label className="flex items-center gap-2 pb-2"><input type="checkbox" checked={onlyMissing} onChange={e => setOnlyMissing(e.target.checked)} /> Only staff without a photo</label>
        <button className="btn btn-primary" onClick={send} disabled={busy}>{busy ? 'Working…' : `Create links for ${picked.size} selected`}</button>
        <div className="w-full text-xs text-gray-500">Creating a new link cancels any earlier unused link for the same person.</div>
      </div>

      {res && res.links.length > 0 && (
        <div className="card p-4 mb-4 text-sm overflow-x-auto">
          <h3 className="font-semibold text-brand-700 mb-2">Links (share each one privately)</h3>
          <table className="table text-xs">
            <tbody>{res.links.map(l => (
              <tr key={l.link}><td className="whitespace-nowrap">{l.name}</td><td className="font-mono break-all">{l.link}</td>
                <td><button className="text-brand-600 hover:underline" onClick={() => navigator.clipboard?.writeText(l.link).then(() => flash('Copied.'))}>Copy</button></td></tr>
            ))}</tbody>
          </table>
        </div>
      )}

      <div className="card p-4 overflow-x-auto">
        <table className="table text-sm">
          <thead><tr>
            <th><input type="checkbox" checked={all} onChange={() => setPicked(p => { const n = new Set(p); shown.forEach(s => (all ? n.delete(s.id) : n.add(s.id))); return n; })} /></th>
            <th>Photo</th><th>Emp No</th><th>Name</th><th>Phone</th><th>Email</th>
          </tr></thead>
          <tbody>
            {shown.map(s => (
              <tr key={s.id} className="cursor-pointer" onClick={() => toggle(s.id)}>
                <td><input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} onClick={e => e.stopPropagation()} /></td>
                <td>{s.photo_url ? <img src={fileUrl(s.photo_url)} alt="" className="w-8 h-8 rounded-full object-cover" /> : <span className="text-xs text-gray-400">None</span>}</td>
                <td>{s.employee_no}</td><td>{s.full_name}</td><td>{s.phone || '—'}</td><td>{s.email || '—'}</td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={6} className="text-center py-4 text-gray-500">{onlyMissing ? 'Everyone has a photo.' : 'No staff.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
