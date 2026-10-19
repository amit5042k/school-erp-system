'use client';

import { useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';
import { Flash, HrHeader, useFlash } from '../_ui';

type Result = {
  batch: string; imported: number; duplicates: number; rejected: number; days_updated: number;
  errors: { line: number; text: string; error: string }[];
};

const SAMPLE = 'employee_no,date,time\nEMP001,18/10/2026,07:55\nEMP001,18/10/2026,14:35\nEMP002,2026-10-18,08:20 AM';

export default function BiometricImportPage() {
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [overwrite, setOverwrite] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const { msg, flash } = useFlash();

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 900 * 1024) { flash('File is too large. Split it into files under 900 KB (about 30,000 punches).', false); return; }
    const reader = new FileReader();
    reader.onload = () => { setCsv(String(reader.result || '')); setFileName(f.name); setRes(null); };
    reader.readAsText(f);
  }

  async function submit() {
    if (!csv.trim()) return flash('Choose a CSV file or paste punches first.', false);
    setBusy(true); setRes(null);
    try {
      const r = await api<Result>('/hr/biometric/import', { method: 'POST', body: JSON.stringify({ csv, overwrite_manual: overwrite }) });
      setRes(r);
      flash(`Imported ${r.imported} punch(es); ${r.days_updated} attendance day(s) updated.`, r.rejected === 0);
    } catch (e: any) { flash(e.message, false); }
    finally { setBusy(false); }
  }

  return (
    <Shell>
      <HrHeader title="Import Biometric Punches" subtitle="Load the attendance export from your biometric / RFID machine."
        links={[{ label: 'Punch log', href: '/report/biometric-attendance' }, { label: 'First-in / last-out', href: '/report/biometric-attendance-2' }, { label: 'Attendance rule', href: '/hr/attendance-rules' }]} />
      <Flash msg={msg} />

      <div className="card p-4 mb-4 text-sm space-y-3">
        <p className="text-gray-600">
          Export punches from the device software as CSV with three columns: <b>employee no</b>, <b>date</b>, <b>time</b> (one row per punch).
          Dates may be YYYY-MM-DD or DD/MM/YYYY; times 24-hour (14:05) or 12-hour (2:05 PM). Employee numbers must match those in the ERP.
          The first punch of the day is taken as <i>in</i> and the last as <i>out</i>; late and half-day are worked out from the attendance rule.
        </p>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="label">CSV file</label>
            <input className="input" type="file" accept=".csv,.txt" onChange={pick} />
            {fileName && <div className="text-xs text-gray-500 mt-1">{fileName}: {csv.split(/\r?\n/).filter(Boolean).length} line(s)</div>}
          </div>
          <div>
            <label className="label">…or paste punches</label>
            <textarea className="input font-mono text-xs" rows={4} placeholder={SAMPLE} value={csv} onChange={e => { setCsv(e.target.value); setFileName(''); }} />
          </div>
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={overwrite} onChange={e => setOverwrite(e.target.checked)} />
          Replace attendance that was marked by hand for the same days
        </label>
        <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? 'Importing…' : 'Import Punches'}</button>
      </div>

      {res && (
        <div className="card p-4 text-sm">
          <div className="flex flex-wrap gap-2 mb-3">
            <span className="badge badge-green">Imported: {res.imported}</span>
            <span className="badge badge-gray">Already imported: {res.duplicates}</span>
            <span className={`badge ${res.rejected ? 'badge-red' : 'badge-gray'}`}>Rejected: {res.rejected}</span>
            <span className="badge badge-gray">Days updated: {res.days_updated}</span>
          </div>
          {res.errors.length > 0 && (
            <div className="overflow-x-auto">
              <h3 className="font-semibold text-brand-700 mb-2">Rows that were not imported</h3>
              <table className="table text-xs">
                <thead><tr><th>Line</th><th>Content</th><th>Problem</th></tr></thead>
                <tbody>{res.errors.map(e => <tr key={e.line}><td>{e.line}</td><td className="font-mono">{e.text}</td><td className="text-red-700">{e.error}</td></tr>)}</tbody>
              </table>
              {res.rejected >= 200 && <div className="text-xs text-gray-500 mt-1">Only the first 200 problems are shown.</div>}
            </div>
          )}
        </div>
      )}
    </Shell>
  );
}
