'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, fileUrl, fmtDate } from '@/lib/api';
import { dateInWords } from '../../_lib/shared';

export default function TcPrintPage({ params }: { params: { id: string } }) {
  const [tc, setTc] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api<any>(`/stu/tc/${params.id}`).then(setTc).catch(e => setErr(e.message)); }, [params.id]);

  if (err) return <Shell><div className="text-red-700">{err}</div></Shell>;
  if (!tc) return <Shell><div className="text-gray-500">Loading…</div></Shell>;
  const s = tc.student || {};
  const sc = tc.school || {};
  const rows: [string, React.ReactNode][] = [
    ['Name of Pupil', s.full_name],
    ["Mother's Name", s.mother_name || '—'],
    ["Father's / Guardian's Name", s.father_name || '—'],
    ['Nationality', tc.nationality || '—'],
    ['Category (General / OBC / SC / ST)', s.category || '—'],
    ['Date of Birth (in figures)', fmtDate(s.dob)],
    ['Date of Birth (in words)', dateInWords(s.dob) || '—'],
    ['Admission No and Date of Admission', `${s.admission_no}${s.admission_date ? ' — ' + fmtDate(s.admission_date) : ''}`],
    ['Class in which the pupil last studied', tc.last_class || '—'],
    ['Whether qualified for promotion to higher class', tc.qualified_for_promotion || 'Not applicable'],
    ['Whether the pupil has paid all dues to the school', tc.dues_paid || '—'],
    ['Total number of working days', tc.working_days ?? '—'],
    ['Total number of days present', tc.days_present ?? '—'],
    ['General conduct', tc.conduct || '—'],
    ['Date of application for certificate', fmtDate(tc.application_date)],
    ['Date on which pupil left the school', fmtDate(tc.leaving_date)],
    ['Date of issue of certificate', fmtDate(tc.issue_date)],
    ['Reason for leaving the school', tc.reason],
    ['Any other remarks', tc.remarks || '—'],
  ];

  return (
    <Shell>
      <div className="flex justify-end gap-2 mb-3 no-print">
        <button className="btn btn-primary text-sm" onClick={() => window.print()}>Print</button>
      </div>
      <div className="bg-white mx-auto max-w-3xl border-4 border-double border-gray-800 p-8 text-gray-900 print-avoid-break relative">
        {tc.status === 'cancelled' && (
          <div className="absolute inset-0 grid place-items-center pointer-events-none">
            <span className="text-6xl font-black text-red-600/30 -rotate-12">CANCELLED</span>
          </div>
        )}
        <div className="flex items-center gap-4 border-b-2 border-gray-800 pb-4 mb-4">
          {sc.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fileUrl(sc.logo_url)} alt="" className="w-16 h-16 object-contain" />
          )}
          <div className="flex-1 text-center">
            <div className="text-2xl font-bold uppercase tracking-wide">{sc.school_name}</div>
            {sc.address && <div className="text-sm">{sc.address}</div>}
            <div className="text-xs">{[sc.phone, sc.email, sc.website].filter(Boolean).join(' · ')}</div>
          </div>
        </div>
        <div className="text-center mb-4">
          <div className="inline-block border-2 border-gray-800 px-6 py-1 text-lg font-bold tracking-widest uppercase">Transfer Certificate</div>
        </div>
        <div className="flex justify-between text-sm mb-4">
          <span>TC No: <b>{tc.tc_no}</b></span>
          <span>Admission No: <b>{s.admission_no}</b></span>
        </div>
        <table className="w-full text-sm">
          <tbody>
            {rows.map(([label, value], i) => (
              <tr key={label} className="align-top">
                <td className="py-1.5 pr-2 w-8">{i + 1}.</td>
                <td className="py-1.5 pr-4 w-1/2">{label}</td>
                <td className="py-1.5 border-b border-dotted border-gray-500 font-medium">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="grid grid-cols-3 gap-6 mt-16 text-sm text-center">
          <div className="border-t border-gray-800 pt-1">Prepared by</div>
          <div className="border-t border-gray-800 pt-1">Checked by</div>
          <div className="border-t border-gray-800 pt-1">Principal<br /><span className="text-xs">(Signature with seal)</span></div>
        </div>
      </div>
    </Shell>
  );
}
