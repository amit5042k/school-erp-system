'use client';

import { Fragment, useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, fmtDateTime, localDate } from '@/lib/api';
import { Flash, HrHeader, useFlash } from '../_ui';

type Device = {
  id: number; sn: string; name: string; location: string | null; active: number; timezone: string;
  last_seen: string | null; last_ip: string | null; push_version: string | null; online: boolean;
  punches_today: number; punches_total: number; last_punch: string | null; commands_open: number;
};
type Unregistered = { sn: string; first_seen: string; last_seen: string; last_ip: string | null; hits: number; push_version: string | null };
type Command = { id: number; kind: string; command: string; status: string; return_code: string | null; created_at: string; done_at: string | null; created_by_name: string | null };

const EMPTY = { sn: '', name: '', location: '', timezone: '330', active: true };
const LINKS = [
  { label: 'Live Punches', href: '/hr/biometric-live' },
  { label: 'Map Biometric IDs', href: '/hr/biometric-mapping' },
  { label: 'Punch Log', href: '/report/bio-punch-log' },
];

function stateBadge(d: Device) {
  if (!d.active) return <span className="badge badge-gray">Disabled</span>;
  if (d.online) return <span className="badge badge-green">Online</span>;
  return <span className="badge badge-red">{d.last_seen ? 'Offline' : 'Never connected'}</span>;
}

