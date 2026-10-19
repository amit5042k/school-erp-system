'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, fmtDate, fmtMoney } from '@/lib/api';
import { Notice, PageHead, StudentPicker, StudentRow, classLabel, useFlash } from '../_lib/shared';

type Tc = { id: number; tc_no: string; student_id: number; full_name: string; admission_no: string; issue_date: string; leaving_date: string; last_class: string; reason: string; status: string; cancel_reason?: string };
type Form = Record<string, any>;

export default function TcPage({ searchParams }: { searchParams: { student?: string } }) {
  const [list, setList] = useState<Tc[]>([]);
  const [studentId, setStudentId] = useState<number | ''>(Number(searchParams.student) || '');
  const [student, setStudent] = useState<StudentRow | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [due, setDue] = useState(0);
  const [busy, setBusy] = useState(false);
  const { msg, flash } = useFlash();

  const load = () => api<Tc[]>('/stu/tc').then(setList).catch(e => flash(e.message, false));
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  useEffect(() => {
    if (!studentId) { setForm(null); setStudent(null); return; }
    api<any>(`/stu/tc/prefill/${studentId}`).then(p => {
      setStudent(p.student);
      setDue(p.fees_due);
      setForm({
        tc_no: p.tc_no, application_date: '', issue_date: p.issue_date, leaving_date: p.leaving_date, last_class: p.last_class,
        qualified_for_promotion: 'Yes', dues_paid: p.dues_paid, working_days: p.working_days, days_present: p.days_present,
        conduct: 'Good', reason: '', nationality: 'Indian', remarks: '',
      });
    }).catch(e => flash(e.message, false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const existing = list.find(t => t.student_id === studentId && t.status === 'issued');
  const set = (k: string, v: any) => setForm(f => ({ ...(f || {}), [k]: v }));

  async function issue(e: React.FormEvent) {
    e.preventDefault();
    if (!form || !studentId) return;
    if (!confirm(`Issue TC ${form.tc_no} to ${student?.full_name}? The student will be marked as TC issued and their logins switched off.`)) return;
    setBusy(true);
    try {
      const r = await api<{ id: number; tc_no: string }>('/stu/tc', { method: 'POST', body: JSON.stringify({ ...form, student_id: studentId }) });
      flash(`TC ${r.tc_no} issued.`);
      setStudentId(''); load();
      window.open(`/students/tc/${r.id}`, '_blank');
    } catch (err: any) { flash(err.message, false); }
    finally { setBusy(false); }
  }

  async function cancel(t: Tc) {
    const reason = prompt(`Cancel TC ${t.tc_no}? The student will become active again. Reason:`);
    if (!reason) return;
    try { await api(`/stu/tc/${t.id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }); flash(`TC ${t.tc_no} cancelled.`); load(); }
    catch (err: any) { flash(err.message, false); }
  }

  const input = (k: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div><label className="label">{label}{props.required ? ' *' : ''}</label>
      <input className="input" value={form?.[k] ?? ''} onChange={e => set(k, e.target.value)} {...props} /></div>
  );
  const yesNo = (k: string, label: string) => (
    <div><label className="label">{label}</label>
      <select className="input" value={form?.[k] ?? ''} onChange={e => set(k, e.target.value)}>
        <option>Yes</option><option>No</option><option value="">Not applicable</option>
      </select></div>
  );

  return (
    <Shell>
      <PageHead crumb="Student › TC Issue" title="TC Issue" subtitle="Transfer Certificate">
        <Link href="/report/tc-issue" className="btn bg-gray-200 text-sm">TC Issue Report</Link>
      </PageHead>
      <Notice msg={msg} />

      <form onSubmit={issue} className="card p-4 mb-6 text-sm">
        <div className="grid md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <StudentPicker value={studentId} required onChange={id => setStudentId(id)}
              filter={s => (s.status || 'active') !== 'tc_issued' || s.id === studentId} />
          </div>
        </div>
        {existing && (
          <div className="mt-3 text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            TC {existing.tc_no} was already issued to this student. <Link className="underline" href={`/students/tc/${existing.id}`} target="_blank">Print it</Link>.
          </div>
        )}
        {form && student && !existing && (
          <>
            <div className="mt-3 mb-3 text-gray-600">
              <b>{student.full_name}</b> · {student.admission_no} · {classLabel(student)} · Father: {student.father_name || '—'}
              {due > 0 && <span className="ml-2 badge badge-red">Fees due {fmtMoney(due)}</span>}
            </div>
            <div className="grid md:grid-cols-4 gap-3">
              {input('tc_no', 'TC No', { required: true })}
              {input('application_date', 'Date of Application', { type: 'date' })}
              {input('leaving_date', 'Date of Leaving', { type: 'date', required: true })}
              {input('issue_date', 'Date of Issue', { type: 'date', required: true })}
              {input('last_class', 'Class Last Studied')}
              {yesNo('qualified_for_promotion', 'Qualified for Promotion')}
              {yesNo('dues_paid', 'All Dues Paid')}
              {input('nationality', 'Nationality')}
              {input('working_days', 'Total Working Days', { type: 'number', min: 0 })}
              {input('days_present', 'Days Present', { type: 'number', min: 0 })}
              <div><label className="label">General Conduct</label>
                <select className="input" value={form.conduct} onChange={e => set('conduct', e.target.value)}>
                  {['Excellent', 'Very Good', 'Good', 'Satisfactory'].map(c => <option key={c}>{c}</option>)}
                </select></div>
              <div className="md:col-span-4">{input('reason', 'Reason for Leaving', { required: true, placeholder: "e.g. Parents' transfer" })}</div>
              <div className="md:col-span-4">{input('remarks', 'Remarks')}</div>
            </div>
            <button className="btn btn-primary mt-4" disabled={busy}>{busy ? 'Issuing…' : 'Issue TC & Print'}</button>
          </>
        )}
      </form>

      <div className="card p-4 overflow-x-auto">
        <h3 className="font-semibold text-brand-700 mb-3">Issued Certificates</h3>
        <table className="table">
          <thead><tr><th>TC No</th><th>Issued</th><th>Adm No</th><th>Student</th><th>Class</th><th>Reason</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {list.map(t => (
              <tr key={t.id} className={t.status === 'cancelled' ? 'opacity-60' : ''}>
                <td className="whitespace-nowrap">{t.tc_no}</td><td>{fmtDate(t.issue_date)}</td><td>{t.admission_no}</td>
                <td>{t.full_name}</td><td>{t.last_class}</td><td>{t.reason}</td>
                <td><span className={`badge ${t.status === 'issued' ? 'badge-green' : 'badge-gray'}`} title={t.cancel_reason || ''}>{t.status}</span></td>
                <td className="text-xs whitespace-nowrap">
                  <Link className="text-brand-600 hover:underline mr-2" href={`/students/tc/${t.id}`} target="_blank">Print</Link>
                  {t.status === 'issued' && <button className="text-red-600 hover:underline" onClick={() => cancel(t)}>Cancel</button>}
                </td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={8} className="text-center text-gray-500 py-4">No TCs issued yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
