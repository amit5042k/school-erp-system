'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import FileUpload from '@/components/FileUpload';
import { api, fileUrl } from '@/lib/api';
import { Flash, toLocalInput, useFlash } from '../_ui';

type Q = { text: string; image_url: string | null; options: string[]; correct: number[]; marks: number | string; negative: number | string };
type ClassRow = { id: number; name: string; section: string };

const blankQ = (): Q => ({ text: '', image_url: null, options: ['', '', '', ''], correct: [], marks: 1, negative: 0 });

export default function EditTestPage({ searchParams }: { searchParams: { id?: string } }) {
  const router = useRouter();
  const id = searchParams.id ? Number(searchParams.id) : null;
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [t, setT] = useState({
    title: '', subject: '', class_id: '', all_sections: false, instructions: '', start_at: '', end_at: '',
    duration_min: 30, shuffle_questions: true, shuffle_options: true, status: 'draft',
  });
  const [qs, setQs] = useState<Q[]>([blankQ()]);
  const [negDefault, setNegDefault] = useState<string>('0');
  const [busy, setBusy] = useState(false);
  const { msg, flash } = useFlash();

  useEffect(() => {
    api<ClassRow[]>('/classes').then(setClasses).catch(() => {});
    if (!id) return;
    api<any>(`/online-tests/${id}`).then(r => {
      setT({
        title: r.title, subject: r.subject || '', class_id: String(r.class_id), all_sections: !!r.all_sections, instructions: r.instructions || '',
        start_at: toLocalInput(r.start_at), end_at: toLocalInput(r.end_at), duration_min: r.duration_min,
        shuffle_questions: !!r.shuffle_questions, shuffle_options: !!r.shuffle_options, status: r.status,
      });
      setQs(r.questions.map((q: any) => ({ text: q.text, image_url: q.image_url, options: q.options.map((o: any) => o.text), correct: q.correct, marks: q.marks, negative: q.negative })));
      if (r.attempts) flash('Students have already started this test, so it can no longer be changed.', false);
    }).catch(e => flash(e.message, false));
    /* eslint-disable-next-line */
  }, [id]);

  const setQ = (i: number, patch: Partial<Q>) => setQs(list => list.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const total = qs.reduce((a, q) => a + (Number(q.marks) || 0), 0);

  async function save(publish: boolean) {
    setBusy(true);
    try {
      const body = {
        ...t, class_id: Number(t.class_id) || null, duration_min: Number(t.duration_min),
        start_at: t.start_at ? new Date(t.start_at).toISOString() : '', end_at: t.end_at ? new Date(t.end_at).toISOString() : '',
        questions: qs.map(q => ({ ...q, marks: Number(q.marks), negative: Number(q.negative) || 0 })),
      };
      let testId = id;
      if (id) await api(`/online-tests/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      else testId = (await api<{ id: number }>('/online-tests', { method: 'POST', body: JSON.stringify(body) })).id;
      if (publish && t.status !== 'published') await api(`/online-tests/${testId}/publish`, { method: 'POST', body: '{}' });
      router.push('/online-tests');
    } catch (e: any) { flash(e.message, false); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    finally { setBusy(false); }
  }

  return (
    <Shell>
      <div className="text-xs text-gray-500 mb-1"><Link href="/online-tests" className="hover:underline">Online Tests</Link> › {id ? 'Edit' : 'New'}</div>
      <h2 className="text-xl font-bold text-brand-700 mb-4">{id ? 'Edit Online Test' : 'New Online Test'}</h2>
      <Flash msg={msg} />

      <div className="card p-4 mb-4 grid md:grid-cols-3 gap-3 text-sm">
        <div className="md:col-span-2"><label className="label">Title *</label><input className="input" value={t.title} onChange={e => setT({ ...t, title: e.target.value })} placeholder="e.g. Unit Test 2 – Fractions" /></div>
        <div><label className="label">Subject</label><input className="input" value={t.subject} onChange={e => setT({ ...t, subject: e.target.value })} /></div>
        <div><label className="label">Class *</label>
          <select className="input" value={t.class_id} onChange={e => setT({ ...t, class_id: e.target.value })}>
            <option value="">-- Select --</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name} {c.section}</option>)}
          </select>
          <label className="text-xs flex items-center gap-1 mt-1"><input type="checkbox" checked={t.all_sections} onChange={e => setT({ ...t, all_sections: e.target.checked })} /> All sections of this class</label>
        </div>
        <div><label className="label">Opens *</label><input className="input" type="datetime-local" value={t.start_at} onChange={e => setT({ ...t, start_at: e.target.value })} /></div>
        <div><label className="label">Closes *</label><input className="input" type="datetime-local" value={t.end_at} onChange={e => setT({ ...t, end_at: e.target.value })} /></div>
        <div><label className="label">Time allowed (minutes) *</label><input className="input" type="number" min={1} max={600} value={t.duration_min} onChange={e => setT({ ...t, duration_min: Number(e.target.value) })} /></div>
        <div className="flex flex-col justify-end gap-1 text-xs">
          <label className="flex items-center gap-1"><input type="checkbox" checked={t.shuffle_questions} onChange={e => setT({ ...t, shuffle_questions: e.target.checked })} /> Shuffle question order for each student</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={t.shuffle_options} onChange={e => setT({ ...t, shuffle_options: e.target.checked })} /> Shuffle option order</label>
        </div>
        <div><label className="label">Negative marks for every question</label>
          <div className="flex gap-2">
            <input className="input" type="number" min={0} step="0.25" value={negDefault} onChange={e => setNegDefault(e.target.value)} />
            <button type="button" className="btn bg-gray-200 text-xs whitespace-nowrap" onClick={() => setQs(list => list.map(q => ({ ...q, negative: negDefault })))}>Apply to all</button>
          </div></div>
        <div className="md:col-span-3"><label className="label">Instructions for students</label>
          <textarea className="input" rows={2} value={t.instructions} onChange={e => setT({ ...t, instructions: e.target.value })} placeholder="e.g. Each question has one correct answer unless marked otherwise." /></div>
        <div className="md:col-span-3 text-xs text-gray-500">The timer starts when a student opens the test and never runs past the closing time. A wrong answer loses its negative marks; a blank answer scores 0.</div>
      </div>

      {qs.map((q, i) => (
        <div key={i} className="card p-4 mb-3 text-sm">
          <div className="flex justify-between items-center mb-2">
            <div className="font-semibold text-brand-700">Question {i + 1}</div>
            <div className="flex gap-2 text-xs">
              <button type="button" disabled={i === 0} className="text-gray-600 disabled:opacity-30" onClick={() => setQs(l => { const n = l.slice(); [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; })}>▲ Up</button>
              <button type="button" disabled={i === qs.length - 1} className="text-gray-600 disabled:opacity-30" onClick={() => setQs(l => { const n = l.slice(); [n[i + 1], n[i]] = [n[i], n[i + 1]]; return n; })}>▼ Down</button>
              <button type="button" className="text-red-600" onClick={() => setQs(l => l.filter((_, j) => j !== i))}>Remove</button>
            </div>
          </div>
          <textarea className="input mb-2" rows={2} value={q.text} onChange={e => setQ(i, { text: e.target.value })} placeholder="Type the question" />
          <div className="grid md:grid-cols-2 gap-2 mb-2">
            {q.options.map((o, k) => (
              <div key={k} className="flex items-center gap-2">
                <input type="checkbox" title="Correct answer" checked={q.correct.includes(k)}
                  onChange={e => setQ(i, { correct: e.target.checked ? [...q.correct, k] : q.correct.filter(c => c !== k) })} />
                <span className="text-xs text-gray-500 w-4">{String.fromCharCode(65 + k)}</span>
                <input className="input" value={o} onChange={e => setQ(i, { options: q.options.map((x, m) => (m === k ? e.target.value : x)) })} placeholder={`Option ${String.fromCharCode(65 + k)}`} />
                {q.options.length > 2 && (
                  <button type="button" className="text-red-500 text-xs" title="Remove option" onClick={() => setQ(i, {
                    options: q.options.filter((_, m) => m !== k), correct: q.correct.filter(c => c !== k).map(c => (c > k ? c - 1 : c)),
                  })}>✕</button>
                )}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            {q.options.length < 6 && <button type="button" className="text-brand-600 text-xs" onClick={() => setQ(i, { options: [...q.options, ''] })}>+ Add option</button>}
            <div className="text-xs text-gray-500">Tick every correct option. {q.correct.length > 1 ? 'Students must pick all of them.' : ''}</div>
            <div className="ml-auto flex gap-2 items-end">
              <div><label className="label">Marks</label><input className="input w-20" type="number" min={0.25} step="0.25" value={q.marks} onChange={e => setQ(i, { marks: e.target.value })} /></div>
              <div><label className="label">Negative</label><input className="input w-20" type="number" min={0} step="0.25" value={q.negative} onChange={e => setQ(i, { negative: e.target.value })} /></div>
            </div>
          </div>
          <div className="mt-2 flex items-end gap-3">
            <div className="w-64"><FileUpload label="Picture (optional)" accept="image/*" onUploaded={f => setQ(i, { image_url: f[0]?.url || null })} /></div>
            {q.image_url && (
              <div className="flex items-end gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fileUrl(q.image_url)} alt="" className="h-16 rounded border" />
                <button type="button" className="text-red-600 text-xs" onClick={() => setQ(i, { image_url: null })}>Remove picture</button>
              </div>
            )}
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2 mb-8">
        <button type="button" className="btn bg-gray-200" onClick={() => setQs(l => [...l, blankQ()])}>+ Add Question</button>
        <span className="text-sm text-gray-600">{qs.length} question(s) · {total} marks</span>
        <div className="ml-auto flex gap-2">
          <button className="btn bg-gray-200" disabled={busy} onClick={() => save(false)}>{t.status === 'published' ? 'Save' : 'Save as Draft'}</button>
          {t.status !== 'published' && <button className="btn btn-primary" disabled={busy} onClick={() => save(true)}>Save &amp; Publish</button>}
        </div>
      </div>
    </Shell>
  );
}
