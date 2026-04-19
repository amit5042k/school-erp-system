'use client';

import { useEffect, useRef, useState } from 'react';
import Shell from '@/components/Shell';
import { api, getUser } from '@/lib/api';

type Student = {
  id: number; admission_no: string; full_name: string; gender: string;
  class_name: string; class_section: string; roll_no: number;
  father_name: string; contact: string;
};

type Group = {
  title: string;
  actions: { label: string; kind: 'admission' | 'manage' | 'search' | 'report'; report?: string }[];
};

const OPTION_GROUPS: Group[] = [
  { title: 'Core', actions: [
    { label: 'Admission',          kind: 'admission' },
    { label: 'Manage Student',     kind: 'manage'    },
    { label: 'Advance Search',     kind: 'search'    },
  ]},
  { title: 'Reports', actions: [
    { label: 'TC Issue Report',                     kind: 'report', report: 'tc-issue' },
    { label: 'Admission And Registration Report',   kind: 'report', report: 'adm-reg'  },
    { label: 'Student Strength Report',             kind: 'report', report: 'strength' },
  ]},
  { title: 'Extended Reports & Prospectus', actions: [
    { label: 'Admission/Withdrawl Report',          kind: 'report', report: 'adm-wdr'          },
    { label: 'Student Age Report',                  kind: 'report', report: 'age'              },
    { label: 'Download Student Id Card',            kind: 'report', report: 'id-card'          },
    { label: 'Student Pending Documents',           kind: 'report', report: 'pending-docs'     },
    { label: 'Student Registrations Report',        kind: 'report', report: 'regs'             },
    { label: 'Add Student Registrations',           kind: 'report', report: 'add-regs'         },
    { label: 'Registrations & Prospectus Report',   kind: 'report', report: 'reg-prospectus'   },
    { label: 'Student Customized Fields Report',    kind: 'report', report: 'custom-fields'    },
    { label: 'Student Prospectus Settings',         kind: 'report', report: 'prospectus-cfg'   },
    { label: 'Prospectus & Registration Summary',   kind: 'report', report: 'prospectus-sum'   },
    { label: 'Admission Summary',                   kind: 'report', report: 'adm-summary'      },
    { label: 'Send Usernames and Password',         kind: 'report', report: 'send-credentials' },
  ]},
];

