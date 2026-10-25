'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import ExploreOptions from '@/components/ExploreOptions';
import { api, getUser, localDate } from '@/lib/api';

type Row = { student_id: number; full_name: string; roll_no: number; class_id: number; status?: string | null };
type ClassRow = { id: number; name: string; section: string };

export default function AttendancePage() {
  const today = localDate();
  const [date, setDate] = useState(today);
  const [classId, setClassId] = useState<string>('');
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const user = getUser<any>();
  const canMark = user?.role === 'admin' || user?.role === 'teacher';

  useEffect(() => { api<ClassRow[]>('/classes').then(setClasses).catch(() => {}); }, []);

  async function load() {
    const qs = new URLSearchParams({ date, ...(classId ? { class_id: classId } : {}) });
    setRows(await api<Row[]>(`/attendance?${qs}`));
  }
  useEffect(() => { load().catch(() => {}); /* eslint-disable-next-line */ }, [date, classId]);

  function setStatus(studentId: number, status: string) {
    setRows(rows.map(r => r.student_id === studentId ? { ...r, status } : r));
  }

  async function save() {
    try {
      const records = rows.filter(r => r.status).map(r => ({ student_id: r.student_id, status: r.status }));
      await api('/attendance/bulk', { method: 'POST', body: JSON.stringify({ date, records }) });
      setMsg('Attendance saved.');
      setTimeout(() => setMsg(null), 2500);
    } catch (e: any) { setMsg(e.message); }
  }

  return (
    <Shell>
      <ExploreOptions
        icon="✓"
        title="Attendance"
        subtitle="Staff/Student Attendance — Explore Options"
        breadcrumb={['Dashboard', 'Attendance']}
        columns={3}
        groups={[
          { title: 'Student Attendance', actions: [
            { label: 'Manage Student Attendance', onClick: () => setMarking(true) },
            { label: 'Manage Student Leave Requests', href: '/leaves' },
            { label: 'Student Attendance Report', href: '/report/student-attendance' },
            { label: 'Gender Wise Student Details', href: '/report/gender-wise-students' },
          ]},
          { title: 'Staff Attendance', actions: [
            { label: 'Add Staff Attendance', href: '/hr/staff-attendance' },
            { label: 'Staff Attendance Report', href: '/report/staff-attendance' },
            { label: 'Biometric Attendance Report', href: '/report/biometric-attendance' },
            { label: 'Biometric Devices', href: '/hr/biometric-devices' },
            { label: 'Live Punches', href: '/hr/biometric-live' },
            { label: 'Map Biometric IDs', href: '/hr/biometric-mapping' },
            { label: 'Staff Leaves Report', href: '/report/staff-leaves' },
          ]},
          { title: 'Transport', actions: [
            { label: 'Bus Attendance Report', href: '/report/bus-attendance' },
            { label: 'Student Activate/Deactivate Report', href: '/report/student-status' },
          ]},
        ]}
      />

      {marking && (
        <>
          <div className="card p-4 mt-6 mb-4 grid md:grid-cols-4 gap-3">
            <div>
              <label className="label">Date</label>
              <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <label className="label">Class</label>
              <select className="input" value={classId} onChange={e => setClassId(e.target.value)}>
                <option value="">All Classes</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name} {c.section}</option>)}
              </select>
            </div>
            {canMark && <div className="flex items-end"><button className="btn btn-primary" onClick={save}>Save Attendance</button></div>}
            <div className="flex items-end justify-end">
              <button className="text-xs text-gray-500 hover:underline" onClick={() => setMarking(false)}>Close</button>
            </div>
          </div>

          {msg && <div className="text-sm bg-green-50 border border-green-200 text-green-700 rounded px-3 py-2 mb-3">{msg}</div>}

          <div className="card p-4">
            <table className="table">
              <thead><tr><th>Roll</th><th>Student</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.student_id}>
                    <td>{r.roll_no || '—'}</td>
                    <td>{r.full_name}</td>
                    <td>
                      {canMark ? (
                        <select className="input max-w-[10rem]" value={r.status || ''} onChange={e => setStatus(r.student_id, e.target.value)}>
                          <option value="">-- Mark --</option>
                          <option value="present">Present</option>
                          <option value="absent">Absent</option>
                          <option value="late">Late</option>
                          <option value="leave">Leave</option>
                        </select>
                      ) : (
                        <span className={`badge ${r.status === 'present' ? 'badge-green' : r.status === 'absent' ? 'badge-red' : 'badge-gray'}`}>
                          {r.status || 'Not marked'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={3} className="text-center py-4 text-gray-500">No students for this filter.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Shell>
  );
}
