'use client';

import { useEffect, useMemo, useState } from 'react';
import Shell from '@/components/Shell';
import ExploreOptions from '@/components/ExploreOptions';
import FileUpload from '@/components/FileUpload';
import { api, fileUrl, getUser } from '@/lib/api';
import { Flash, useFlash, useMasterNames } from '../hr/_ui';

type Teacher = {
  id: number; employee_no: string; full_name: string; subject?: string | null; qualification?: string | null;
  phone?: string | null; email?: string | null; department?: string | null; designation?: string | null;
  staff_category?: string | null; status?: string | null; photo_url?: string | null; [k: string]: any;
};

const EMPTY: Record<string, string> = {
  employee_no: '', full_name: '', gender: '', dob: '', blood_group: '', aadhaar_no: '',
  designation: '', department: '', staff_category: '', subject: '', qualification: '', joining_date: '', status: 'active',
  phone: '', email: '', official_email: '', address: '', bank_name: '', bank_account: '', ifsc: '', pan_no: '', uan_no: '', esi_no: '', photo_url: '',
};
type LoginResult = { name?: string; created?: { username: string; password: string; role_key: string }; renamed?: string; skipped?: string; exists?: string };
const BLOOD = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export default function TeachersPage() {
  const [rows, setRows] = useState<Teacher[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [listing, setListing] = useState(false);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [form, setForm] = useState<Record<string, string>>(EMPTY);
  const { msg, flash } = useFlash();
  // The login made (or renamed) when an employee is saved: shown once so the office can hand over the password.
  const [login, setLogin] = useState<LoginResult | null>(null);
  const isAdmin = getUser<any>()?.role === 'admin';
  const designations = useMasterNames('designations');
  const departments = useMasterNames('departments');
  const categories = useMasterNames('staff-categories');
  const subjects = useMasterNames('subjects');

  async function load() { try { setRows(await api<Teacher[]>('/teachers')); } catch (e: any) { setError(e.message); } }
  useEffect(() => { load(); }, []);

  function startAdd() { setForm(EMPTY); setEditing('new'); setListing(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function startEdit(t: Teacher) {
    const f: Record<string, string> = {};
    for (const k of Object.keys(EMPTY)) f[k] = t[k] == null ? '' : String(t[k]);
    if (!f.status) f.status = 'active';
    setForm(f); setEditing(t.id); window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (editing === 'new') {
        const r = await api<{ login?: LoginResult }>('/hr/employees', { method: 'POST', body: JSON.stringify(form) });
        setLogin(r.login ? { ...r.login, name: form.full_name } : null);
        flash(`${form.full_name} added.`);
      } else {
        const r = await api<{ logins_disabled: number; login?: LoginResult }>(`/hr/employees/${editing}`, { method: 'PUT', body: JSON.stringify(form) });
        setLogin(r.login && (r.login.created || r.login.renamed) ? { ...r.login, name: form.full_name } : null);
        flash(r.logins_disabled ? `Saved. Their login has been disabled because they have left.` : 'Employee saved.');
      }
      setEditing(null); load();
    } catch (e: any) { setError(e.message); }
  }

  const shown = useMemo(() => rows.filter(t =>
    (!statusFilter || (t.status || 'active') === statusFilter)
    && (!q || `${t.employee_no} ${t.full_name} ${t.designation || ''} ${t.department || ''} ${t.phone || ''}`.toLowerCase().includes(q.toLowerCase()))
  ), [rows, q, statusFilter]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });
  const text = (k: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div><label className="label">{label}</label><input className="input" value={form[k]} onChange={set(k)} {...props} /></div>
  );
  const pick = (k: string, label: string, options: string[], props: { required?: boolean } = {}) => (
    <div><label className="label">{label}{props.required ? ' *' : ''}</label>
      <select className="input" value={form[k]} onChange={set(k)} required={props.required}>
        <option value="">-- Select --</option>
        {form[k] && !options.includes(form[k]) && <option value={form[k]}>{form[k]}</option>}
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select></div>
  );

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
            { label: 'Add Employee', onClick: () => (isAdmin ? startAdd() : flash('Only an admin can add employees.', false)) },
            { label: 'Manage Employees', onClick: () => setListing(true) },
            { label: 'Employee Quick Updates', href: '/hr/quick-updates' },
            { label: 'Add Staff Category', href: '/masters/staff-categories' },
            { label: 'Manage Department', href: '/masters/departments' },
            { label: 'Manage Designation', href: '/masters/designations' },
            { label: 'Profile Categories', href: '/masters/profile-categories' },
            { label: 'Add User Login', href: '/users' },
            { label: 'Send Usernames and Password', href: '/send-credentials?role=teacher' },
          ]},
          { title: 'Attendance & Reports', actions: [
            { label: 'Add Staff Attendance', href: '/hr/staff-attendance' },
            { label: 'Staff Attendance Report', href: '/report/staff-attendance' },
            { label: 'Biometric Devices', href: '/hr/biometric-devices' },
            { label: 'Live Punches', href: '/hr/biometric-live' },
            { label: 'Map Biometric IDs', href: '/hr/biometric-mapping' },
            { label: 'Import Biometric Punches', href: '/hr/biometric-import' },
            { label: 'Biometric Attendance Report', href: '/report/biometric-attendance' },
            { label: 'Biometric Attendance Report 2', href: '/report/biometric-attendance-2' },
            { label: 'Staff Activity Log', href: '/report/staff-activity-log' },
            { label: 'App Download Statistics', href: '/report/app-usage' },
            { label: 'Bus Attendance Report', href: '/report/bus-attendance' },
            { label: 'Student Activate/Deactivate Report', href: '/report/student-status' },
            { label: 'Notebook Checking Entry', href: '/hr/notebook-checks' },
            { label: 'TeacherWise Notebook Report', href: '/report/notebook-teacherwise' },
            { label: 'SubjectWise Class Notebook Report', href: '/report/notebook-subjectwise' },
          ]},
          { title: 'Leaves', actions: [
            { label: 'Manage Teacher Leave Request', href: '/leaves' },
            { label: 'Manage Department Leaves', href: '/hr/department-leaves' },
            { label: 'Manage Leave Types', href: '/masters/leave-types' },
            { label: 'Manage Extra Leaves', href: '/hr/extra-leaves' },
            { label: 'View Staff Leaves', href: '/leaves' },
            { label: 'Staff Leaves Report', href: '/report/staff-leaves' },
            { label: 'Month Wise Leave Count', href: '/report/month-wise-leave-count' },
            { label: 'Staff Leave Applied Status', href: '/report/leave-applied-status' },
            { label: 'Staff Leave Applied Status New', href: '/report/leave-applied-status-new' },
            { label: 'Add Attendance Rule', href: '/hr/attendance-rules' },
          ]},
          { title: 'Payroll & Awards', actions: [
            { label: 'Payroll Categories', href: '/payroll' },
            { label: 'Pay Scale', href: '/payroll' },
            { label: 'Salary Quick Update', href: '/payroll' },
            { label: 'Manage Awards List', href: '/awards' },
            { label: 'Manage Teacher Post', href: '/hr/teacher-posts' },
            { label: 'Online Teacher Application Report', href: '/hr/applications' },
            { label: 'Studentwise Announcement', href: '/announcements' },
            { label: 'Manage Studentwise Announcement', href: '/announcements' },
            { label: 'Send Image Upload Link', href: '/hr/photo-links' },
          ]},
        ]}
      />

      <div className="mt-4"><Flash msg={msg} /></div>
      {login && (login.created ? (
        <div className="card p-3 mt-3 text-sm border-green-200 bg-green-50 max-w-xl">
          <div className="font-semibold text-green-800 mb-1">Login created for {login.name}</div>
          <div>Username: <span className="font-mono">{login.created.username}</span></div>
          <div>Temporary password: <span className="font-mono">{login.created.password}</span></div>
          <div className="text-xs text-gray-600 mt-1">Shown only once. They must choose a new password at first sign-in. Role: {login.created.role_key === 'teacher' ? 'Teacher' : 'Non-Teaching Staff'} (change it in Users &amp; Roles).</div>
          <button className="text-xs text-brand-600 underline mt-1" onClick={() => setLogin(null)}>Done</button>
        </div>
      ) : login.renamed ? (
        <div className="card p-3 mt-3 text-sm bg-brand-50 max-w-xl">Their login username is now <span className="font-mono">{login.renamed}</span> (the new official email). <button className="text-xs underline ml-2" onClick={() => setLogin(null)}>OK</button></div>
      ) : login.skipped ? (
        <div className="card p-3 mt-3 text-sm bg-amber-50 border-amber-200 max-w-xl">No login yet for {login.name}: {login.skipped}. <button className="text-xs underline ml-2" onClick={() => setLogin(null)}>OK</button></div>
      ) : null)}
      {error && <div className="text-red-700 text-sm mt-4">{error}</div>}

      {editing !== null && (
        <form onSubmit={save} className="card p-4 mt-6 mb-4 text-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-brand-700">{editing === 'new' ? 'Add Employee' : `Edit Employee — ${form.full_name}`}</h3>
            <button type="button" className="text-xs text-gray-500 hover:underline" onClick={() => setEditing(null)}>Cancel</button>
          </div>

          <div className="grid md:grid-cols-4 gap-4">
            <div className="md:row-span-3 flex flex-col items-center gap-2">
              <div className="w-28 h-32 rounded border bg-gray-50 overflow-hidden grid place-items-center text-gray-400 text-xs">
                {form.photo_url ? <img src={fileUrl(form.photo_url)} alt="Employee photo" className="w-full h-full object-cover" /> : 'No photo'}
              </div>
              <FileUpload label="Photo" accept=".jpg,.jpeg,.png,.webp" onUploaded={f => setForm(x => ({ ...x, photo_url: f[0].url }))} />
              {form.photo_url && <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => setForm({ ...form, photo_url: '' })}>Remove photo</button>}
            </div>
            <div className="md:col-span-3">
              <div className="text-xs font-semibold uppercase text-gray-500 mb-2">Personal</div>
              <div className="grid md:grid-cols-3 gap-3">
                {text('employee_no', 'Employee No *', { required: true })}
                {text('full_name', 'Full Name *', { required: true })}
                <div><label className="label">Gender</label>
                  <select className="input" value={form.gender} onChange={set('gender')}>
                    <option value="">--</option><option value="M">Male</option><option value="F">Female</option><option value="O">Other</option>
                  </select></div>
                {text('dob', 'Date of Birth', { type: 'date' })}
                {pick('blood_group', 'Blood Group', BLOOD)}
                {text('aadhaar_no', 'Aadhaar No', { inputMode: 'numeric', maxLength: 14 })}
              </div>
            </div>
            <div className="md:col-span-3">
              <div className="text-xs font-semibold uppercase text-gray-500 mb-2">Job</div>
              <div className="grid md:grid-cols-3 gap-3">
                {pick('designation', 'Designation', designations)}
                {pick('department', 'Department', departments)}
                {pick('staff_category', 'Staff Category', categories)}
                {pick('subject', 'Subject', subjects)}
                {text('qualification', 'Qualification')}
                {text('joining_date', 'Joining Date', { type: 'date' })}
                <div><label className="label">Status</label>
                  <select className="input" value={form.status} onChange={set('status')}>
                    <option value="active">Active</option><option value="inactive">Inactive</option><option value="left">Left</option>
                  </select>
                  {form.status === 'left' && <div className="text-[11px] text-amber-700 mt-1">Their login will be disabled.</div>}
                </div>
              </div>
            </div>
            <div className="md:col-span-3">
              <div className="text-xs font-semibold uppercase text-gray-500 mb-2">Contact</div>
              <div className="grid md:grid-cols-3 gap-3">
                {text('phone', 'Phone', { inputMode: 'tel' })}
                <div>
                  <label className="label">Official Email</label>
                  <input className="input" type="email" value={form.official_email} onChange={set('official_email')} placeholder="name@yourschool.in" />
                  <div className="text-[11px] text-gray-500 mt-1">School-issued address. It becomes their login username; leave blank to add them without a login for now.</div>
                </div>
                {text('email', 'Personal Email', { type: 'email' })}
                <div className="md:col-span-1"><label className="label">Address</label><textarea className="input" rows={1} value={form.address} onChange={set('address')} /></div>
              </div>
            </div>
            <div className="md:col-span-4">
              <div className="text-xs font-semibold uppercase text-gray-500 mb-2">Bank &amp; Statutory</div>
              <div className="grid md:grid-cols-6 gap-3">
                {text('bank_name', 'Bank Name')}
                {text('bank_account', 'Account No')}
                {text('ifsc', 'IFSC', { placeholder: 'SBIN0001234' })}
                {text('pan_no', 'PAN', { placeholder: 'ABCDE1234F' })}
                {text('uan_no', 'UAN (PF)')}
                {text('esi_no', 'ESI No')}
              </div>
            </div>
          </div>
          <div className="mt-4"><button className="btn btn-primary">{editing === 'new' ? 'Save Employee' : 'Save Changes'}</button></div>
        </form>
      )}

      {listing && (
        <div className="card p-4 mt-6 overflow-x-auto">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h3 className="font-semibold text-brand-700">Manage Employees</h3>
            <div className="flex flex-wrap gap-2 items-center">
              <input className="input max-w-[14rem]" placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} />
              <select className="input max-w-[9rem]" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="active">Active</option><option value="inactive">Inactive</option><option value="left">Left</option><option value="">All</option>
              </select>
              <button className="text-xs text-gray-500 hover:underline" onClick={() => setListing(false)}>Close</button>
            </div>
          </div>
          <table className="table">
            <thead><tr><th></th><th>Emp No</th><th>Name</th><th>Designation</th><th>Department</th><th>Subject</th><th>Phone</th><th>Status</th>{isAdmin && <th></th>}</tr></thead>
            <tbody>
              {shown.map(t => (
                <tr key={t.id}>
                  <td>{t.photo_url
                    ? <img src={fileUrl(t.photo_url)} alt="" className="w-8 h-8 rounded-full object-cover" />
                    : <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 grid place-items-center text-xs font-bold">{t.full_name.split(' ').map(w => w[0]).slice(0, 2).join('')}</div>}</td>
                  <td>{t.employee_no}</td><td>{t.full_name}</td><td>{t.designation || '—'}</td><td>{t.department || '—'}</td>
                  <td>{t.subject || '—'}</td><td>{t.phone || '—'}</td>
                  <td><span className={`badge ${(t.status || 'active') === 'active' ? 'badge-green' : t.status === 'left' ? 'badge-red' : 'badge-gray'}`}>{t.status || 'active'}</span></td>
                  {isAdmin && <td><button className="text-xs text-brand-600 hover:underline" onClick={() => startEdit(t)}>Edit</button></td>}
                </tr>
              ))}
              {!shown.length && <tr><td colSpan={9} className="text-center text-gray-500 py-4">No employees found.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
