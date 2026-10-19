'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import ExploreOptions from '@/components/ExploreOptions';
import FileUpload, { FileLinks } from '@/components/FileUpload';
import { api, fmtDate, getUser } from '@/lib/api';

type Homework = {
  id: number; class_id: number; class_name: string; class_section: string; subject: string; title: string; description: string | null;
  due_date: string | null; teacher_name: string | null; assign_date: string; attachments: string | null; attachment_names: string | null;
};

const STUDENT_LINKS = [
  { label: 'Class Communication', href: '/academic-comm/sectionwise', icon: '📝' },
  { label: 'School Diary', href: '/academic-comm/diary', icon: '📔' },
  { label: 'Online Classes', href: '/academic-comm/online-classes', icon: '💻' },
  { label: 'Study Resources', href: '/academic-comm/resources', icon: '📚' },
  { label: 'Monthly Planner', href: '/academic-comm/planner', icon: '🗓' },
  { label: 'School News', href: '/academic-comm/news', icon: '📰' },
  { label: 'Observations', href: '/academic-comm/observations', icon: '👀' },
  { label: 'Creativity', href: '/academic-comm/creativity', icon: '🎨' },
  { label: 'Lost and Found', href: '/academic-comm/lost-found', icon: '🧳' },
  { label: 'Online Survey', href: '/surveys', icon: '🗳' },
  { label: 'Time Table', href: '/timetable', icon: '⏰' },
  { label: 'Documents', href: '/documents', icon: '📄' },
];

