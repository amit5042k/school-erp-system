'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import FileUpload from '@/components/FileUpload';
import { api, fileUrl, localDate } from '@/lib/api';
import { Notice, PageHead, StatusBadge, useClasses, useFlash, useMaster } from '../_lib/shared';

type Form = Record<string, any>;
type CustomField = { id: number; name: string; field_type?: string; options?: string };

const EMPTY: Form = {
  admission_no: '', admission_date: localDate(), session: '', class_id: '', roll_no: '', house: '',
  full_name: '', gender: 'M', dob: '', blood_group: '', category: '', religion: '', aadhaar_no: '', photo_url: '',
  father_name: '', mother_name: '', contact: '', email: '', address: '',
};
const BLOOD = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const RELIGIONS = ['Hindu', 'Sikh', 'Muslim', 'Christian', 'Jain', 'Buddhist', 'Other'];

export default function AdmissionPage({ searchParams }: { searchParams: { edit?: string; registration?: string; prospectus?: string } }) {
  const router = useRouter();
  const editId = Number(searchParams.edit) || null;
  const regId = Number(searchParams.registration) || null;
  const prosId = Number(searchParams.prospectus) || null;
  const classes = useClasses();
  const houses = useMaster('student-houses');
  const categories = useMaster('student-categories');
  const customFields = useMaster('student-custom-fields') as unknown as CustomField[];
  const [form, setForm] = useState<Form>(EMPTY);
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [source, setSource] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { msg, flash } = useFlash();

  useEffect(() => {
    (async () => {
      try {
        if (editId) {
          const s = await api<any>(`/stu/students/${editId}`);
          const f: Form = { ...EMPTY };
          for (const k of Object.keys(EMPTY)) f[k] = s[k] ?? '';
          setForm(f);
          setStatus(s.status);
          setCustom(Object.fromEntries((s.custom || []).filter((c: any) => c.value != null).map((c: any) => [String(c.field_id), c.value])));
          return;
        }
        const nums = await api<{ admission_no: string; session: string }>('/stu/next-numbers');
        let f: Form = { ...EMPTY, admission_no: nums.admission_no, session: nums.session };
        // Admission from a registration or a prospectus copies the applicant's details.
        const src = regId ? await api<any>(`/stu/registrations/${regId}`) : prosId ? await api<any>(`/prospectus/${prosId}`) : null;
        if (src) {
          f = {
            ...f, full_name: [src.first_name, src.last_name].filter(Boolean).join(' '), gender: src.gender || 'M', dob: src.dob || '',
            class_id: src.class_id || '', father_name: src.father_name || '', mother_name: src.mother_name || '',
            contact: src.phone || '', email: src.email || '', address: src.address || '', session: src.session || f.session,
          };
          setSource(regId ? `Registration ${src.reg_no}` : `Prospectus ${src.prospectus_no}`);
        }
        setForm(f);
      } catch (e: any) { flash(e.message, false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, regId, prosId]);

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const body: Form = { ...form, custom };
      body.class_id = form.class_id ? Number(form.class_id) : null;
      body.roll_no = form.roll_no ? Number(form.roll_no) : null;
      if (editId) {
        await api(`/stu/students/${editId}`, { method: 'PUT', body: JSON.stringify(body) });
        flash('Student details saved.');
      } else {
        if (regId) body.registration_id = regId;
        if (prosId) body.prospectus_id = prosId;
        const r = await api<{ id: number; admission_no: string }>('/stu/admission', { method: 'POST', body: JSON.stringify(body) });
        flash(`Admitted ${form.full_name} with Admission No ${r.admission_no}.`);
        setTimeout(() => router.push(`/students/manage?highlight=${r.id}`), 900);
      }
    } catch (e: any) { flash(e.message, false); }
    finally { setBusy(false); }
  }

  const field = (k: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div><label className="label">{label}{props.required ? ' *' : ''}</label>
      <input className="input" value={form[k] ?? ''} onChange={e => set(k, e.target.value)} {...props} /></div>
  );

  return (
    <Shell>
      <PageHead crumb="Student › Admission" title={editId ? 'Edit Student' : 'Admission'}
        subtitle={editId ? form.admission_no : source ? `From ${source}` : 'New student admission'}>
        {editId && status && <StatusBadge status={status} />}
        <Link href="/students/manage" className="btn bg-gray-200 text-sm">Manage Student</Link>
      </PageHead>
      <Notice msg={msg} />

      <form onSubmit={submit} className="space-y-4">
        <section className="card p-4">
          <h3 className="font-semibold text-brand-700 mb-3">Admission Details</h3>
          <div className="grid md:grid-cols-4 gap-3 text-sm">
            {field('admission_no', 'Admission No', { required: true })}
            {field('admission_date', 'Admission Date', { type: 'date' })}
            {field('session', 'Session', { placeholder: '2026-27' })}
            <div><label className="label">Class</label>
              <select className="input" value={form.class_id ?? ''} onChange={e => set('class_id', e.target.value)}>
                <option value="">-- Select --</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name} {c.section}</option>)}
              </select></div>
            {field('roll_no', 'Roll No', { type: 'number', min: 1 })}
            <div><label className="label">House</label>
              <select className="input" value={form.house ?? ''} onChange={e => set('house', e.target.value)}>
                <option value="">—</option>
                {houses.map(h => <option key={h.id}>{h.name}</option>)}
              </select></div>
          </div>
        </section>

        <section className="card p-4">
          <h3 className="font-semibold text-brand-700 mb-3">Student Details</h3>
          <div className="grid md:grid-cols-4 gap-3 text-sm">
            <div className="md:col-span-2">{field('full_name', 'Student Name', { required: true })}</div>
            <div><label className="label">Gender</label>
              <select className="input" value={form.gender} onChange={e => set('gender', e.target.value)}>
                <option value="M">Male</option><option value="F">Female</option><option value="O">Other</option>
              </select></div>
            {field('dob', 'Date of Birth', { type: 'date', max: localDate() })}
            <div><label className="label">Blood Group</label>
              <select className="input" value={form.blood_group ?? ''} onChange={e => set('blood_group', e.target.value)}>
                <option value="">—</option>{BLOOD.map(b => <option key={b}>{b}</option>)}
              </select></div>
            <div><label className="label">Category</label>
              <select className="input" value={form.category ?? ''} onChange={e => set('category', e.target.value)}>
                <option value="">—</option>{categories.map(c => <option key={c.id}>{c.name}</option>)}
              </select></div>
            <div><label className="label">Religion</label>
              <select className="input" value={form.religion ?? ''} onChange={e => set('religion', e.target.value)}>
                <option value="">—</option>{RELIGIONS.map(r => <option key={r}>{r}</option>)}
              </select></div>
            {field('aadhaar_no', 'Aadhaar No', { inputMode: 'numeric', placeholder: '12 digits' })}
            <div className="md:col-span-2 flex gap-3 items-end">
              <div className="w-20 h-24 border rounded bg-gray-50 grid place-items-center overflow-hidden shrink-0">
                {form.photo_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={fileUrl(form.photo_url)} alt="Student" className="w-full h-full object-cover" />
                  : <span className="text-[10px] text-gray-400 text-center">No photo</span>}
              </div>
              <div className="flex-1">
                <FileUpload label="Photo" accept="image/*" onUploaded={f => set('photo_url', f[0]?.url || '')} />
                {form.photo_url && <button type="button" className="text-xs text-red-600 hover:underline mt-1" onClick={() => set('photo_url', '')}>Remove photo</button>}
              </div>
            </div>
          </div>
        </section>

        <section className="card p-4">
          <h3 className="font-semibold text-brand-700 mb-3">Parents & Contact</h3>
          <div className="grid md:grid-cols-4 gap-3 text-sm">
            {field('father_name', "Father's Name")}
            {field('mother_name', "Mother's Name")}
            {field('contact', 'Contact No', { inputMode: 'tel' })}
            {field('email', 'Email', { type: 'email' })}
            <div className="md:col-span-4"><label className="label">Address</label>
              <textarea className="input" rows={2} value={form.address ?? ''} onChange={e => set('address', e.target.value)} /></div>
          </div>
        </section>

        {customFields.length > 0 && (
          <section className="card p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold text-brand-700">Additional Details</h3>
              <Link href="/masters/student-custom-fields" className="text-xs text-brand-600 hover:underline">Manage fields</Link>
            </div>
            <div className="grid md:grid-cols-4 gap-3 text-sm">
              {customFields.map(f => {
                const v = custom[String(f.id)] ?? '';
                const setV = (x: string) => setCustom(c => ({ ...c, [String(f.id)]: x }));
                const choices = String(f.options || '').split(',').map(s => s.trim()).filter(Boolean);
                return (
                  <div key={f.id}><label className="label">{f.name}</label>
                    {f.field_type === 'select' && choices.length ? (
                      <select className="input" value={v} onChange={e => setV(e.target.value)}>
                        <option value="">—</option>{choices.map(c => <option key={c}>{c}</option>)}
                      </select>
                    ) : (
                      <input className="input" type={f.field_type === 'number' || f.field_type === 'date' ? f.field_type : 'text'}
                        value={v} onChange={e => setV(e.target.value)} />
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <div className="flex gap-2">
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : editId ? 'Save Changes' : 'Admit Student'}</button>
          <Link href="/students" className="btn bg-gray-200">Cancel</Link>
        </div>
      </form>
    </Shell>
  );
}
