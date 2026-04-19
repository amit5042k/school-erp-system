'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import ExploreOptions from '@/components/ExploreOptions';
import { api, getUser } from '@/lib/api';

type Teacher = { id: number; employee_no: string; full_name: string; subject: string; qualification: string; phone: string; email: string };

export default function TeachersPage() {
  const [rows, setRows] = useState<Teacher[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [listing, setListing] = useState(false);
  const user = getUser<any>();
  const isAdmin = user?.role === 'admin';
  const [form, setForm] = useState({ employee_no: '', full_name: '', subject: '', qualification: '', phone: '', email: '' });

  async function load() { try { setRows(await api<Teacher[]>('/teachers')); } catch (e: any) { setError(e.message); } }
  useEffect(() => { load(); }, []);

  async function addTeacher(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api('/teachers', { method: 'POST', body: JSON.stringify(form) });
      setAdding(false);
      setForm({ employee_no: '', full_name: '', subject: '', qualification: '', phone: '', email: '' });
      load();
    } catch (e: any) { setError(e.message); }
  }

  return (
    <Shell>
      <ExploreOptions
        icon="👥"
        title="Human Resource"
        subtitle="Staff, Payroll & Leaves — Explore Options"
        breadcrumb={['Dashboard', 'Human Resource']}
        columns={3}
        groups={[
          { title: 'Employees', actions: [
            { label: 'Add Employee', onClick: () => { if (!isAdmin) return; setAdding(true); setListing(true); } },
            { label: 'Manage Employees', onClick: () => setListing(true) },
            { label: 'Employee Quick Updates' },
            { label: 'Add Staff Category' },
            { label: 'Manage Department' },
            { label: 'Manage Designation' },
            { label: 'Profile Categories' },
            { label: 'Add User Login', href: '/users' },
            { label: 'Send Usernames and Password' },
          ]},
          { title: 'Attendance & Reports', actions: [
            { label: 'Add Staff Attendance', href: '/attendance' },
            { label: 'Staff Attendance Report' },
            { label: 'Biometric Attendance Report' },
            { label: 'Biometric Attendance Report 2' },
            { label: 'Staff Activity Log' },
            { label: 'App Download Statistics' },
            { label: 'Bus Attendance Report', href: '/transport' },
            { label: 'Student Activate/Deactivate Report' },
            { label: 'TeacherWise Notebook Report' },
            { label: 'SubjectWise Class Notebook Report' },
          ]},
          { title: 'Leaves', actions: [
            { label: 'Manage Teacher Leave Request', href: '/leaves' },
            { label: 'Manage Department Leaves' },
            { label: 'Manage Leave Types' },
            { label: 'Manage Extra Leaves' },
            { label: 'View Staff Leaves' },
            { label: 'Staff Leaves Report' },
            { label: 'Month Wise Leave Count' },
            { label: 'Staff Leave Applied Status' },
            { label: 'Staff Leave Applied Status New' },
            { label: 'Add Attendance Rule' },
          ]},
          { title: 'Payroll & Awards', actions: [
            { label: 'Payroll Categories', href: '/payroll' },
            { label: 'Pay Scale', href: '/payroll' },
            { label: 'Salary Quick Update', href: '/payroll' },
            { label: 'Manage Awards List', href: '/awards' },
            { label: 'Manage Teacher Post' },
            { label: 'Online Teacher Application Report' },
            { label: 'Studentwise Announcement', href: '/announcements' },
            { label: 'Manage Studentwise Announcement', href: '/announcements' },
            { label: 'Send Image Upload Link' },
          ]},
        ]}
      />

      {adding && (
        <form onSubmit={addTeacher} className="card p-4 mt-6 mb-4 grid md:grid-cols-3 gap-3 text-sm">
          <div className="md:col-span-3 flex items-center justify-between">
            <h3 className="font-semibold text-brand-700">Add Employee</h3>
            <button type="button" className="text-xs text-gray-500 hover:underline" onClick={() => setAdding(false)}>Cancel</button>
          </div>
          <div><label className="label">Employee No</label><input className="input" required value={form.employee_no} onChange={e => setForm({ ...form, employee_no: e.target.value })} /></div>
          <div><label className="label">Full Name</label><input className="input" required value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} /></div>
          <div><label className="label">Subject</label><input className="input" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} /></div>
          <div><label className="label">Qualification</label><input className="input" value={form.qualification} onChange={e => setForm({ ...form, qualification: e.target.value })} /></div>
          <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
          <div><label className="label">Email</label><input className="input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
          <div className="md:col-span-3"><button className="btn btn-primary">Save Employee</button></div>
        </form>
      )}

      {listing && (
        <div className="card p-4 mt-6 overflow-x-auto">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-brand-700">Manage Employees</h3>
            <button className="text-xs text-gray-500 hover:underline" onClick={() => setListing(false)}>Close</button>
          </div>
          {error && <div className="text-red-700 text-sm mb-2">{error}</div>}
          <table className="table">
            <thead><tr><th>Emp No</th><th>Name</th><th>Subject</th><th>Qualification</th><th>Phone</th><th>Email</th></tr></thead>
            <tbody>
              {rows.map(t => (
                <tr key={t.id}>
                  <td>{t.employee_no}</td><td>{t.full_name}</td><td>{t.subject}</td>
                  <td>{t.qualification}</td><td>{t.phone}</td><td>{t.email}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={6} className="text-center text-gray-500 py-4">No employees found.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
