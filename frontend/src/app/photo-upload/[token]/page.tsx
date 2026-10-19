'use client';

import { useEffect, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:5000/api';

export default function PhotoUploadPage({ params }: { params: { token: string } }) {
  const [info, setInfo] = useState<{ name: string; school: string; expires_at: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/public/photo-upload/${encodeURIComponent(params.token)}`)
      .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'This link is not valid.'); setInfo(d); })
      .catch(e => setErr(e.message));
  }, [params.token]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setErr(null);
    if (!f) return;
    if (!/\.(jpe?g|png|webp)$/i.test(f.name)) { setErr('Please choose a JPG, PNG or WEBP photo.'); return; }
    if (f.size > 3 * 1024 * 1024) { setErr('The photo must be 3 MB or smaller.'); return; }
    setFile(f); setPreview(URL.createObjectURL(f));
  }

  async function upload() {
    if (!file) return;
    setBusy(true); setErr(null);
    try {
      const form = new FormData();
      form.append('photo', file);
      const res = await fetch(`${API_BASE}/public/photo-upload/${encodeURIComponent(params.token)}`, { method: 'POST', body: form });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Upload failed. Please try again.');
      setDone(true);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen bg-gray-50 grid place-items-center px-4 py-8">
      <div className="card p-6 w-full max-w-md text-sm">
        <h1 className="text-xl font-bold text-brand-700 mb-1">{info?.school || 'School'} — Photo Upload</h1>
        {done ? (
          <p className="text-green-700 mt-3">Thank you, {info?.name}. Your photo has been saved to your staff profile. You can close this page.</p>
        ) : !info ? (
          <p className={err ? 'text-red-700 mt-3' : 'text-gray-500 mt-3'}>{err || 'Checking your link…'}</p>
        ) : (
          <>
            <p className="text-gray-600 mb-4">Hello {info.name}. Please upload a clear, recent passport-style photo with your face fully visible. This link works once and expires on {new Date(info.expires_at).toLocaleDateString()}.</p>
            <div className="flex items-center gap-4 mb-4">
              <div className="w-28 h-32 rounded border bg-gray-100 overflow-hidden grid place-items-center text-gray-400 text-xs">
                {preview ? <img src={preview} alt="Selected photo preview" className="w-full h-full object-cover" /> : 'No photo selected'}
              </div>
              <input type="file" accept=".jpg,.jpeg,.png,.webp" onChange={pick} className="text-xs" />
            </div>
            {err && <p className="text-red-700 mb-3">{err}</p>}
            <button className="btn btn-primary w-full" onClick={upload} disabled={!file || busy}>{busy ? 'Uploading…' : 'Upload Photo'}</button>
          </>
        )}
      </div>
    </div>
  );
}
