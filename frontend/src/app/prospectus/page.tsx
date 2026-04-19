'use client';

import { useEffect, useMemo, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';

type ClassRow = { id: number; name: string; section: string };
type Registration = {
  id: number;
  prospectus_no: string;
  session: string;
  date: string;
  class_id?: number;
  class_name?: string;
  first_name: string;
  last_name: string;
  father_name: string;
  mother_name: string;
  phone: string;
  alt_number: string;
  email: string;
  gender: 'M' | 'F' | 'O';
  dob: string;
  last_school: string;
  prev_marks: string;
  prospectus_char: string;
  prospectus_amount: number;
  payment_mode: string;
  bank_charges: number;
  total_amount: number;
  address: string;
  remarks: string;
};

const CLASS_GROUPS = [
  'NURSERY', 'LKG', 'UKG',
  'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII',
  'IX', 'X', 'XI MEDICAL', 'XI NON-MEDICAL', 'XI COMMERCE', 'XI HUMANITIES',
  'XII MEDICAL', 'XII NON-MEDICAL', 'XII COMMERCE', 'XII HUMANITIES',
];

function nextNumber(prev: string): string {
  const m = prev.match(/^(.+)\/(\d+)$/);
  if (!m) return prev;
  return `${m[1]}/${String(Number(m[2]) + 1).padStart(3, '0')}`;
}

export default function ProspectusPage() {
  const [prospectusNo, setProspectusNo] = useState('UE/26-27/207');
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [rows, setRows] = useState<Registration[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  const [form, setForm] = useState<Omit<Registration, 'id' | 'prospectus_no' | 'class_name'>>({
    session: '2026-2027', date: today, class_id: undefined, first_name: '', last_name: '',
    father_name: '', mother_name: '', phone: '', alt_number: '', email: '', gender: 'M',
    dob: '', last_school: '', prev_marks: '', prospectus_char: '', prospectus_amount: 0,
    payment_mode: 'Cash', bank_charges: 0, total_amount: 0, address: '', remarks: '',
  });

  useEffect(() => { api<ClassRow[]>('/classes').then(setClasses).catch(() => {}); }, []);

  function flash(m: string) { setMsg(m); setTimeout(() => setMsg(null), 2500); }

  function save(e: React.FormEvent) {
    e.preventDefault();
    const cls = classes.find(c => c.id === form.class_id);
    const total = Number(form.prospectus_amount || 0) + Number(form.bank_charges || 0);
    setRows(x => [{
      id: Date.now(),
      prospectus_no: prospectusNo,
      class_name: cls ? `${cls.name} ${cls.section}` : undefined,
      ...form,
      total_amount: total,
    }, ...x]);
    setProspectusNo(nextNumber(prospectusNo));
    setForm({ ...form, first_name: '', last_name: '', father_name: '', mother_name: '', phone: '', alt_number: '', email: '', dob: '', last_school: '', prev_marks: '', prospectus_char: '', prospectus_amount: 0, bank_charges: 0, total_amount: 0, address: '', remarks: '' });
    flash('Registration saved.');
  }

  const summary = useMemo(() => {
    return CLASS_GROUPS.map(name => {
      const matching = rows.filter(r => (r.class_name || '').toUpperCase().startsWith(name));
      const boys = matching.filter(r => r.gender === 'M').length;
      const girls = matching.filter(r => r.gender === 'F').length;
      return { name, boys, girls, total: boys + girls };
    });
  }, [rows]);

  return (
    <Shell>
      <div className="text-xs text-gray-500 mb-1">Dashboard › Student Prospectus</div>
      <div className="flex items-baseline gap-3 mb-4">
        <span className="text-brand-600 text-2xl leading-none">👤</span>
        <h2 className="text-xl font-bold text-brand-700">Student Prospectus</h2>
        <span className="text-sm text-gray-500">New Registration</span>
      </div>

      {msg && <div className="text-sm bg-green-50 border border-green-200 text-green-700 rounded px-3 py-2 mb-3">{msg}</div>}

      <div className="grid lg:grid-cols-3 gap-4">
        <form onSubmit={save} className="card p-4 lg:col-span-2 grid md:grid-cols-3 gap-3 text-sm">
          <h3 className="md:col-span-3 font-semibold text-brand-700">New Registration</h3>
          <div><label className="label">Prospectus No</label><input className="input" readOnly value={prospectusNo} /></div>
          <div><label className="label">Session</label><input className="input" value={form.session} onChange={e => setForm({ ...form, session: e.target.value })} /></div>
          <div><label className="label">Date</label><input className="input" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
          <div><label className="label">Class</label>
            <select className="input" value={form.class_id ?? ''} onChange={e => setForm({ ...form, class_id: e.target.value ? Number(e.target.value) : undefined })}>
              <option value="">-- Select --</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name} {c.section}</option>)}
            </select></div>
          <div><label className="label">First Name *</label><input className="input" required value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} /></div>
          <div><label className="label">Last Name</label><input className="input" value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} /></div>
          <div><label className="label">Father's Name</label><input className="input" value={form.father_name} onChange={e => setForm({ ...form, father_name: e.target.value })} /></div>
          <div><label className="label">Mother's Name</label><input className="input" value={form.mother_name} onChange={e => setForm({ ...form, mother_name: e.target.value })} /></div>
          <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
          <div><label className="label">Alt Number</label><input className="input" value={form.alt_number} onChange={e => setForm({ ...form, alt_number: e.target.value })} /></div>
          <div><label className="label">Email</label><input className="input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
          <div><label className="label">Gender</label>
            <select className="input" value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value as any })}>
              <option value="M">Male</option><option value="F">Female</option><option value="O">Other</option>
            </select></div>
          <div><label className="label">DOB</label><input className="input" type="date" value={form.dob} onChange={e => setForm({ ...form, dob: e.target.value })} /></div>
          <div><label className="label">Last School</label><input className="input" value={form.last_school} onChange={e => setForm({ ...form, last_school: e.target.value })} /></div>
          <div><label className="label">Previous Marks</label><input className="input" value={form.prev_marks} onChange={e => setForm({ ...form, prev_marks: e.target.value })} /></div>
          <div><label className="label">Prospectus Char</label><input className="input" value={form.prospectus_char} onChange={e => setForm({ ...form, prospectus_char: e.target.value })} /></div>
          <div><label className="label">Prospectus Amount</label><input className="input" type="number" value={form.prospectus_amount} onChange={e => setForm({ ...form, prospectus_amount: Number(e.target.value) })} /></div>
          <div><label className="label">Payment Mode</label>
            <select className="input" value={form.payment_mode} onChange={e => setForm({ ...form, payment_mode: e.target.value })}>
              <option>Cash</option><option>Cheque</option><option>Online</option><option>Card</option>
            </select></div>
          <div><label className="label">Bank Charges</label><input className="input" type="number" value={form.bank_charges} onChange={e => setForm({ ...form, bank_charges: Number(e.target.value) })} /></div>
          <div><label className="label">Total Amount</label><input className="input" readOnly value={Number(form.prospectus_amount || 0) + Number(form.bank_charges || 0)} /></div>
          <div className="md:col-span-3"><label className="label">Address</label><textarea className="input" rows={2} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
          <div className="md:col-span-3"><label className="label">Remarks</label><textarea className="input" rows={2} value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} /></div>
          <div className="md:col-span-3"><button className="btn btn-primary">Save</button></div>
        </form>

        <div className="card p-4 overflow-y-auto max-h-[40rem]">
          <h3 className="font-semibold text-brand-700 mb-3">Class-wise Prospectus Summary</h3>
          <table className="table text-xs">
            <thead><tr><th>Class</th><th>Boys</th><th>Girls</th><th>Total</th></tr></thead>
            <tbody>
              {summary.map(s => (
                <tr key={s.name}><td>{s.name}</td><td>{s.boys}</td><td>{s.girls}</td><td>{s.total}</td></tr>
              ))}
              <tr className="font-semibold bg-brand-50">
                <td>Total</td>
                <td>{summary.reduce((n, s) => n + s.boys, 0)}</td>
                <td>{summary.reduce((n, s) => n + s.girls, 0)}</td>
                <td>{summary.reduce((n, s) => n + s.total, 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="card p-4 mt-6 overflow-x-auto">
          <h3 className="font-semibold text-brand-700 mb-3">Recent Registrations</h3>
          <table className="table">
            <thead><tr><th>Prospectus No</th><th>Date</th><th>Name</th><th>Class</th><th>Father</th><th>Phone</th><th>Amount</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td>{r.prospectus_no}</td><td>{r.date}</td>
                  <td>{r.first_name} {r.last_name}</td>
                  <td>{r.class_name || '—'}</td>
                  <td>{r.father_name}</td><td>{r.phone}</td>
                  <td>₹{r.total_amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
