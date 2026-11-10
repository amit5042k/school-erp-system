'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';
import { Flash, NoTest, STATE_UI, useFlash, when } from '../_ui';

type Results = {
  test: { id: number; title: string; subject: string | null; status: string; end_at: string; results_released: number; total_marks: number; questions: number };
  summary: { students: number; submitted: number; not_attempted: number; average: number | null; highest: number | null; lowest: number | null };
  students: { student_id: number; full_name: string; admission_no: string; roll_no: string | null; class: string; attempt_id: number | null;
    started_at: string | null; submitted_at: string | null; auto_submitted: number; score: number | null; max_score: number | null; correct_count: number | null; wrong_count: number | null }[];
  analysis: { question_id: number; text: string; marks: number; correct: number[]; options: { id: number; text: string; picked: number }[];
    right: number; wrong: number; blank: number; pct_correct: number }[];
};

export default function TestResultsPage({ searchParams }: { searchParams: { id?: string } }) {
  const [r, setR] = useState<Results | null>(null);
  const [tab, setTab] = useState<'students' | 'questions'>('students');
  const { msg, flash } = useFlash();
  const load = () => api<Results>(`/online-tests/${searchParams.id}/results`).then(setR).catch(e => flash(e.message, false));
  useEffect(() => { if (searchParams.id) load(); /* eslint-disable-next-line */ }, [searchParams.id]);

  async function release(released: boolean) {
    try { await api(`/online-tests/${searchParams.id}/release`, { method: 'POST', body: JSON.stringify({ released }) }); flash(released ? 'Results released to students and parents.' : 'Results hidden.'); load(); }
    catch (e: any) { flash(e.message, false); }
  }

  const ended = r && (r.test.status === 'closed' || Date.parse(r.test.end_at) <= Date.now());
  if (!searchParams.id) return <Shell><NoTest /></Shell>;
  return (
    <Shell>
      <div className="text-xs text-gray-500 mb-1 no-print"><Link href="/online-tests" className="hover:underline">Online Tests</Link> › Results</div>
      <Flash msg={msg} />
      {r && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
            <div>
              <h2 className="text-xl font-bold text-brand-700">{r.test.title}</h2>
              <div className="text-sm text-gray-500">{r.test.subject || 'Test'} · {r.test.questions} questions · {r.test.total_marks} marks · closes {when(r.test.end_at)}</div>
            </div>
            <div className="flex gap-2 no-print">
              <button className="btn bg-gray-200 text-sm" onClick={() => window.print()}>Print</button>
              {ended && (r.test.results_released
                ? <button className="btn bg-gray-200 text-sm" onClick={() => release(false)}>Hide Results</button>
                : <button className="btn btn-primary text-sm" onClick={() => release(true)}>Release Results</button>)}
            </div>
          </div>
          {!ended && <div className="text-xs text-amber-700 mb-3">The test is still open. You can release results after it closes.</div>}

          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
            {[['Students', r.summary.students], ['Submitted', r.summary.submitted], ['Not attempted', r.summary.not_attempted],
              ['Average', r.summary.average ?? '—'], ['Highest', r.summary.highest ?? '—'], ['Lowest', r.summary.lowest ?? '—']].map(([k, v]) => (
              <div key={k as string} className="card p-3"><div className="text-xs text-gray-500">{k}</div><div className="text-lg font-bold text-brand-700">{v}</div></div>
            ))}
          </div>

          <div className="flex gap-2 mb-3 no-print">
            <button className={`btn text-sm ${tab === 'students' ? 'btn-primary' : 'bg-gray-200'}`} onClick={() => setTab('students')}>Students</button>
            <button className={`btn text-sm ${tab === 'questions' ? 'btn-primary' : 'bg-gray-200'}`} onClick={() => setTab('questions')}>Question Analysis</button>
          </div>

          {tab === 'students' && (
            <div className="card p-4 overflow-x-auto">
              <table className="table text-sm min-w-max">
                <thead><tr><th>Roll</th><th>Student</th><th>Class</th><th>Status</th><th>Correct</th><th>Wrong</th><th>Score</th><th>%</th><th>Submitted</th></tr></thead>
                <tbody>
                  {r.students.map(s => {
                    const state = s.submitted_at ? 'submitted' : s.attempt_id ? 'in_progress' : (ended ? 'missed' : 'upcoming');
                    const st = state === 'upcoming' ? { label: 'Not started', cls: 'badge-gray' } : STATE_UI[state];
                    return (
                      <tr key={s.student_id}>
                        <td>{s.roll_no || '—'}</td>
                        <td><div className="font-medium">{s.full_name}</div><div className="text-xs text-gray-500">{s.admission_no}</div></td>
                        <td>{s.class}</td>
                        <td><span className={`badge ${st.cls}`}>{st.label}</span>{s.auto_submitted ? <span className="text-xs text-gray-500 ml-1">(time up)</span> : null}</td>
                        <td>{s.correct_count ?? '—'}</td>
                        <td>{s.wrong_count ?? '—'}</td>
                        <td className="font-semibold">{s.submitted_at ? `${s.score}/${s.max_score}` : '—'}</td>
                        <td>{s.submitted_at && s.max_score ? `${Math.round(((s.score || 0) / s.max_score) * 100)}%` : '—'}</td>
                        <td className="text-xs">{s.submitted_at ? when(s.submitted_at) : '—'}</td>
                      </tr>
                    );
                  })}
                  {!r.students.length && <tr><td colSpan={9} className="text-center py-6 text-gray-500">No students in this class.</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'questions' && r.analysis.map((q, i) => {
            const answered = q.right + q.wrong + q.blank;
            return (
              <div key={q.question_id} className="card p-4 mb-3 text-sm">
                <div className="flex justify-between gap-2 mb-2">
                  <div className="font-medium whitespace-pre-wrap">Q{i + 1}. {q.text}</div>
                  <span className={`badge ${q.pct_correct >= 70 ? 'badge-green' : q.pct_correct >= 40 ? 'badge-amber' : 'badge-red'} whitespace-nowrap`}>{q.pct_correct}% correct</span>
                </div>
                <div className="space-y-1">
                  {q.options.map((o, k) => {
                    const pct = answered ? Math.round((o.picked / answered) * 100) : 0;
                    const ok = q.correct.includes(o.id);
                    return (
                      <div key={o.id} className="flex items-center gap-2">
                        <span className={`w-5 text-xs font-bold ${ok ? 'text-green-700' : 'text-gray-500'}`}>{String.fromCharCode(65 + k)}</span>
                        <div className="flex-1 relative bg-gray-100 rounded h-6 overflow-hidden">
                          <div className={`absolute inset-y-0 left-0 ${ok ? 'bg-green-200' : 'bg-gray-300'}`} style={{ width: `${pct}%` }} />
                          <div className="relative px-2 leading-6 truncate">{o.text}{ok ? ' ✓' : ''}</div>
                        </div>
                        <span className="text-xs text-gray-600 w-20 text-right">{o.picked} ({pct}%)</span>
                      </div>
                    );
                  })}
                </div>
                <div className="text-xs text-gray-500 mt-2">{q.right} correct · {q.wrong} wrong · {q.blank} left blank</div>
              </div>
            );
          })}
        </>
      )}
    </Shell>
  );
}
