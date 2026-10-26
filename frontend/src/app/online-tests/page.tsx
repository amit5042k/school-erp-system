'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, getUser } from '@/lib/api';
import { Flash, STATE_UI, useFlash, when } from './_ui';

type StaffTest = {
  id: number; title: string; subject: string | null; class_name: string; class_section: string; all_sections: number;
  start_at: string; end_at: string; duration_min: number; status: string; results_released: number;
  questions: number; total_marks: number; attempts: number; submitted: number; created_by_name: string | null;
};
type MyTest = {
  id: number; title: string; subject: string | null; start_at: string; end_at: string; duration_min: number; questions: number;
  total_marks: number; state: string; results_released: boolean; score: number | null; max_score: number | null; can_take: boolean;
};

export default function OnlineTestsPage() {
  const user = getUser<any>();
  const staff = user?.role === 'admin' || user?.role === 'teacher';
  return <Shell>{staff ? <StaffList /> : <MyTests />}</Shell>;
}

function StaffList() {
  const [rows, setRows] = useState<StaffTest[]>([]);
  const { msg, flash } = useFlash();
  const load = () => api<StaffTest[]>('/online-tests').then(setRows).catch(e => flash(e.message, false));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function act(t: StaffTest, path: string, body: any, done: string, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return;
    try { await api(`/online-tests/${t.id}/${path}`, { method: 'POST', body: JSON.stringify(body) }); flash(done); load(); }
    catch (e: any) { flash(e.message, false); }
  }
  async function remove(t: StaffTest) {
    if (!confirm(`Delete "${t.title}"? Any answers students gave are deleted too.`)) return;
    try { await api(`/online-tests/${t.id}`, { method: 'DELETE' }); flash('Test deleted.'); load(); }
    catch (e: any) { flash(e.message, false); }
  }
  const now = Date.now();

  return (
    <>
      <div className="text-xs text-gray-500 mb-1">Examination › Online Tests</div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div>
          <h2 className="text-xl font-bold text-brand-700">Online Tests</h2>
          <p className="text-sm text-gray-500">Multiple-choice tests that students take on the website or app, marked automatically.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/report/online-test-results" className="btn bg-gray-200 text-sm">Results Report</Link>
          <Link href="/online-tests/edit" className="btn btn-primary text-sm">+ New Test</Link>
        </div>
      </div>
      <Flash msg={msg} />
      <div className="card p-4 overflow-x-auto">
        <table className="table text-sm min-w-max">
          <thead><tr><th>Test</th><th>Class</th><th>Window</th><th>Questions</th><th>Submitted</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {rows.map(t => {
              const ended = t.status === 'closed' || Date.parse(t.end_at) <= now;
              const st = STATE_UI[t.status] || STATE_UI.draft;
              return (
                <tr key={t.id}>
                  <td><div className="font-medium">{t.title}</div><div className="text-xs text-gray-500">{t.subject || '—'} · {t.duration_min} min{t.created_by_name ? ` · ${t.created_by_name}` : ''}</div></td>
                  <td>{t.class_name} {t.all_sections ? '(all sections)' : t.class_section}</td>
                  <td className="text-xs whitespace-nowrap">{when(t.start_at)}<br />to {when(t.end_at)}</td>
                  <td>{t.questions} <span className="text-xs text-gray-500">({t.total_marks} marks)</span></td>
                  <td>{t.submitted}{t.attempts > t.submitted ? <span className="text-xs text-amber-700"> +{t.attempts - t.submitted} writing</span> : null}</td>
                  <td>
                    <span className={`badge ${st.cls}`}>{st.label}</span>
                    {t.results_released ? <span className="badge badge-green ml-1">Results out</span> : null}
                  </td>
                  <td className="whitespace-nowrap text-xs space-x-2">
                    {t.attempts === 0 && <Link className="text-brand-600 hover:underline" href={`/online-tests/edit?id=${t.id}`}>Edit</Link>}
                    {t.status === 'draft' && <button className="text-green-700 hover:underline" onClick={() => act(t, 'publish', {}, 'Published. Students and parents have been notified.')}>Publish</button>}
                    {t.status === 'published' && t.attempts === 0 && <button className="text-gray-600 hover:underline" onClick={() => act(t, 'publish', { publish: false }, 'Moved back to draft.')}>Unpublish</button>}
                    {t.status === 'published' && !ended && <button className="text-red-600 hover:underline" onClick={() => act(t, 'close', {}, 'Test closed. Anyone still writing was submitted with their saved answers.', 'Close the test now? Students still writing will be submitted.')}>Close now</button>}
                    {t.status !== 'draft' && <Link className="text-brand-600 hover:underline" href={`/online-tests/results?id=${t.id}`}>Results</Link>}
                    {ended && t.status !== 'draft' && (t.results_released
                      ? <button className="text-gray-600 hover:underline" onClick={() => act(t, 'release', { released: false }, 'Results hidden from students.')}>Hide results</button>
                      : <button className="text-green-700 hover:underline" onClick={() => act(t, 'release', {}, 'Results released to students and parents.')}>Release results</button>)}
                    <button className="text-red-600 hover:underline" onClick={() => remove(t)}>Delete</button>
                  </td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={7} className="text-center py-6 text-gray-500">No online tests yet. Create one with “+ New Test”.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function MyTests() {
  const [rows, setRows] = useState<MyTest[] | null>(null);
  const { msg, flash } = useFlash();
  useEffect(() => { api<MyTest[]>('/online-tests/my').then(setRows).catch(e => flash(e.message, false)); /* eslint-disable-next-line */ }, []);
  const order = ['in_progress', 'open', 'upcoming', 'submitted', 'missed'];
  const sorted = (rows || []).slice().sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state));

  return (
    <>
      <div className="text-xs text-gray-500 mb-1">Examination › Online Tests</div>
      <h2 className="text-xl font-bold text-brand-700 mb-1">Online Tests</h2>
      <p className="text-sm text-gray-500 mb-4">Tests open at the time set by your teacher. You can take each test once; your answers save automatically.</p>
      <Flash msg={msg} />
      <div className="grid md:grid-cols-2 gap-3">
        {sorted.map(t => {
          const st = STATE_UI[t.state] || STATE_UI.upcoming;
          return (
            <div key={t.id} className="card p-4">
              <div className="flex justify-between items-start gap-2">
                <div>
                  <div className="font-semibold text-brand-700">{t.title}</div>
                  <div className="text-xs text-gray-500">{t.subject || 'Test'} · {t.questions} questions · {t.total_marks} marks · {t.duration_min} min</div>
                </div>
                <span className={`badge ${st.cls}`}>{st.label}</span>
              </div>
              <div className="text-xs text-gray-600 mt-2">Opens {when(t.start_at)} · Closes {when(t.end_at)}</div>
              <div className="mt-3 flex items-center gap-3 text-sm">
                {t.can_take && (t.state === 'open' || t.state === 'in_progress') && (
                  <Link href={`/online-tests/take?id=${t.id}`} className="btn btn-primary text-sm">{t.state === 'open' ? 'Start Test' : 'Continue Test'}</Link>
                )}
                {t.state === 'submitted' && (t.results_released
                  ? <Link href={`/online-tests/result?id=${t.id}`} className="btn bg-gray-200 text-sm">View Result{t.score != null ? ` (${t.score}/${t.max_score})` : ''}</Link>
                  : <span className="text-gray-500 text-xs">Result not released yet</span>)}
                {!t.can_take && (t.state === 'open' || t.state === 'in_progress') && <span className="text-xs text-gray-500">Your child takes this test from their own login.</span>}
              </div>
            </div>
          );
        })}
      </div>
      {rows && !rows.length && <div className="card p-6 text-center text-gray-500">No online tests for your class yet.</div>}
    </>
  );
}
