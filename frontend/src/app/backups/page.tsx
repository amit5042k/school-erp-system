'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, fmtDateTime, getToken } from '@/lib/api';

type Backup = { name: string; size: number; created: string };
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:5000/api';

export default function BackupsPage() {
  const [rows, setRows] = useState<Backup[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = () => api<Backup[]>('/admin/backups').then(setRows).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);

  async function download() {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`${API_BASE}/admin/backup/download`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Backup failed (${res.status})`);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url; a.download = `school-erp-backup-${new Date().toISOString().slice(0, 10)}.sqlite`; a.click();
      URL.revokeObjectURL(url);
      load();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <Shell>
      <div className="text-xs text-gray-500 mb-1">Settings › Backups</div>
      <h2 className="text-xl font-bold text-brand-700 mb-2">Backups</h2>
      <p className="text-sm text-gray-600 mb-4 max-w-2xl">
        The server saves a copy of the whole database every day and keeps the last 14 on the server.
        Download one regularly and keep it somewhere else too (e.g. Google Drive), so data survives if the server is lost.
      </p>
      {err && <div className="text-red-700 text-sm mb-3">{err}</div>}
      <button className="btn btn-primary mb-4" onClick={download} disabled={busy}>{busy ? 'Preparing…' : 'Back up now & download'}</button>
      <div className="card p-4 overflow-x-auto">
        <h3 className="font-semibold text-brand-700 mb-2">Backups stored on the server</h3>
        <table className="table text-sm">
          <thead><tr><th>File</th><th>Created</th><th>Size</th></tr></thead>
          <tbody>
            {rows.map(b => <tr key={b.name}><td className="font-mono text-xs">{b.name}</td><td>{fmtDateTime(b.created)}</td><td>{(b.size / 1024 / 1024).toFixed(2)} MB</td></tr>)}
            {!rows.length && <tr><td colSpan={3} className="text-center py-4 text-gray-500">No backups yet. The first automatic one runs a minute after the server starts.</td></tr>}
          </tbody>
        </table>
        <p className="text-xs text-gray-500 mt-3">
          To restore: stop the backend, replace <code>backend/data/school.sqlite</code> with a backup file (renamed to school.sqlite), then start it again.
        </p>
      </div>
    </Shell>
  );
}
