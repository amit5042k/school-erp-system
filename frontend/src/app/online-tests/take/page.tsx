'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import Shell from '@/components/Shell';
import { api, fileUrl } from '@/lib/api';
import { Flash, NoTest, useFlash } from '../_ui';

type Question = { id: number; text: string; image_url: string | null; marks: number; negative: number; multiple: boolean; options: { id: number; text: string }[] };
type Paper = {
  attempt_id: number; test: { id: number; title: string; subject: string | null; instructions: string | null; duration_min: number };
  server_time: string; deadline_at: string; answers: Record<string, number[]>; questions: Question[];
};

const fmtLeft = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export default function TakeTestPage({ searchParams }: { searchParams: { id?: string } }) {
  const [paper, setPaper] = useState<Paper | null>(null);
  const [answers, setAnswers] = useState<Record<string, number[]>>({});
  const [skew, setSkew] = useState(0);              // server clock minus this device's clock
  const [left, setLeft] = useState<number | null>(null);
  const [saved, setSaved] = useState<'saved' | 'saving' | 'error' | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [current, setCurrent] = useState(0);
  const { msg, flash } = useFlash();
  const dirty = useRef(false);
  const answersRef = useRef(answers);
  answersRef.current = answers;

  useEffect(() => {
    if (!searchParams.id) return;
    api<Paper>(`/online-tests/${searchParams.id}/start`, { method: 'POST', body: '{}' }).then(p => {
      setPaper(p); setAnswers(p.answers || {});
      setSkew(Date.parse(p.server_time) - Date.now());
    }).catch(e => flash(e.message, false));
    /* eslint-disable-next-line */
  }, [searchParams.id]);

  // retries: extra tries 3 s apart, used at time-up so a dropped connection doesn't lose the last answers
  // (the server still accepts them for 15 s after the deadline).
  const save = useCallback(async (submit = false, retries = 0) => {
    if (!paper || done) return;
    setSaved('saving');
    for (let attempt = 0; ; attempt++) {
      try {
        await api(`/online-tests/attempts/${paper.attempt_id}${submit ? '/submit' : ''}`, {
          method: submit ? 'POST' : 'PUT', body: JSON.stringify({ answers: answersRef.current }),
        });
        dirty.current = false;
        setSaved('saved');
        if (submit) setDone('Your answers have been submitted.');
        return;
      } catch (e: any) {
        if (/submitted|Time is up/.test(e.message)) { setSaved('error'); setDone(e.message); return; }
        if (attempt < retries) { await new Promise(r => setTimeout(r, 3000)); continue; }
        setSaved('error');
        if (submit) flash(e.message, false);
        return;
      }
    }
  }, [paper, done, flash]);

  // Autosave every 10 s when something changed; countdown every second; submit at time-up.
  useEffect(() => {
    if (!paper || done) return;
    const tick = setInterval(() => {
      const ms = Date.parse(paper.deadline_at) - (Date.now() + skew);
      setLeft(ms);
      if (ms <= 0) { clearInterval(tick); save(true, 4); }
    }, 1000);
    const autosave = setInterval(() => { if (dirty.current) save(false); }, 10000);
    return () => { clearInterval(tick); clearInterval(autosave); };
  }, [paper, skew, done, save]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (paper && !done && dirty.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [paper, done]);

  function pick(q: Question, optId: number) {
    dirty.current = true;
    setSaved(null);
    setAnswers(a => {
      const cur = a[q.id] || [];
      const next = q.multiple ? (cur.includes(optId) ? cur.filter(x => x !== optId) : [...cur, optId]) : [optId];
      return { ...a, [q.id]: next };
    });
  }
  const clearQ = (q: Question) => { dirty.current = true; setAnswers(a => { const n = { ...a }; delete n[q.id]; return n; }); };

  if (done) return (
    <Shell>
      <div className="card p-6 max-w-lg mx-auto text-center">
        <div className="text-3xl mb-2">✓</div>
        <h2 className="text-lg font-bold text-brand-700 mb-2">{paper?.test.title || 'Online Test'}</h2>
        <p className="text-gray-700 mb-4">{done}</p>
        <p className="text-sm text-gray-500 mb-4">Your teacher will release the result; you&apos;ll see it under Online Tests.</p>
        <Link href="/online-tests" className="btn btn-primary">Back to Online Tests</Link>
      </div>
    </Shell>
  );
  if (!searchParams.id) return <Shell><NoTest /></Shell>;
  if (!paper) return <Shell><Flash msg={msg} />{!msg && <div className="text-gray-500">Opening your test…</div>}<Link href="/online-tests" className="text-brand-600 underline text-sm">Back to Online Tests</Link></Shell>;

  const q = paper.questions[current];
  const answered = paper.questions.filter(x => (answers[x.id] || []).length).length;
  const low = left != null && left < 60000;

  return (
    <Shell>
      <div className="sticky top-0 z-10 bg-white border-b -mx-4 px-4 py-2 mb-4 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-brand-700 truncate">{paper.test.title}</div>
          <div className="text-xs text-gray-500">{answered} of {paper.questions.length} answered · {saved === 'saving' ? 'Saving…' : saved === 'saved' ? 'All answers saved' : saved === 'error' ? 'Not saved – check your connection' : 'Unsaved changes'}</div>
        </div>
        <div className={`text-lg font-mono font-bold px-3 py-1 rounded ${low ? 'bg-red-100 text-red-700' : 'bg-brand-50 text-brand-700'}`}>{left == null ? '–:––' : fmtLeft(left)}</div>
        <button className="btn btn-primary text-sm" onClick={() => {
          const blank = paper.questions.length - answered;
          if (confirm(blank ? `${blank} question(s) are unanswered. Submit anyway? You can't change answers after submitting.` : 'Submit your test? You cannot change answers after submitting.')) save(true);
        }}>Submit</button>
      </div>
      <Flash msg={msg} />
      {paper.test.instructions && current === 0 && <div className="card p-3 mb-3 text-sm bg-brand-50">{paper.test.instructions}</div>}

      <div className="card p-4 mb-3">
        <div className="flex justify-between text-xs text-gray-500 mb-2">
          <span>Question {current + 1} of {paper.questions.length}</span>
          <span>{q.marks} mark{q.marks === 1 ? '' : 's'}{q.negative ? ` · −${q.negative} if wrong` : ''}{q.multiple ? ' · choose all correct answers' : ''}</span>
        </div>
        <div className="font-medium mb-3 whitespace-pre-wrap">{q.text}</div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {q.image_url && <img src={fileUrl(q.image_url)} alt="" className="max-h-64 rounded border mb-3" />}
        <div className="space-y-2">
          {q.options.map((o, k) => {
            const on = (answers[q.id] || []).includes(o.id);
            return (
              <button key={o.id} type="button" onClick={() => pick(q, o.id)}
                className={`w-full text-left px-3 py-2 rounded border flex gap-3 items-start ${on ? 'border-brand-600 bg-brand-50' : 'hover:bg-gray-50'}`}>
                <span className={`w-6 h-6 shrink-0 grid place-items-center text-xs font-bold ${q.multiple ? 'rounded' : 'rounded-full'} ${on ? 'bg-brand-600 text-white' : 'border'}`}>{String.fromCharCode(65 + k)}</span>
                <span>{o.text}</span>
              </button>
            );
          })}
        </div>
        <div className="flex justify-between mt-4 text-sm">
          <button className="btn bg-gray-200" disabled={current === 0} onClick={() => setCurrent(c => c - 1)}>‹ Previous</button>
          <button className="text-xs text-gray-500 hover:underline" onClick={() => clearQ(q)}>Clear answer</button>
          <button className="btn bg-gray-200" disabled={current === paper.questions.length - 1} onClick={() => { if (dirty.current) save(false); setCurrent(c => c + 1); }}>Next ›</button>
        </div>
      </div>

      <div className="card p-3">
        <div className="text-xs text-gray-500 mb-2">Jump to a question</div>
        <div className="flex flex-wrap gap-1">
          {paper.questions.map((x, i) => (
            <button key={x.id} onClick={() => setCurrent(i)}
              className={`w-8 h-8 rounded text-xs font-semibold ${i === current ? 'ring-2 ring-brand-600' : ''} ${(answers[x.id] || []).length ? 'bg-green-600 text-white' : 'bg-gray-100'}`}>{i + 1}</button>
          ))}
        </div>
      </div>
    </Shell>
  );
}
