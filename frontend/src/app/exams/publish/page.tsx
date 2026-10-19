'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, getUser } from '@/lib/api';
import { ExamSelect, Flash, PageHead, useFlash } from '../_shared';

type State = { exam_id: number; class_id: number; marks_published: number; result_published: number };
type Data = {
  exams: { id: number; name: string; term?: string }[]; classes: { id: number; name: string; section: string }[];
  states: State[]; counts: { exam_id: number; class_id: number; students: number; entries: number }[];
};

export default function PublishPage() {
  const isAdmin = getUser<any>()?.role === 'admin';
  const { msg, flash } = useFlash();
  const [data, setData] = useState<Data | null>(null);
  const [examId, setExamId] = useState('');

  async function load() {
    try {
      const d = await api<Data>('/exam/publish');
      setData(d);
      if (!examId && d.exams[0]) setExamId(String(d.exams[0].id));
    } catch (e: any) { flash(e.message, false); }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  async function set(classId: number, patch: Partial<State>) {
    try {
      await api('/exam/publish', { method: 'PUT', body: JSON.stringify({ exam_id: Number(examId), class_id: classId, ...patch }) });
      load();
    } catch (e: any) { flash(e.message, false); }
  }
  async function setAll(patch: Partial<State>) {
    if (!data) return;
    if (!confirm('Apply to every class for this exam?')) return;
    for (const c of data.classes) {
      try { await api('/exam/publish', { method: 'PUT', body: JSON.stringify({ exam_id: Number(examId), class_id: c.id, ...patch }) }); }
      catch (e: any) { flash(e.message, false); return; }
    }
    flash('Updated all classes.');
    load();
  }

  const state = (cid: number) => data?.states.find(s => s.exam_id === Number(examId) && s.class_id === cid);
  const count = (cid: number) => data?.counts.find(s => s.exam_id === Number(examId) && s.class_id === cid);

  return (
    <Shell>
      <PageHead title="Publish Result / Publish Marks"
        subtitle="Students and parents see marks only after Publish Marks, and report cards only after Publish Result. Once a result is published, teachers can no longer change those marks." />
      <Flash msg={msg} />
      <div className="card p-4 mb-4 flex flex-wrap items-end gap-3 text-sm">
        <div className="min-w-[16rem]"><label className="label">Exam</label><ExamSelect exams={data?.exams || []} value={examId} onChange={setExamId} /></div>
        {isAdmin && examId && (
          <>
            <button className="btn bg-gray-200" onClick={() => setAll({ marks_published: 1 })}>Publish marks for all classes</button>
            <button className="btn btn-primary" onClick={() => setAll({ result_published: 1 })}>Publish result for all classes</button>
          </>
        )}
      </div>
      {data && examId && (
        <div className="card p-4 overflow-x-auto text-sm">
          <table className="table min-w-max">
            <thead><tr><th>Class</th><th>Students with marks</th><th>Marks</th><th>Result</th></tr></thead>
            <tbody>
              {data.classes.map(c => {
                const s = state(c.id), n = count(c.id);
                const marks = !!s?.marks_published, result = !!s?.result_published;
                return (
                  <tr key={c.id}>
                    <td>{c.name} {c.section}</td>
                    <td>{n ? `${n.students} (${n.entries} entries)` : <span className="text-gray-400">No marks yet</span>}</td>
                    <td>
                      <span className={`badge ${marks ? 'badge-green' : 'badge-gray'} mr-2`}>{marks ? 'Published' : 'Hidden'}</span>
                      {isAdmin && <button className="text-xs text-brand-600 hover:underline" onClick={() => set(c.id, { marks_published: marks ? 0 : 1 })}>{marks ? 'Unpublish' : 'Publish Marks'}</button>}
                    </td>
                    <td>
                      <span className={`badge ${result ? 'badge-green' : 'badge-gray'} mr-2`}>{result ? 'Published' : 'Hidden'}</span>
                      {isAdmin && <button className="text-xs text-brand-600 hover:underline" onClick={() => set(c.id, { result_published: result ? 0 : 1 })}>{result ? 'Unpublish' : 'Publish Result'}</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