export default function HomeworkPage() {
  const role = getUser<any>()?.role;
  const isStaff = role === 'admin' || role === 'teacher';
  const [rows, setRows] = useState<Homework[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [files, setFiles] = useState<{ url: string; name: string }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  async function load() {
    try { setRows(await api<Homework[]>('/comm/homework')); } catch (e: any) { setErr(e.message); }
  }
  useEffect(() => {
    load();
    if (isStaff) {
      api<any[]>('/classes').then(setClasses).catch(() => {});
      api<any[]>('/teachers').then(setTeachers).catch(() => {});
      api<any[]>('/masters/subjects').then(setSubjects).catch(() => {});
    }
    // eslint-disable-next-line
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const f = e.target as any;
    setErr(null);
    try {
      const { id } = await api<{ id: number }>('/homework', { method: 'POST', body: JSON.stringify({
        class_id: Number(f.class_id.value), subject: f.subject.value,
        title: f.title.value, description: f.description.value,
        due_date: f.due_date.value || null, teacher_id: f.teacher_id.value ? Number(f.teacher_id.value) : null,
      }) });
      if (files.length) {
        await api(`/comm/homework/${id}/attachments`, { method: 'PUT', body: JSON.stringify({
          attachments: files.map(x => x.url), attachment_names: files.map(x => x.name.replace(/,/g, ' ')),
        }) });
      }
      f.reset(); setFiles([]); setAdding(false); setOk('Homework assigned.'); setTimeout(() => setOk(null), 3000);
      load();
    } catch (e: any) { setErr(e.message); }
  }

  async function remove(h: Homework) {
    if (!confirm(`Delete homework "${h.title}"?`)) return;
    try { await api(`/homework/${h.id}`, { method: 'DELETE' }); load(); } catch (e: any) { setErr(e.message); }
  }

  const table = (
    <div className="card p-4 mt-6 overflow-x-auto">
      <h3 className="font-semibold text-brand-700 mb-3">{isStaff ? 'Assigned Homework' : 'My Homework'}</h3>
      <table className="table"><thead><tr>
        {isStaff && <th>Class</th>}<th>Subject</th><th>Title</th><th>Attachments</th><th>Due</th><th>Teacher</th><th>Posted</th>{isStaff && <th></th>}
      </tr></thead>
        <tbody>{rows.map(h => <tr key={h.id}>
          {isStaff && <td>{h.class_name} {h.class_section}</td>}<td>{h.subject}</td>
          <td><div className="font-medium">{h.title}</div><div className="text-xs text-gray-500 whitespace-pre-wrap">{h.description}</div></td>
          <td className="text-xs"><FileLinks value={h.attachments} names={h.attachment_names} /></td>
          <td>{h.due_date ? fmtDate(h.due_date) : '—'}</td><td>{h.teacher_name || '—'}</td><td>{fmtDate(h.assign_date)}</td>
          {isStaff && <td><button className="text-xs text-red-600 hover:underline" onClick={() => remove(h)}>Delete</button></td>}
        </tr>)}
          {!rows.length && <tr><td colSpan={8} className="text-center py-3 text-gray-500">No homework assigned.</td></tr>}
        </tbody></table>
    </div>
  );

  if (!isStaff) {
    return (
      <Shell>
        <div className="text-xs text-gray-500 mb-1">Dashboard › Academic Communication</div>
        <h2 className="text-xl font-bold text-brand-700 mb-4">Academic Communication</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {STUDENT_LINKS.map(l => (
            <Link key={l.href} href={l.href} className="card p-4 hover:bg-brand-50 border border-brand-100">
              <div className="text-xl mb-1">{l.icon}</div><div className="font-semibold text-brand-700 text-sm">{l.label}</div>
            </Link>
          ))}
        </div>
        {err && <div className="text-red-700 text-sm mt-4">{err}</div>}
        {table}
      </Shell>
    );
  }

  return (
    <Shell>
      <ExploreOptions
        icon="📚"
        title="Academic Communication"
        subtitle="Upload Content Menu — Explore Options"
        breadcrumb={['Dashboard', 'Academic Communication']}
        columns={2}
        groups={[
          { title: 'Classwork & Content', actions: [
            { label: 'Assign Homework', onClick: () => setAdding(true) },
            { label: 'School Diary', href: '/academic-comm/diary' },
            { label: 'Upload Lost and Found', href: '/academic-comm/lost-found' },
            { label: 'Online Classes', href: '/academic-comm/online-classes' },
            { label: 'Add Student Observation', href: '/academic-comm/observations' },
            { label: 'Add Student Creativity', href: '/academic-comm/creativity' },
            { label: 'Academic Communication Classwise', href: '/academic-comm/classwise' },
            { label: 'Academic Communication Class Section wise', href: '/academic-comm/sectionwise' },
            { label: 'Manage School News', href: '/academic-comm/news' },
            { label: 'Upload Circular', href: '/announcements' },
          ]},
          { title: 'Planning & Incidents', actions: [
            { label: 'Monthly Planner', href: '/academic-comm/planner' },
            { label: 'Upload Resources', href: '/academic-comm/resources' },
            { label: 'Upload Documents', href: '/documents' },
            { label: 'Create Time Table', href: '/timetable' },
            { label: 'View Time Table', href: '/timetable' },
            { label: 'Teacher Substitution', href: '/academic-comm/substitution' },
            { label: 'Manage Awards Categories', href: '/awards' },
            { label: 'Add Student Incident', href: '/incidents' },
            { label: 'Incident Dashboard', href: '/report/incident-summary' },
            { label: 'View Incident Report', href: '/report/incident-register' },
            { label: 'Reports', href: '/reports' },
          ]},
        ]}
      />

      {err && <div className="text-red-700 text-sm mt-4">{err}</div>}
      {ok && <div className="text-green-700 text-sm mt-4">{ok}</div>}

      {adding && (
        <form onSubmit={add} className="card p-4 mt-6 grid md:grid-cols-3 gap-3 text-sm">
          <div className="md:col-span-3 flex items-center justify-between">
            <h3 className="font-semibold text-brand-700">Assign Homework</h3>
            <button type="button" onClick={() => { setAdding(false); setFiles([]); }} className="text-xs text-gray-500 hover:underline">Cancel</button>
          </div>
          <div><label className="label">Class *</label>
            <select className="input" name="class_id" required>
              <option value="">-- Select --</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name} {c.section}</option>)}
            </select></div>
          <div><label className="label">Subject *</label>
            <select className="input" name="subject" required>
              <option value="">-- Select --</option>
              {subjects.map(s => <option key={s.id}>{s.name}</option>)}
            </select></div>
          <div><label className="label">Due Date</label><input className="input" type="date" name="due_date" /></div>
          <div className="md:col-span-3"><label className="label">Title *</label><input className="input" name="title" required /></div>
          <div className="md:col-span-3"><label className="label">Description</label><textarea className="input" rows={3} name="description" /></div>
          <div><label className="label">Teacher</label>
            <select className="input" name="teacher_id">
              <option value="">—</option>
              {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select></div>
          <div className="md:col-span-2">
            <FileUpload multiple label="Attachments (worksheets, photos)" onUploaded={up => setFiles(f => [...f, ...up.map(u => ({ url: u.url, name: u.name }))])} />
            {files.length > 0 && (
              <ul className="mt-1 text-xs">
                {files.map(f => <li key={f.url}>📎 {f.name} <button type="button" className="text-red-600 hover:underline ml-1" onClick={() => setFiles(x => x.filter(y => y.url !== f.url))}>remove</button></li>)}
              </ul>
            )}
          </div>
          <div className="md:col-span-3"><button className="btn btn-primary">Assign Homework</button></div>
        </form>
      )}

      {table}
    </Shell>
  );
}
