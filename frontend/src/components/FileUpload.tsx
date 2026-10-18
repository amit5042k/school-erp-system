'use client';

import { useState } from 'react';
import { fileUrl, upload, type UploadedFile } from '@/lib/api';

type Props = {
  /** Called with the uploaded files once the upload finishes. */
  onUploaded: (files: UploadedFile[]) => void;
  multiple?: boolean;
  accept?: string;
  label?: string;
};

/** File picker that uploads immediately and hands back stored file links (e.g. "/api/files/ab12….pdf"). */
export default function FileUpload({ onUploaded, multiple = false, accept, label = 'Upload File' }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || !files.length) return;
    setBusy(true); setErr(null);
    try { onUploaded(await upload(files)); }
    catch (ex: any) { setErr(ex.message); }
    finally { setBusy(false); e.target.value = ''; }
  }

  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" type="file" multiple={multiple} accept={accept} onChange={pick} disabled={busy} />
      {busy && <div className="text-[11px] text-gray-500 mt-1">Uploading…</div>}
      {err && <div className="text-[11px] text-red-600 mt-1">{err}</div>}
    </div>
  );
}

/** Link(s) to stored files. `value` may be one URL or a comma-separated list. */
export function FileLinks({ value, names }: { value?: string | null; names?: string | null }) {
  if (!value) return <span>—</span>;
  const urls = value.split(',').map(s => s.trim()).filter(Boolean);
  const labels = (names || '').split(',').map(s => s.trim());
  return (
    <span className="inline-flex flex-wrap gap-2">
      {urls.map((u, i) => (
        <a key={u} href={fileUrl(u)} target="_blank" rel="noreferrer" className="text-brand-600 underline">
          {labels[i] || (urls.length > 1 ? `File ${i + 1}` : 'View')}
        </a>
      ))}
    </span>
  );
}