export default function StudentsPage() {
  const [rows, setRows] = useState<Student[]>([]);
  const [q, setQ] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [genderFilter, setGenderFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const user = getUser<any>();
  const isAdmin = user?.role === 'admin';

  const [form, setForm] = useState({
    admission_no: '', full_name: '', gender: 'M', roll_no: '', father_name: '', contact: '',
  });

  async function load() {
    try { setRows(await api<Student[]>('/students')); }
    catch (e: any) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function addStudent(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api('/students', { method: 'POST', body: JSON.stringify({
        ...form, roll_no: form.roll_no ? Number(form.roll_no) : null,
      }) });
      setAdding(false);
      setForm({ admission_no: '', full_name: '', gender: 'M', roll_no: '', father_name: '', contact: '' });
      load();
    } catch (e: any) { setError(e.message); }
  }

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }

  function handleAction(a: Group['actions'][number]) {
    if (a.kind === 'admission') {
      if (!isAdmin) return flash('Only admins can create admissions.');
      setAdding(true);
      setTimeout(() => document.getElementById('adm-form')?.scrollIntoView({ behavior: 'smooth' }), 50);
    } else if (a.kind === 'manage') {
      listRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else if (a.kind === 'search') {
      listRef.current?.scrollIntoView({ behavior: 'smooth' });
      setTimeout(() => searchRef.current?.focus(), 300);
    } else if (a.kind === 'report') {
      flash(`${a.label}: report module coming soon.`);
    }
  }

  const filtered = rows.filter(r => {
    if (q && !(
      r.full_name.toLowerCase().includes(q.toLowerCase()) ||
      r.admission_no.toLowerCase().includes(q.toLowerCase()) ||
      (r.father_name || '').toLowerCase().includes(q.toLowerCase())
    )) return false;
    if (classFilter && `${r.class_name} ${r.class_section}` !== classFilter) return false;
    if (genderFilter && r.gender !== genderFilter) return false;
    return true;
  });

  const classOptions = Array.from(new Set(rows
    .filter(r => r.class_name)
    .map(r => `${r.class_name} ${r.class_section}`.trim())
  )).sort();

  return (
    <Shell>
      {/* Landing header */}
      <div className="text-xs text-gray-500 mb-1">Admissions › Student</div>
      <div className="flex items-baseline gap-3 mb-4">
        <h2 className="text-xl font-bold text-brand-700">Student</h2>
        <span className="text-sm text-gray-500">Explore Options</span>
      </div>

      {/* Explore Options — 3 groups */}
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        {OPTION_GROUPS.map(g => (
          <div key={g.title} className="card p-0 overflow-hidden">
            <div className="bg-brand-700 text-white text-xs font-semibold px-3 py-2">{g.title}</div>
            <ul className="divide-y">
              {g.actions.map(a => (
                <li key={a.label}>
                  <button
                    onClick={() => handleAction(a)}
                    className="w-full flex items-center justify-between px-3 py-2 text-left text-sm hover:bg-brand-50"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-brand-600">▸</span>
                      <span>{a.label}</span>
                    </span>
                    <span className="text-xs text-gray-400">{a.kind === 'report' ? 'Report' : 'Action'}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {toast && (
        <div className="fixed bottom-4 right-4 bg-gray-900 text-white text-sm px-3 py-2 rounded shadow z-50">
          {toast}
        </div>
      )}

      {/* Admission form */}
      {adding && (
        <form id="adm-form" onSubmit={addStudent} className="card p-4 mb-4 grid md:grid-cols-3 gap-3 text-sm">
          <div className="md:col-span-3 flex items-center justify-between">
            <h3 className="font-semibold text-brand-700">New Admission</h3>
            <button type="button" onClick={() => setAdding(false)} className="text-xs text-gray-500 hover:underline">Cancel</button>
          </div>
          <div><label className="label">Admission No *</label>
            <input className="input" required value={form.admission_no} onChange={e => setForm({ ...form, admission_no: e.target.value })} /></div>
          <div><label className="label">Full Name *</label>
            <input className="input" required value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} /></div>
          <div><label className="label">Gender</label>
            <select className="input" value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })}>
              <option value="M">Male</option><option value="F">Female</option><option value="O">Other</option>
            </select></div>
          <div><label className="label">Roll No</label>
            <input className="input" type="number" value={form.roll_no} onChange={e => setForm({ ...form, roll_no: e.target.value })} /></div>
          <div><label className="label">Father's Name</label>
            <input className="input" value={form.father_name} onChange={e => setForm({ ...form, father_name: e.target.value })} /></div>
          <div><label className="label">Contact</label>
            <input className="input" value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })} /></div>
          <div className="md:col-span-3"><button className="btn btn-primary">Save Student</button></div>
        </form>
      )}

      {/* Students list */}
      <div ref={listRef} className="card p-4">
        <div className="flex flex-wrap gap-2 items-end mb-3">
          <div>
            <label className="label text-xs">Search</label>
            <input ref={searchRef} className="input max-w-xs" placeholder="Name, admission no, or father"
              value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <div>
            <label className="label text-xs">Class</label>
            <select className="input" value={classFilter} onChange={e => setClassFilter(e.target.value)}>
              <option value="">All classes</option>
              {classOptions.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label text-xs">Gender</label>
            <select className="input" value={genderFilter} onChange={e => setGenderFilter(e.target.value)}>
              <option value="">All</option>
              <option value="M">Male</option>
              <option value="F">Female</option>
              <option value="O">Other</option>
            </select>
          </div>
          <div className="ml-auto text-xs text-gray-500 self-end">{filtered.length} student(s)</div>
        </div>
        {error && <div className="text-red-700 text-sm mb-2">{error}</div>}
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr>
              <th>Adm. No</th><th>Name</th><th>Class</th><th>Roll</th><th>Gender</th><th>Father</th><th>Contact</th>
            </tr></thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id}>
                  <td>{s.admission_no}</td>
                  <td>{s.full_name}</td>
                  <td>{s.class_name ? `${s.class_name} ${s.class_section}` : '—'}</td>
                  <td>{s.roll_no || '—'}</td>
                  <td>{s.gender || '—'}</td>
                  <td>{s.father_name || '—'}</td>
                  <td>{s.contact || '—'}</td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={7} className="text-center text-gray-500 py-4">No students found.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}
