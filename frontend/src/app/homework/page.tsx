'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import ExploreOptions from '@/components/ExploreOptions';
import { api } from '@/lib/api';

export default function HomeworkPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  async function load() {
    try {
      setRows(await api('/homework'));
      setClasses(await api('/classes'));
      setTeachers(await api('/teachers'));
    } catch (e: any) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const f = e.target as any;
    try {
      await api('/homework', { method: 'POST', body: JSON.stringify({
        class_id: Number(f.class_id.value), subject: f.subject.value,
        title: f.title.value, description: f.description.value,
        due_date: f.due_date.value || null, teacher_id: f.teacher_id.value ? Number(f.teacher_id.value) : null,
      }) });
      f.reset();
      setAdding(false);
      load();
    } catch (e: any) { setErr(e.message); }
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
            { label: 'School Diary' },
            { label: 'Upload Lost and Found' },
            { label: 'Online Classes' },
            { label: 'Add Student Observation' },
            { label: 'Add Student Creativity' },
            { label: 'Academic Communication Classwise' },
            { label: 'Academic Communication Class Section wise' },
            { label: 'Manage School News' },
            { label: 'Upload Circular', href: '/announcements' },
          ]},
          { title: 'Planning & Incidents', actions: [
            { label: 'Monthly Planner' },
            { label: 'Upload Resources' },
            { label: 'Upload Documents', href: '/documents' },
            { label: 'Create Time Table', href: '/timetable' },
            { label: 'View Time Table', href: '/timetable' },
            { label: 'Teacher Substitution' },
            { label: 'Manage Awards Categories', href: '/awards' },
            { label: 'Add Student Incident', href: '/incidents' },
            { label: 'Incident Dashboard', href: '/incidents' },
            { label: 'View Incident Report', href: '/incidents' },
            { label: 'Reports', href: '/reports' },
          ]},
        ]}
      />

      {err && <div className="text-red-700 text-sm mt-4">{err}</div>}

      {adding && (
        <form onSubmit={add} className="card p-4 mt-6 grid md:grid-cols-3 gap-3 text-sm">
          <div className="md:col-span-3 flex items-center justify-between">
            <h3 className="font-semibold text-brand-700">Assign Homework</h3>
            <button type="button" onClick={() => setAdding(false)} className="text-xs text-gray-500 hover:underline">Cancel</button>
          </div>
          <div><label className="label">Class</label>
            <select className="input" name="class_id" required>
              <option value="">-- Select --</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name} {c.section}</option>)}
            </select></div>
          <div><label className="label">Subject</label><input className="input" name="subject" required /></div>
          <div><label className="label">Due Date</label><input className="input" type="date" name="due_date" /></div>
          <div className="md:col-span-3"><label className="label">Title</label><input className="input" name="title" required /></div>
          <div className="md:col-span-3"><label className="label">Description</label><textarea className="input" rows={3} name="description" /></div>
          <div><label className="label">Teacher</label>
            <select className="input" name="teacher_id">
              <option value="">—</option>
              {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select></div>
          <div className="md:col-span-3"><button className="btn btn-primary">Assign Homework</button></div>
        </form>
      )}

      <div className="card p-4 mt-6 overflow-x-auto">
        <h3 className="font-semibold text-brand-700 mb-3">Assigned Homework</h3>
        <table className="table"><thead><tr><th>Class</th><th>Subject</th><th>Title</th><th>Due</th><th>Teacher</th><th>Posted</th></tr></thead>
          <tbody>{rows.map(h => <tr key={h.id}><td>{h.class_name} {h.class_section}</td><td>{h.subject}</td>
            <td><div className="font-medium">{h.title}</div><div className="text-xs text-gray-500">{h.description}</div></td>
            <td>{h.due_date || '—'}</td><td>{h.teacher_name}</td><td>{new Date(h.assign_date).toLocaleDateString()}</td></tr>)}
            {!rows.length && <tr><td colSpan={6} className="text-center py-3 text-gray-500">No homework assigned.</td></tr>}
          </tbody></table>
      </div>
    </Shell>
  );
}
