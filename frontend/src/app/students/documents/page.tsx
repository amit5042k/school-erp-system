'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import FileUpload, { FileLinks } from '@/components/FileUpload';
import { api, fmtDate, getUser, localDate } from '@/lib/api';
import { Notice, PageHead, StudentPicker, useFlash } from '../_lib/shared';

type Doc = { doc_type: string; status: 'received' | 'pending'; file_url: string | null; received_on: string | null; remarks: string | null; retired?: boolean };

export default function StudentDocumentsPage({ searchParams }: { searchParams: { student?: string } }) {
  const isAdmin = getUser<any>()?.role === 'admin';
  const [studentId, setStudentId] = useState<number | ''>(Number(searchParams.student) || '');
  const [docs, setDocs] = useState<Doc[]>([]);
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const { msg, flash } = useFlash();

  const load = (id: number) => api<Doc[]>(`/stu/documents/${id}`).then(d => { setDocs(d); setDirty({}); }).catch(e => flash(e.message, false));
  useEffect(() => { if (studentId) load(studentId); else setDocs([]); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [studentId]);

  const edit = (t: string, p: Partial<Doc>) => {
    setDocs(d => d.map(x => (x.doc_type === t ? { ...x, ...p } : x)));
    setDirty(x => ({ ...x, [t]: true }));
  };

  async function save(d: Doc) {
    try {
      await api(`/stu/documents/${studentId}`, { method: 'PUT', body: JSON.stringify(d) });
      flash(`${d.doc_type} saved.`);
      load(studentId as number);
    } catch (e: any) { flash(e.message, false); }
  }

  const received = docs.filter(d => d.status === 'received').length;

  return (
    <Shell>
      <PageHead crumb="Student › Student Pending Documents" title="Student Documents" subtitle="Document checklist collected at admission">
        <Link href="/report/student-pending-documents" className="btn bg-gray-200 text-sm">Pending Documents Report</Link>
        {isAdmin && <Link href="/masters/student-documents" className="btn bg-gray-200 text-sm">Edit Checklist</Link>}
      </PageHead>
      <Notice msg={msg} />
      <div className="card p-4 mb-4 max-w-2xl text-sm">
        <StudentPicker value={studentId} onChange={id => setStudentId(id)} />
      </div>

      {studentId !== '' && (
        <div className="card p-4 overflow-x-auto">
          <div className="text-sm text-gray-600 mb-2">{received} of {docs.length} document(s) received</div>
          <table className="table text-sm">
            <thead><tr><th>Document</th><th>Status</th><th>Received On</th><th>File</th><th>Remarks</th>{isAdmin && <th></th>}</tr></thead>
            <tbody>
              {docs.map(d => (
                <tr key={d.doc_type}>
                  <td className="font-medium">{d.doc_type}{d.retired && <span className="text-[11px] text-gray-400"> (removed from checklist)</span>}</td>
                  <td>
                    {isAdmin ? (
                      <select className="input" value={d.status} onChange={e => edit(d.doc_type, {
                        status: e.target.value as Doc['status'], received_on: e.target.value === 'received' ? d.received_on || localDate() : null,
                      })}>
                        <option value="pending">Pending</option><option value="received">Received</option>
                      </select>
                    ) : <span className={`badge ${d.status === 'received' ? 'badge-green' : 'badge-amber'}`}>{d.status}</span>}
                  </td>
                  <td>{isAdmin && d.status === 'received'
                    ? <input className="input" type="date" value={d.received_on || ''} onChange={e => edit(d.doc_type, { received_on: e.target.value })} />
                    : fmtDate(d.received_on)}</td>
                  <td className="min-w-[12rem]">
                    <FileLinks value={d.file_url} />
                    {isAdmin && <FileUpload label="" accept="image/*,.pdf" onUploaded={f => edit(d.doc_type, { file_url: f[0]?.url || null, status: 'received', received_on: d.received_on || localDate() })} />}
                  </td>
                  <td>{isAdmin ? <input className="input" value={d.remarks || ''} onChange={e => edit(d.doc_type, { remarks: e.target.value })} /> : d.remarks || '—'}</td>
                  {isAdmin && <td><button className="btn btn-primary text-xs py-1" disabled={!dirty[d.doc_type]} onClick={() => save(d)}>Save</button></td>}
                </tr>
              ))}
              {!docs.length && <tr><td colSpan={6} className="text-center text-gray-500 py-4">The document checklist is empty.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
