'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Shell from '@/components/Shell';
import { api, downloadCsv, fmtDateTime, getToken } from '@/lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:5000/api';

type ImportType = { type: string; title: string; description: string; columns: { key: string; label: string; required: boolean }[] };
type Row = { row: number; action: 'create' | 'update' | 'skip' | 'error'; errors: string[]; note: string | null; key: string | null; name: string | null };
type Preview = { batch_id: string; mode: string; file_name: string; unknown_columns: string[]; counts: Record<string, number>; rows: Row[] };
type Result = { created: number; updated: number; skipped: number; failed: number; total: number; rows: Row[]; credentials: { username: string; password: string; name: string; role: string }[] };
type History = { id: number; type_title: string; file_name: string; created_at: string; by_name: string; created: number; updated: number; skipped: number; failed: number };

const ACTION: Record<Row['action'], { label: string; cls: string }> = {
  create: { label: 'New', cls: 'badge-green' },
  update: { label: 'Will update', cls: 'badge-amber' },
  skip: { label: 'Skip', cls: 'badge-gray' },
  error: { label: 'Error', cls: 'badge-red' },
};
const ICON: Record<string, string> = { students: '🎓', staff: '👥', opening: '₹', parents: '👪', 'student-logins': '🔑' };

async function download(path: string, filename: string) {
  const res = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Download failed (${res.status})`);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function ImportsPage() {
  const [types, setTypes] = useState<ImportType[]>([]);
  const [sel, setSel] = useState<string>('');
  const [mode, setMode] = useState<'skip' | 'update'>('skip');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [filter, setFilter] = useState<'all' | Row['action']>('all');
  const [history, setHistory] = useState<History[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadHistory = () => api<History[]>('/imports/history').then(setHistory).catch(() => {});
  useEffect(() => {
    api<ImportType[]>('/imports/types').then(t => { setTypes(t); setSel(s => s || t[0]?.type || ''); }).catch(e => setErr(e.message));
    loadHistory();
  }, []);

  const current = types.find(t => t.type === sel);
  const reset = () => { setPreview(null); setResult(null); setFile(null); setErr(null); setFilter('all'); };

  async function runPreview(m = mode) {
    if (!file) return setErr('Choose a file first.');
    setBusy(true); setErr(null); setResult(null);
    try {
      const form = new FormData();
      form.append('mode', m);
      form.append('file', file);
      const res = await fetch(`${API_BASE}/imports/${sel}/preview`, { method: 'POST', body: form, headers: { Authorization: `Bearer ${getToken()}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
      setPreview(data);
    } catch (e: any) { setErr(e.message); setPreview(null); }
    finally { setBusy(false); }
  }

  async function commit() {
    if (!preview) return;
    const n = (preview.counts.create || 0) + (preview.counts.update || 0);
    if (!n) return setErr('Nothing to import: every row is an error or will be skipped.');
    if (!confirm(`Import ${n} row(s)${preview.counts.error ? `; ${preview.counts.error} row(s) with errors will be left out` : ''}?`)) return;
    setBusy(true); setErr(null);
    try {
      setResult(await api<Result>(`/imports/${sel}/commit`, { method: 'POST', body: JSON.stringify({ batch_id: preview.batch_id, mode }) }));
      loadHistory();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  const rows = (result?.rows || preview?.rows || []).filter(r => filter === 'all' || r.action === filter);
  const counts = result
    ? { create: result.created, update: result.updated, skip: result.skipped, error: result.failed }
    : preview?.counts || {};

  return (
    <Shell>
      <div className="text-xs text-gray-500 mb-1">Settings › Bulk Import</div>
      <h2 className="text-xl font-bold text-brand-700">Bulk Import from Excel</h2>
      <p className="text-sm text-gray-600 mb-4 max-w-3xl">
        Move records from your old system in one go. Download the template, fill it in Excel (or export a CSV), upload it, check the preview, then import.
        Nothing is saved until you press <b>Import</b>, and rows with problems are left out so you can fix and re-upload just those.
      </p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        {types.map(t => (
          <button key={t.type} onClick={() => { setSel(t.type); reset(); }}
            className={`card p-3 text-left transition border-2 ${sel === t.type ? 'border-brand-600 bg-brand-50' : 'border-transparent hover:border-brand-200'}`}>
            <div className="text-2xl leading-none mb-1">{ICON[t.type] || '📄'}</div>
            <div className="font-semibold text-brand-700 text-sm">{t.title}</div>
            <div className="text-[11px] text-gray-500 mt-1 line-clamp-3">{t.description}</div>
          </button>
        ))}
      </div>

      {current && (
        <div className="card p-4 mb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-brand-700">{current.title}</h3>
              <p className="text-sm text-gray-600">{current.description}</p>
              <div className="text-xs text-gray-500 mt-2">
                Columns: {current.columns.map((c, i) => <span key={c.key}>{i > 0 && ', '}<span className={c.required ? 'font-semibold text-gray-800' : ''}>{c.label}{c.required ? ' *' : ''}</span></span>)}
              </div>
            </div>
            <button className="btn btn-accent text-sm" onClick={() => download(`/imports/${sel}/template`, `import-${sel}-template.xlsx`).catch(e => setErr(e.message))}>
              Download Template (.xlsx)
            </button>
          </div>

          <div className="grid md:grid-cols-[1fr_auto_auto] gap-3 items-end mt-4 text-sm">
            <div>
              <label className="label">File (.xlsx or .csv, up to 5 MB)</label>
              <input className="input" type="file" accept=".xlsx,.csv" onChange={e => { setFile(e.target.files?.[0] || null); setPreview(null); setResult(null); }} />
            </div>
            <div>
              <label className="label">Rows that already exist</label>
              <select className="input" value={mode} onChange={e => { const m = e.target.value as 'skip' | 'update'; setMode(m); if (preview && !result) runPreview(m); }}>
                <option value="skip">Skip them</option>
                <option value="update">Update them</option>
              </select>
            </div>
            <button className="btn btn-primary" onClick={() => runPreview()} disabled={busy || !file}>{busy && !preview ? 'Checking…' : 'Upload & Preview'}</button>
          </div>
          {mode === 'update' && <p className="text-[11px] text-gray-500 mt-1">When updating, blank cells keep what is already saved; filled cells replace it.</p>}
        </div>
      )}

      {err && <div className="text-sm rounded px-3 py-2 mb-3 border bg-red-50 border-red-200 text-red-700">{err}</div>}

      {(preview || result) && (
        <div className="card p-4 mb-4">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <h3 className="font-semibold text-brand-700 mr-2">{result ? 'Import finished' : `Preview: ${preview?.file_name}`}</h3>
            {(['all', 'create', 'update', 'skip', 'error'] as const).map(k => (
              <button key={k} onClick={() => setFilter(k)}
                className={`text-xs px-2 py-1 rounded border ${filter === k ? 'bg-brand-600 text-white border-brand-600' : 'bg-white hover:bg-gray-50'}`}>
                {k === 'all' ? `All (${(result?.rows || preview?.rows || []).length})` : `${result && k === 'create' ? 'Added' : result && k === 'update' ? 'Updated' : ACTION[k].label} (${counts[k] || 0})`}
              </button>
            ))}
            <div className="ml-auto flex gap-2">
              {(counts.error || 0) > 0 && preview && (
                <button className="btn bg-gray-200 text-sm" onClick={() => download(`/imports/${sel}/errors/${preview.batch_id}?mode=${mode}`, `import-${sel}-errors.xlsx`).catch(e => setErr(e.message))}>
                  Download Error Rows
                </button>
              )}
              {!result && <button className="btn btn-primary text-sm" onClick={commit} disabled={busy}>{busy ? 'Importing…' : `Import ${(counts.create || 0) + (counts.update || 0)} row(s)`}</button>}
              {result && <button className="btn bg-gray-200 text-sm" onClick={reset}>Import another file</button>}
            </div>
          </div>
          {preview?.unknown_columns?.length ? (
            <p className="text-xs text-amber-700 mb-2">Ignored columns (not recognised): {preview.unknown_columns.join(', ')}</p>
          ) : null}

          {result && result.credentials?.length > 0 && (
            <div className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded px-3 py-2 mb-3 flex flex-wrap items-center gap-3">
              <span>{result.credentials.length} login(s) created or reset. Passwords are shown only now, and each person must change theirs at first sign-in.</span>
              <button className="btn bg-white border text-xs" onClick={() => downloadCsv(`logins-${sel}`, [
                { key: 'name', label: 'Name' }, { key: 'role', label: 'Type' }, { key: 'username', label: 'Username' }, { key: 'password', label: 'Password' },
              ], result.credentials)}>Download Logins (Excel)</button>
              <Link href="/send-credentials" className="text-brand-600 underline text-xs">or send them by SMS/email</Link>
            </div>
          )}

          <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
            <table className="table text-sm">
              <thead className="sticky top-0"><tr><th className="w-14">Row</th><th className="w-28">Status</th><th>Key</th><th>Name / Note</th><th>Problem</th></tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.row}>
                    <td>{r.row}</td>
                    <td><span className={`badge ${ACTION[r.action].cls}`}>{result && r.action === 'create' ? 'Added' : result && r.action === 'update' ? 'Updated' : ACTION[r.action].label}</span></td>
                    <td className="font-mono text-xs">{r.key || '—'}</td>
                    <td>{r.name || r.note || '—'}{r.name && r.note && r.note !== r.name ? <span className="text-xs text-gray-500"> · {r.note}</span> : null}</td>
                    <td className="text-red-700 text-xs">{r.errors.join('; ')}</td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={5} className="text-center py-4 text-gray-500">No rows in this view.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-brand-700">Recent imports</h3>
          <Link href="/report/import-history" className="text-xs text-brand-600 underline">Full import history</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="table text-sm">
            <thead><tr><th>When</th><th>Import</th><th>File</th><th>By</th><th className="text-right">Added</th><th className="text-right">Updated</th><th className="text-right">Skipped</th><th className="text-right">Failed</th></tr></thead>
            <tbody>
              {history.map(h => (
                <tr key={h.id}>
                  <td className="whitespace-nowrap">{fmtDateTime(h.created_at)}</td><td>{h.type_title}</td><td className="text-xs">{h.file_name}</td><td>{h.by_name || '—'}</td>
                  <td className="text-right">{h.created}</td><td className="text-right">{h.updated}</td><td className="text-right">{h.skipped}</td>
                  <td className={`text-right ${h.failed ? 'text-red-700 font-semibold' : ''}`}>{h.failed}</td>
                </tr>
              ))}
              {!history.length && <tr><td colSpan={8} className="text-center py-4 text-gray-500">No imports yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}
