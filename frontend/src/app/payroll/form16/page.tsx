'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import FileUpload, { FileLinks } from '@/components/FileUpload';
import { api, fmtDate, getUser } from '@/lib/api';

type Fy = { current: string; options: string[] };

export default function Form16Page({ searchParams }: { searchParams: { upload?: string } }) {
  const isAdmin = getUser<any>()?.role === 'admin';
  const [rows, setRows] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [fy, setFy] = useState<Fy>({ current: '', options: [] });
  const [filterFy, setFilterFy] = useState('');
  const [form, setForm] = useState({ teacher_id: '', financial_year: '', file_url: '', file_name: '', remarks: '' });
  const [showUpload, setShowUpload] = useState(!!searchParams.upload);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () => api<any[]>(`/pay/form16${filterFy ? `?financial_year=${filterFy}` : ''}`).then(setRows).catch(e => setMsg({ ok: false, text: e.message }));
  useEffect(() => {
    api<Fy>('/pay/financial-years').then(f => { setFy(f); setForm(x => ({ ...x, financial_year: f.options[1] || f.current })); }).catch(() => {});
    if (isAdmin) api<any[]>('/teachers').then(setTeachers).catch(() => {});
  }, [isAdmin]);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filterFy]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.file_url) return setMsg({ ok: false, text: 'Choose the Form 16 file first.' });
    try {
      await api('/pay/form16', { method: 'POST', body: JSON.stringify({ ...form, teacher_id: Number(form.teacher_id) }) });
      setMsg({ ok: true, text: 'Form 16 saved. The staff member can now download it from My Payslips.' });
      setForm(x => ({ ...x, teacher_id: '', file_url: '', file_name: '', remarks: '' })); load();
    } catch (e: any) { setMsg({ ok: false, text: e.message }); }
  }
  async function remove(id: number) {
    if (!confirm('Remove this Form 16?')) return;
    try { await api(`/pay/form16/${id}`, { method: 'DELETE' }); load(); } catch (e: any) { setMsg({ ok: false, text: e.message }); }
  }

  return (
    <Shell>
      <div className="text-xs text-gray-500 mb-1">Payroll › Form 16</div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 className="text-xl font-bold text-brand-700">Form 16 Details</h2>
        {isAdmin && <button className="btn btn-primary text-sm" onClick={() => setShowUpload(v => !v)}>{showUpload ? 'Close' : 'Upload Form 16'}</button>}
      </div>
      {msg && <div className={`text-sm mb-3 ${msg.ok ? 'text-green-700' : 'text-red-700'}`}>{msg.text}</div>}

      {isAdmin && showUpload && (
        <form onSubmit={save} className="card p-4 mb-4 grid md:grid-cols-3 gap-3 text-sm">
          <div><label className="label">Staff *</label>
            <select className="input" required value={form.teacher_id} onChange={e => setForm({ ...form, teacher_id: e.target.value })}>
              <option value="">-- Select --</option>
              {teachers.map(t => <option key={t.id} value={t.id}>{t.employee_no} — {t.full_name}</option>)}
            </select></div>
          <div><label className="label">Financial Year *</label>
            <select className="input" value={form.financial_year} onChange={e => setForm({ ...form, financial_year: e.target.value })}>
              {fy.options.map(o => <option key={o}>{o}</option>)}
            </select></div>
          <div>
            <FileUpload label="Form 16 File (PDF) *" accept=".pdf,.jpg,.jpeg,.png"
              onUploaded={f => setForm(x => ({ ...x, file_url: f[0].url, file_name: f[0].name }))} />
            {form.file_name && <div className="text-xs text-green-700 mt-1">Uploaded: {form.file_name}</div>}
          </div>
          <div className="md:col-span-2"><label className="label">Remarks</label><input className="input" value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} /></div>
          <div className="flex items-end"><button className="btn btn-primary">Save</button></div>
          <div className="md:col-span-3 text-xs text-gray-500">Uploading again for the same person and year replaces the earlier file.</div>
        </form>
      )}

      <div className="card p-4 overflow-x-auto">
        <div className="flex items-center gap-2 mb-3 text-sm"><label>Financial Year</label>
          <select className="input w-36" value={filterFy} onChange={e => setFilterFy(e.target.value)}>
            <option value="">All</option>{fy.options.map(o => <option key={o}>{o}</option>)}
          </select></div>
        <table className="table text-sm">
          <thead><tr><th>Financial Year</th>{isAdmin && <><th>Emp No</th><th>Name</th><th>PAN</th></>}<th>File</th><th>Remarks</th><th>Uploaded</th>{isAdmin && <th></th>}</tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td>{r.financial_year}</td>
                {isAdmin && <><td>{r.employee_no}</td><td>{r.full_name}</td><td>{r.pan_no || '—'}</td></>}
                <td><FileLinks value={r.file_url} names={r.file_name} /></td><td>{r.remarks || '—'}</td>
                <td>{fmtDate(r.uploaded_at)}{r.uploaded_by_name ? ` by ${r.uploaded_by_name}` : ''}</td>
                {isAdmin && <td><button className="text-xs text-red-600 hover:underline" onClick={() => remove(r.id)}>Remove</button></td>}
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={isAdmin ? 8 : 4} className="text-center py-4 text-gray-500">No Form 16 uploaded.</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
