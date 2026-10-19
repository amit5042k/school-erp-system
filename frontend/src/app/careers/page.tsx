'use client';

import { useEffect, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:5000/api';
type Info = { school: { school_name?: string; address?: string; phone?: string; email?: string; website?: string }; open_posts: { designation: string; subject: string }[] };

export default function CareersPage() {
  const [info, setInfo] = useState<Info | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/public/careers`).then(r => r.json()).then(setInfo).catch(() => setInfo({ school: {}, open_posts: [] }));
  }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const form = new FormData(e.currentTarget);
    const file = form.get('resume') as File | null;
    if (file && file.size > 5 * 1024 * 1024) return setErr('Your resume must be 5 MB or smaller.');
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/public/careers/apply`, { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not submit your application. Please try again.');
      setDone(true);
    } catch (ex: any) { setErr(ex.message); }
    finally { setBusy(false); }
  }

  const school = info?.school.school_name || 'Our School';
  const posts = info?.open_posts.map(p => (p.subject ? `${p.designation} — ${p.subject}` : p.designation)) || [];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-brand-700 text-white">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold">{school}</h1>
          <div className="text-sm opacity-90">Careers — apply for a teaching or staff position</div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6">
        {done ? (
          <div className="card p-6 text-center">
            <h2 className="text-xl font-bold text-brand-700 mb-2">Thank you for applying</h2>
            <p className="text-gray-600">We have received your application. The school office will contact you if you are shortlisted.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="card p-5 grid md:grid-cols-2 gap-4 text-sm">
            {posts.length > 0 && (
              <div className="md:col-span-2 bg-brand-50 rounded p-3">
                <div className="font-semibold text-brand-700 mb-1">Current openings</div>
                <ul className="list-disc ml-5">{posts.map(p => <li key={p}>{p}</li>)}</ul>
              </div>
            )}
            <div><label className="label">Full Name *</label><input className="input" name="full_name" required maxLength={100} autoComplete="name" /></div>
            <div><label className="label">Post Applied For *</label>
              {posts.length ? (
                <select className="input" name="post_applied" required defaultValue="">
                  <option value="" disabled>-- Select --</option>
                  {posts.map(p => <option key={p}>{p}</option>)}
                  <option>Other</option>
                </select>
              ) : <input className="input" name="post_applied" required maxLength={100} placeholder="e.g. TGT Mathematics" />}
            </div>
            <div><label className="label">Email</label><input className="input" name="email" type="email" autoComplete="email" /></div>
            <div><label className="label">Phone</label><input className="input" name="phone" inputMode="tel" autoComplete="tel" /></div>
            <div><label className="label">Subject</label><input className="input" name="subject" maxLength={100} /></div>
            <div><label className="label">Qualification</label><input className="input" name="qualification" maxLength={200} placeholder="e.g. M.Sc, B.Ed" /></div>
            <div><label className="label">Experience (years)</label><input className="input" name="experience_years" type="number" min={0} max={50} step="0.5" /></div>
            <div><label className="label">Current / Last School</label><input className="input" name="current_school" maxLength={150} /></div>
            <div className="md:col-span-2"><label className="label">Message</label><textarea className="input" name="message" rows={3} maxLength={2000} /></div>
            <div className="md:col-span-2">
              <label className="label">Resume * (PDF or Word, up to 5 MB)</label>
              <input className="input" name="resume" type="file" required accept=".pdf,.doc,.docx" />
            </div>
            {/* Hidden from people; bots that fill every field are ignored. */}
            <input type="text" name="website_url" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
            <div className="md:col-span-2 text-xs text-gray-500">Please give at least an email address or a phone number so we can reach you.</div>
            {err && <div className="md:col-span-2 text-red-700">{err}</div>}
            <div className="md:col-span-2"><button className="btn btn-primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit Application'}</button></div>
          </form>
        )}
        {(info?.school.phone || info?.school.email) && (
          <p className="text-xs text-gray-500 mt-4 text-center">
            Questions? {info.school.phone && <>Call {info.school.phone}</>}{info.school.phone && info.school.email && ' or '}{info.school.email && <>email {info.school.email}</>}.
          </p>
        )}
      </main>
    </div>
  );
}
