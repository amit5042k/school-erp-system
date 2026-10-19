'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, fmtDate, getUser } from '@/lib/api';

type ClassRow = { id: number; name: string; section: string };
type Poll = { id: number; class_id: number | null; class_name?: string | null; class_section?: string | null; section?: string | null; question: string; option1: string; option2: string; option3?: string | null; option4?: string | null; expire_date: string };
type OpenSurvey = { id: number; question: string; expire_date: string; class_name: string | null; class_section: string | null; options: { no: number; text: string }[]; my_vote: number | null };
type Result = { id: number; question: string; expire_date: string; open: boolean; audience: string; total: number; leading: string | null; options: { no: number; text: string; votes: number; pct: number }[] };
type Tab = 'vote' | 'add' | 'manage' | 'report';

export default function SurveysPage() {
  const role = getUser<any>()?.role;
  const isStaff = role === 'admin' || role === 'teacher';
  const [tab, setTab] = useState<Tab>(isStaff ? 'add' : 'vote');
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [open, setOpen] = useState<OpenSurvey[]>([]);
  const [choice, setChoice] = useState<Record<number, number>>({});
  const [results, setResults] = useState<Result[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function flash(text: string, ok = true) { setMsg({ ok, text }); setTimeout(() => setMsg(null), 3000); }
  async function loadPolls() {
    try { setPolls(await api<Poll[]>('/surveys')); } catch (e: any) { flash(e.message, false); }
  }
  async function loadOpen() {
    try { setOpen(await api<OpenSurvey[]>('/comm/surveys/open')); } catch (e: any) { flash(e.message, false); }
  }
  async function loadResults() {
    try { setResults(await api<Result[]>('/comm/surveys/results')); } catch (e: any) { flash(e.message, false); }
  }

  useEffect(() => {
    loadOpen();
    if (isStaff) { api<ClassRow[]>('/classes').then(setClasses).catch(() => {}); loadPolls(); }
    // eslint-disable-next-line
  }, []);
  useEffect(() => { if (tab === 'report') loadResults(); if (tab === 'vote') loadOpen(); /* eslint-disable-next-line */ }, [tab]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const f = e.target as any;
    const p = {
      class_id: f.class_id.value ? Number(f.class_id.value) : null,
      section: f.section.value,
      question: f.question.value,
      option1: f.option1.value,
      option2: f.option2.value,
      option3: f.option3.value,
      option4: f.option4.value,
      expire_date: f.expire_date.value,
    };
    try {
      await api('/surveys', { method: 'POST', body: JSON.stringify(p) });
      f.reset();
      flash('Survey saved.');
      loadPolls(); loadOpen();
    } catch (e: any) { flash(e.message, false); }
  }

  async function remove(p: Poll) {
    if (!confirm('Delete this survey and all its votes?')) return;
    try { await api(`/surveys/${p.id}`, { method: 'DELETE' }); loadPolls(); }
    catch (e: any) { flash(e.message, false); }
  }

  async function vote(s: OpenSurvey) {
    const option = choice[s.id];
    if (!option) return flash('Choose an answer first.', false);
    try {
      await api(`/comm/surveys/${s.id}/vote`, { method: 'POST', body: JSON.stringify({ option }) });
      flash('Thank you, your vote has been recorded.');
      loadOpen();
    } catch (e: any) { flash(e.message, false); }
  }

  const TABS: { key: Tab; label: string }[] = isStaff
    ? [{ key: 'add', label: 'Add Survey' }, { key: 'manage', label: 'Manage Survey' }, { key: 'report', label: 'Survey Report' }, { key: 'vote', label: 'Vote' }]
    : [{ key: 'vote', label: 'Open Surveys' }];

  return (
    <Shell>
      <div className="text-xs text-gray-500 mb-1">Dashboard › Online Survey</div>
      <div className="flex items-baseline gap-3 mb-4">
        <span className="text-brand-600 text-2xl leading-none">🗳</span>
        <h2 className="text-xl font-bold text-brand-700">Online Survey</h2>
        <span className="text-sm text-gray-500">Polls for Students, Parents & Staff</span>
      </div>

      <div className="flex flex-wrap gap-2 mb-4 border-b">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm rounded-t border-b-2 -mb-px ${tab === t.key ? 'border-brand-600 text-brand-700 font-semibold bg-brand-50' : 'border-transparent text-gray-600 hover:text-brand-600'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {msg && (
        <div className={`text-sm rounded px-3 py-2 mb-3 border ${msg.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {msg.text}
        </div>
      )}

      {tab === 'vote' && (
        <div className="grid md:grid-cols-2 gap-4">
          {open.map(s => (
            <div key={s.id} className="card p-4 text-sm">
              <div className="font-semibold text-brand-700">{s.question}</div>
              <div className="text-xs text-gray-500 mb-3">
                {s.class_name ? `${s.class_name} ${s.class_section}` : 'Everyone'} · closes {fmtDate(s.expire_date)}
              </div>
              {s.my_vote ? (
                <div className="text-green-700">
                  You voted: <b>{s.options.find(o => o.no === s.my_vote)?.text}</b>
                </div>
              ) : (
                <>
                  <div className="space-y-1">
                    {s.options.map(o => (
                      <label key={o.no} className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name={`s${s.id}`} checked={choice[s.id] === o.no} onChange={() => setChoice(c => ({ ...c, [s.id]: o.no }))} />
                        {o.text}
                      </label>
                    ))}
                  </div>
                  <button className="btn btn-primary text-xs mt-3" onClick={() => vote(s)}>Submit Vote</button>
                </>
              )}
            </div>
          ))}
          {!open.length && <div className="card p-6 text-center text-gray-500 md:col-span-2">No open surveys for you right now.</div>}
        </div>
      )}

      {isStaff && tab === 'add' && (
        <form onSubmit={save} className="card p-4 grid md:grid-cols-2 gap-3 text-sm">
          <h3 className="md:col-span-2 font-semibold text-brand-700">Add Survey</h3>
          <div><label className="label">Class</label>
            <select className="input" name="class_id">
              <option value="">All Classes</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name} {c.section}</option>)}
            </select></div>
          <div><label className="label">Section</label><input className="input" name="section" placeholder="All Sections" /></div>
          <div className="md:col-span-2"><label className="label">Question *</label><input className="input" name="question" required /></div>
          <div><label className="label">Option 1 *</label><input className="input" name="option1" required /></div>
          <div><label className="label">Option 2 *</label><input className="input" name="option2" required /></div>
          <div><label className="label">Option 3</label><input className="input" name="option3" /></div>
          <div><label className="label">Option 4</label><input className="input" name="option4" /></div>
          <div><label className="label">Expire Date *</label><input className="input" name="expire_date" type="date" required /></div>
          <div className="md:col-span-2 text-xs text-gray-500">Students and parents of the chosen class (or everyone) can vote once until the expire date. Staff can vote too.</div>
          <div className="md:col-span-2"><button className="btn btn-primary">Save</button></div>
        </form>
      )}

      {isStaff && tab === 'manage' && (
        <div className="card p-4 overflow-x-auto">
          <h3 className="font-semibold text-brand-700 mb-3">Manage Survey</h3>
          <table className="table">
            <thead><tr><th>Question</th><th>Class</th><th>Section</th><th>Options</th><th>Expires</th><th></th></tr></thead>
            <tbody>
              {polls.map(p => (
                <tr key={p.id}>
                  <td>{p.question}</td>
                  <td>{p.class_name ? `${p.class_name} ${p.class_section}` : 'All'}</td>
                  <td>{p.section || '—'}</td>
                  <td>{[p.option1, p.option2, p.option3, p.option4].filter(Boolean).join(' / ')}</td>
                  <td>{fmtDate(p.expire_date)}</td>
                  <td><button className="text-xs text-red-600 hover:underline" onClick={() => remove(p)}>Delete</button></td>
                </tr>
              ))}
              {!polls.length && <tr><td colSpan={6} className="text-center text-gray-500 py-4">No surveys yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {isStaff && tab === 'report' && (
        <div>
          <div className="flex justify-end gap-2 mb-3">
            <Link href="/report/survey-summary" className="btn bg-gray-200 text-sm">Download / Print Report</Link>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {results.map(r => (
              <div key={r.id} className="card p-4 text-sm print-avoid-break">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold text-brand-700">{r.question}</div>
                  <span className={`badge ${r.open ? 'badge-green' : 'badge-gray'}`}>{r.open ? 'Open' : 'Closed'}</span>
                </div>
                <div className="text-xs text-gray-500 mb-3">{r.audience} · closes {fmtDate(r.expire_date)} · {r.total} vote(s)</div>
                <div className="space-y-2">
                  {r.options.map(o => (
                    <div key={o.no}>
                      <div className="flex justify-between text-xs"><span>{o.text}{r.leading === o.text && r.total > 0 && ' ★'}</span><span>{o.votes} ({o.pct}%)</span></div>
                      <div className="h-3 bg-gray-100 rounded overflow-hidden">
                        <div className="h-full bg-brand-600 rounded" style={{ width: `${o.pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {!results.length && <div className="card p-6 text-center text-gray-500 md:col-span-2">No surveys yet.</div>}
          </div>
        </div>
      )}
    </Shell>
  );
}
