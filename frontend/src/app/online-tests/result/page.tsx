'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, fileUrl } from '@/lib/api';
import { Flash, NoTest, useFlash, when } from '../_ui';

type MyResult = {
  test: { id: number; title: string; subject?: string | null }; attempted: boolean; released: boolean; submitted_at?: string;
  auto_submitted?: boolean; score?: number; max_score?: number; correct_count?: number; wrong_count?: number;
  questions?: { id: number; text: string; image_url: string | null; marks: number; negative: number; options: { id: number; text: string }[];
    chosen: number[]; correct: number[]; outcome: 'correct' | 'wrong' | 'blank'; earned: number }[];
};

const OUTCOME = { correct: ['Correct', 'badge-green'], wrong: ['Wrong', 'badge-red'], blank: ['Not answered', 'badge-gray'] } as const;

export default function MyTestResultPage({ searchParams }: { searchParams: { id?: string } }) {
  const [r, setR] = useState<MyResult | null>(null);
  const { msg, flash } = useFlash();
  useEffect(() => { if (!searchParams.id) return; api<MyResult>(`/online-tests/${searchParams.id}/my-result`).then(setR).catch(e => flash(e.message, false)); /* eslint-disable-next-line */ }, [searchParams.id]);

  if (!searchParams.id) return <Shell><NoTest /></Shell>;
  return (
    <Shell>
      <div className="text-xs text-gray-500 mb-1 no-print"><Link href="/online-tests" className="hover:underline">Online Tests</Link> › Result</div>
      <Flash msg={msg} />
      {r && (
        <>
          <h2 className="text-xl font-bold text-brand-700 mb-3">{r.test.title}</h2>
          {!r.attempted && <div className="card p-6 text-center text-gray-500">This test was not attempted.</div>}
          {r.attempted && !r.released && <div className="card p-6 text-center text-gray-500">Submitted {when(r.submitted_at)}. The result has not been released yet.</div>}
          {r.released && r.questions && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="card p-3"><div className="text-xs text-gray-500">Score</div><div className="text-2xl font-bold text-brand-700">{r.score}/{r.max_score}</div></div>
                <div className="card p-3"><div className="text-xs text-gray-500">Percentage</div><div className="text-2xl font-bold text-brand-700">{r.max_score ? Math.round(((r.score || 0) / r.max_score) * 100) : 0}%</div></div>
                <div className="card p-3"><div className="text-xs text-gray-500">Correct</div><div className="text-2xl font-bold text-green-700">{r.correct_count}</div></div>
                <div className="card p-3"><div className="text-xs text-gray-500">Wrong</div><div className="text-2xl font-bold text-red-700">{r.wrong_count}</div></div>
              </div>
              <div className="text-xs text-gray-500 mb-3">Submitted {when(r.submitted_at)}{r.auto_submitted ? ' (automatically when time ran out)' : ''}</div>
              {r.questions.map((q, i) => {
                const [label, cls] = OUTCOME[q.outcome];
                return (
                  <div key={q.id} className="card p-4 mb-3 text-sm">
                    <div className="flex justify-between gap-2 mb-2">
                      <div className="font-medium whitespace-pre-wrap">Q{i + 1}. {q.text}</div>
                      <div className="text-right whitespace-nowrap"><span className={`badge ${cls}`}>{label}</span><div className="text-xs text-gray-500 mt-1">{q.earned > 0 ? '+' : ''}{q.earned} / {q.marks}</div></div>
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {q.image_url && <img src={fileUrl(q.image_url)} alt="" className="max-h-48 rounded border mb-2" />}
                    <div className="space-y-1">
                      {q.options.map((o, k) => {
                        const ok = q.correct.includes(o.id), mine = q.chosen.includes(o.id);
                        return (
                          <div key={o.id} className={`px-3 py-1.5 rounded border flex gap-2 ${ok ? 'border-green-400 bg-green-50' : mine ? 'border-red-300 bg-red-50' : ''}`}>
                            <span className="font-bold text-xs w-4">{String.fromCharCode(65 + k)}</span>
                            <span className="flex-1">{o.text}</span>
                            {mine && <span className="text-xs text-gray-600">Your answer</span>}
                            {ok && <span className="text-xs text-green-700">✓ Correct</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </>
      )}
    </Shell>
  );
}
