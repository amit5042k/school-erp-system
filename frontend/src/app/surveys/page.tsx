'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';

type ClassRow = { id: number; name: string; section: string };
type Poll = { id?: number; class_id?: number; section?: string; question: string; option1: string; option2: string; option3?: string; option4?: string; expire_date: string };

export default function SurveysPage() {
  const [tab, setTab] = useState<'add' | 'manage' | 'report'>('add');
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    api<ClassRow[]>('/classes').then(setClasses).catch(() => {});
    // Polls endpoint optional; keep local list if unavailable
  }, []);

  function flash(m: string) { setMsg(m); setTimeout(() => setMsg(null), 2500); }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const f = e.target as any;
    const p: Poll = {
      class_id: f.class_id.value ? Number(f.class_id.value) : undefined,
      section: f.section.value,
      question: f.question.value,
      option1: f.option1.value,
      option2: f.option2.value,
      option3: f.option3.value,
      option4: f.option4.value,
      expire_date: f.expire_date.value,
    };
    setPolls(x => [{ ...p, id: Date.now() }, ...x]);
    f.reset();
    flash('Survey saved.');
  }

  const TABS: { key: typeof tab; label: string }[] = [
    { key: 'add',    label: 'Add Survey' },
    { key: 'manage', label: 'Manage Survey' },
    { key: 'report', label: 'Survey Report' },
  ];

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

      {msg && <div className="text-sm bg-green-50 border border-green-200 text-green-700 rounded px-3 py-2 mb-3">{msg}</div>}

      {tab === 'add' && (
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
          <div><label className="label">Expire Date</label><input className="input" name="expire_date" type="date" required /></div>
          <div className="md:col-span-2"><button className="btn btn-primary">Save</button></div>
        </form>
      )}

      {tab === 'manage' && (
        <div className="card p-4 overflow-x-auto">
          <h3 className="font-semibold text-brand-700 mb-3">Manage Survey</h3>
          <table className="table">
            <thead><tr><th>Question</th><th>Class</th><th>Section</th><th>Options</th><th>Expires</th></tr></thead>
            <tbody>
              {polls.map(p => (
                <tr key={p.id}>
                  <td>{p.question}</td>
                  <td>{classes.find(c => c.id === p.class_id)?.name || 'All'}</td>
                  <td>{p.section || '—'}</td>
                  <td>{[p.option1, p.option2, p.option3, p.option4].filter(Boolean).join(' / ')}</td>
                  <td>{p.expire_date}</td>
                </tr>
              ))}
              {!polls.length && <tr><td colSpan={5} className="text-center text-gray-500 py-4">No surveys yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'report' && (
        <div className="card p-4 text-sm text-gray-600">
          <h3 className="font-semibold text-brand-700 mb-2">Survey Report</h3>
          Survey result analytics coming soon.
        </div>
      )}
    </Shell>
  );
}