export default function BiometricDevicesPage() {
  const { msg, flash } = useFlash();
  const [devices, setDevices] = useState<Device[]>([]);
  const [pending, setPending] = useState<Unregistered[]>([]);
  const [form, setForm] = useState<typeof EMPTY & { id?: number }>(EMPTY);
  const [editing, setEditing] = useState(false);
  const [openCmds, setOpenCmds] = useState<number | null>(null);
  const [cmds, setCmds] = useState<Command[]>([]);
  const [range, setRange] = useState({ from: localDate(new Date(Date.now() - 7 * 86400000)), to: localDate() });
  const [apiHost, setApiHost] = useState('');

  async function load() {
    try {
      setDevices(await api<Device[]>('/biometric/devices'));
      setPending(await api<Unregistered[]>('/biometric/unregistered'));
    } catch (e: any) { flash(e.message, false); }
  }
  useEffect(() => {
    load();
    const base = process.env.NEXT_PUBLIC_API_BASE || '';
    try { setApiHost(base.startsWith('http') ? new URL(base).host : window.location.host); } catch { setApiHost(''); }
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (form.id) await api(`/biometric/devices/${form.id}`, { method: 'PUT', body: JSON.stringify(form) });
      else await api('/biometric/devices', { method: 'POST', body: JSON.stringify(form) });
      flash(form.id ? 'Device updated.' : 'Device added. It starts sending punches the next time it contacts the server.');
      setForm(EMPTY); setEditing(false); load();
    } catch (e: any) { flash(e.message, false); }
  }
  async function approve(u: Unregistered) {
    const name = prompt(`Name for device ${u.sn} (e.g. "Main Gate"):`, `Device ${u.sn}`);
    if (name === null) return;
    try { await api(`/biometric/unregistered/${encodeURIComponent(u.sn)}/approve`, { method: 'POST', body: JSON.stringify({ name }) }); flash('Device approved.'); load(); }
    catch (e: any) { flash(e.message, false); }
  }
  async function dismiss(u: Unregistered) {
    if (!confirm(`Ignore device ${u.sn}? It will appear again if it keeps contacting the server.`)) return;
    try { await api(`/biometric/unregistered/${encodeURIComponent(u.sn)}`, { method: 'DELETE' }); load(); }
    catch (e: any) { flash(e.message, false); }
  }
  async function toggle(d: Device) {
    try { await api(`/biometric/devices/${d.id}`, { method: 'PUT', body: JSON.stringify({ active: !d.active }) }); load(); }
    catch (e: any) { flash(e.message, false); }
  }
  async function remove(d: Device) {
    if (!confirm(`Delete device ${d.name}?`)) return;
    try { await api(`/biometric/devices/${d.id}`, { method: 'DELETE' }); load(); }
    catch (e: any) { flash(e.message, false); }
  }
  async function showCmds(id: number) {
    if (openCmds === id) { setOpenCmds(null); return; }
    setOpenCmds(id);
    try { setCmds(await api<Command[]>(`/biometric/devices/${id}/commands`)); } catch (e: any) { flash(e.message, false); }
  }
  async function queue(d: Device, kind: string) {
    if (kind === 'reboot' && !confirm(`Restart ${d.name}? Staff can't punch for about a minute.`)) return;
    try {
      await api(`/biometric/devices/${d.id}/commands`, { method: 'POST', body: JSON.stringify({ kind, ...range }) });
      flash(kind === 'redownload' ? `Re-download of ${range.from} to ${range.to} queued. The device sends it within a minute if online.` : 'Command queued.');
      setOpenCmds(d.id); setCmds(await api<Command[]>(`/biometric/devices/${d.id}/commands`)); load();
    } catch (e: any) { flash(e.message, false); }
  }

  return (
    <Shell>
      <HrHeader title="Biometric Devices" subtitle="eSSL / ZKTeco devices sending punches live over ADMS" links={LINKS} />
      <Flash msg={msg} />

      {pending.length > 0 && (
        <div className="card p-4 mb-4 border-amber-300 bg-amber-50">
          <h3 className="font-semibold text-amber-800 mb-2">New devices waiting for approval</h3>
          <p className="text-sm text-amber-800 mb-2">These devices are contacting the server but aren&apos;t registered, so their punches are being ignored.</p>
          <div className="overflow-x-auto">
            <table className="table text-sm">
              <thead><tr><th>Serial No</th><th>First seen</th><th>Last seen</th><th>IP</th><th>Contacts</th><th></th></tr></thead>
              <tbody>{pending.map(u => (
                <tr key={u.sn}>
                  <td className="font-mono">{u.sn}</td><td>{fmtDateTime(u.first_seen)}</td><td>{fmtDateTime(u.last_seen)}</td>
                  <td>{u.last_ip || '—'}</td><td>{u.hits}</td>
                  <td className="whitespace-nowrap">
                    <button className="btn btn-primary text-xs py-1 mr-2" onClick={() => approve(u)}>Approve</button>
                    <button className="text-xs text-gray-600 hover:underline" onClick={() => dismiss(u)}>Ignore</button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center mb-2">
        <h3 className="font-semibold text-brand-700">Registered devices</h3>
        <button className="btn btn-primary text-sm" onClick={() => { setForm(EMPTY); setEditing(v => !v); }}>{editing ? 'Cancel' : '+ Add Device'}</button>
      </div>

      {editing && (
        <form onSubmit={save} className="card p-4 mb-4 grid md:grid-cols-5 gap-3 text-sm">
          <div><label className="label">Serial No *</label><input className="input font-mono" required value={form.sn} onChange={e => setForm({ ...form, sn: e.target.value })} placeholder="e.g. CEXJ223260123" /></div>
          <div><label className="label">Name *</label><input className="input" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Main Gate" /></div>
          <div><label className="label">Location</label><input className="input" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} /></div>
          <div><label className="label">Time Zone</label><input className="input" value={form.timezone} onChange={e => setForm({ ...form, timezone: e.target.value })} title="330 = IST in minutes; some firmware wants 5.5 (hours)" /></div>
          <div className="flex items-end"><button className="btn btn-primary">{form.id ? 'Save' : 'Add'}</button></div>
          <div className="md:col-span-5 text-xs text-gray-500">The serial number is under Menu › System Info › Device Info on the device. Time zone 330 = India (minutes); if the device clock ends up 5½ hours off, try 5.5.</div>
        </form>
      )}

      <div className="card p-4 overflow-x-auto mb-6">
        <table className="table text-sm">
          <thead><tr><th>Device</th><th>Serial No</th><th>Status</th><th>Last contact</th><th>Last punch</th><th>Today</th><th>Total</th><th></th></tr></thead>
          <tbody>
            {devices.map(d => (
              <Fragment key={d.id}>
                <tr>
                  <td><div className="font-medium">{d.name}</div><div className="text-xs text-gray-500">{d.location || ''}</div></td>
                  <td className="font-mono text-xs">{d.sn}</td>
                  <td>{stateBadge(d)}</td>
                  <td className="text-xs">{d.last_seen ? fmtDateTime(d.last_seen) : '—'}{d.last_ip ? <div className="text-gray-500">{d.last_ip}</div> : null}</td>
                  <td className="text-xs">{d.last_punch || '—'}</td>
                  <td>{d.punches_today}</td>
                  <td>{d.punches_total}</td>
                  <td className="whitespace-nowrap text-xs">
                    <button className="text-brand-600 hover:underline mr-2" onClick={() => showCmds(d.id)}>Commands{d.commands_open ? ` (${d.commands_open})` : ''}</button>
                    <button className="text-brand-600 hover:underline mr-2" onClick={() => { setForm({ id: d.id, sn: d.sn, name: d.name, location: d.location || '', timezone: d.timezone, active: !!d.active }); setEditing(true); }}>Edit</button>
                    <button className="text-amber-700 hover:underline mr-2" onClick={() => toggle(d)}>{d.active ? 'Disable' : 'Enable'}</button>
                    {!d.punches_total && <button className="text-red-600 hover:underline" onClick={() => remove(d)}>Delete</button>}
                  </td>
                </tr>
                {openCmds === d.id && (
                  <tr>
                    <td colSpan={8} className="bg-brand-50/40">
                      <div className="flex flex-wrap items-end gap-2 text-sm py-2">
                        <div><label className="label">From</label><input type="date" className="input" value={range.from} max={range.to} onChange={e => setRange({ ...range, from: e.target.value })} /></div>
                        <div><label className="label">To</label><input type="date" className="input" value={range.to} max={localDate()} onChange={e => setRange({ ...range, to: e.target.value })} /></div>
                        <button className="btn btn-primary text-xs" onClick={() => queue(d, 'redownload')}>Re-download punches</button>
                        <button className="btn bg-gray-200 text-xs" onClick={() => queue(d, 'check')}>Refresh settings</button>
                        <button className="btn bg-gray-200 text-xs" onClick={() => queue(d, 'info')}>Read device info</button>
                        <button className="btn bg-red-100 text-red-700 text-xs" onClick={() => queue(d, 'reboot')}>Restart device</button>
                      </div>
                      <table className="w-full text-xs mt-1">
                        <thead><tr className="text-left text-gray-500"><th className="py-1">Queued</th><th>Command</th><th>Status</th><th>Result</th><th>By</th></tr></thead>
                        <tbody>
                          {cmds.map(c => (
                            <tr key={c.id} className="border-t">
                              <td className="py-1">{fmtDateTime(c.created_at)}</td>
                              <td className="font-mono">{c.command.replace('\t', ' ')}</td>
                              <td><span className={`badge ${c.status === 'done' ? 'badge-green' : c.status === 'failed' ? 'badge-red' : 'badge-amber'}`}>{c.status === 'sent' ? 'sent, waiting for device' : c.status}</span></td>
                              <td>{c.return_code ?? '—'}</td><td>{c.created_by_name || '—'}</td>
                            </tr>
                          ))}
                          {!cmds.length && <tr><td colSpan={5} className="py-2 text-gray-500">No commands sent yet.</td></tr>}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {!devices.length && <tr><td colSpan={8} className="text-center py-4 text-gray-500">No devices yet. Add one, or point a device at the server and approve it above.</td></tr>}
          </tbody>
        </table>
        <div className="text-xs text-gray-500 mt-2">Online = contacted the server in the last 5 minutes. This page refreshes every 30 seconds.</div>
      </div>

      <div className="card p-4 text-sm leading-relaxed">
        <h3 className="font-semibold text-brand-700 mb-2">How to connect an eSSL device</h3>
        <ol className="list-decimal pl-5 space-y-2">
          <li><b>Check the device supports ADMS.</b> On the device open <i>Menu › Comm.</i> (or <i>COMM › Cloud Server Setting</i>). If you see <b>Cloud Server Setting</b>, <b>ADMS</b> or <b>Server Address</b>, it does. Models such as X990, K30 Pro, MB160, MB20, SilkBio and AiFace usually do. If the option is missing, ask eSSL for the ADMS firmware or use <a className="text-brand-600 underline" href="/hr/biometric-import">CSV import</a> instead.</li>
          <li><b>Give the device internet access</b> (LAN cable or Wi-Fi) under <i>Comm. › Ethernet</i>, with DHCP or a fixed IP, gateway and DNS.</li>
          <li><b>Open Cloud Server Setting</b> and set:
            <ul className="list-disc pl-5 mt-1">
              <li><b>Enable Domain Name:</b> ON, and <b>Server Address:</b> <span className="font-mono bg-gray-100 px-1">{apiHost || 'api.yourschool.in'}</span> (just the name, no http:// and no path). Or turn domain name OFF and enter the server&apos;s IP address.</li>
              <li><b>Server Port:</b> the HTTP port opened for devices, usually <span className="font-mono bg-gray-100 px-1">80</span> (or 8081 if you set that up, see below).</li>
              <li><b>Enable Proxy Server:</b> OFF. <b>HTTPS:</b> OFF (most eSSL firmware can&apos;t do HTTPS).</li>
            </ul>
          </li>
          <li><b>Restart the device.</b> Within a minute it appears above under <i>New devices waiting for approval</i>. Click <b>Approve</b> (or add it in advance with its serial number).</li>
          <li><b>Match staff to device IDs.</b> The number a person is enrolled under on the device must match their Employee No, or set it on <a className="text-brand-600 underline" href="/hr/biometric-mapping">Map Biometric IDs</a>. Unknown IDs are kept and can be mapped later; their old punches are then applied automatically.</li>
          <li><b>Backfill history</b> with <i>Commands › Re-download punches</i> for the days before the device was connected.</li>
        </ol>
        <h4 className="font-semibold text-brand-700 mt-4 mb-1">Server setup (for whoever runs the server)</h4>
        <p className="mb-2">The ERP itself stays on HTTPS. Devices only need plain HTTP for the <span className="font-mono">/iclock/</span> path. With nginx, add a port-80 server block that forwards only that path and redirects everything else to HTTPS:</p>
        <pre className="bg-gray-900 text-gray-100 text-xs rounded p-3 overflow-x-auto">{`server {
    listen 80;
    server_name ${apiHost || 'api.yourschool.in'};
    location /iclock/ {
        proxy_pass http://127.0.0.1:5000;     # the ERP backend
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
    }
    location / { return 301 https://$host$request_uri; }
}`}</pre>
        <p className="mt-2 text-gray-600">If port 80 is taken, use another port (e.g. <span className="font-mono">listen 8081;</span>), open it in the server firewall, and enter that port on the device. The device&apos;s clock follows the server time it receives; set Time Zone to 330 (or 5.5) so it shows Indian time.</p>
      </div>
    </Shell>
  );
}
