'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, downloadCsv, fmtDate, fmtMoney, sessionList } from '@/lib/api';
import { t as tr } from '@/lib/i18n';
import { canDoInArea, REPORT_GROUP_AREAS } from '@/lib/permissions';
import { getStoredUser } from '@/lib/api';

export type ReportParam = {
  name: string; label?: string; required?: boolean; default?: string;
  type?: 'text' | 'number' | 'date' | 'month' | 'select' | 'class' | 'student' | 'teacher' | 'session';
  options?: (string | { value: string | number; label: string })[];
};
export type ReportColumn = { key: string; label: string; type?: 'text' | 'number' | 'money' | 'date' | 'percent'; total?: boolean };
type ReportResult = {
  key: string; title: string; group: string; description?: string;
  params: ReportParam[]; columns: ReportColumn[]; values: Record<string, string>; rows: any[]; generated_at: string;
};


function cell(v: any, c: ReportColumn) {
  if (v == null || v === '') return '—';
  if (c.type === 'money') return fmtMoney(v);
  if (c.type === 'date') return fmtDate(String(v));
  if (c.type === 'percent') return `${Number(v).toFixed(1)}%`;
  if (c.type === 'number') return Number(v).toLocaleString('en-IN');
  return String(v);
}

/** Renders any backend report (see backend/src/utils/reports.js): filters, table, totals, CSV and print. */
export default function ReportView({ reportKey, initial }: { reportKey: string; initial?: Record<string, string> }) {
  const [res, setRes] = useState<ReportResult | null>(null);
  const [values, setValues] = useState<Record<string, string>>(initial || {});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lookups, setLookups] = useState<{ classes: any[]; students: any[]; teachers: any[] }>({ classes: [], students: [], teachers: [] });
  const [sessions, setSessions] = useState<string[]>([]);

  async function run(v: Record<string, string> = values) {
    setBusy(true); setErr(null);
    try {
      const qs = new URLSearchParams(Object.entries(v).filter(([, x]) => x !== '' && x != null)).toString();
      const r = await api<ReportResult>(`/report/${reportKey}${qs ? `?${qs}` : ''}`);
      setRes(r);
      setValues(r.values);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  useEffect(() => { run(initial || {}); /* eslint-disable-next-line */ }, [reportKey]);

  const needs = useMemo(() => new Set((res?.params || []).map(p => p.type)), [res]);
  useEffect(() => {
    if (needs.has('class')) api<any[]>('/classes').then(classes => setLookups(l => ({ ...l, classes }))).catch(() => {});
    if (needs.has('student')) api<any[]>('/students').then(students => setLookups(l => ({ ...l, students }))).catch(() => {});
    if (needs.has('session')) api<{ academic_year?: string }>('/settings').then(s => setSessions(sessionList(s?.academic_year))).catch(() => {});
    if (needs.has('teacher')) api<any[]>('/teachers').then(teachers => setLookups(l => ({ ...l, teachers }))).catch(() => {});
  }, [needs]);

  const totals = useMemo(() => {
    if (!res) return null;
    const cols = res.columns.filter(c => c.total);
    if (!cols.length) return null;
    const t: Record<string, number> = {};
    for (const c of cols) t[c.key] = res.rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0);
    return t;
  }, [res]);

  function input(p: ReportParam) {
    const v = values[p.name] ?? '';
    const set = (x: string) => setValues(s => ({ ...s, [p.name]: x }));
    const opt = (o: any) => (typeof o === 'string' ? { value: o, label: o } : o);
    if (p.type === 'class') return (
      <select className="input" value={v} onChange={e => set(e.target.value)}>
        <option value="">{tr('All Classes')}</option>
        {lookups.classes.map(c => <option key={c.id} value={c.id}>{c.name} {c.section}</option>)}
      </select>);
    if (p.type === 'student') return (
      <select className="input" value={v} onChange={e => set(e.target.value)}>
        <option value="">{tr(p.required ? '-- Select --' : 'All Students')}</option>
        {lookups.students.map(s => <option key={s.id} value={s.id}>{s.admission_no} — {s.full_name}</option>)}
      </select>);
    if (p.type === 'teacher') return (
      <select className="input" value={v} onChange={e => set(e.target.value)}>
        <option value="">{tr(p.required ? '-- Select --' : 'All Staff')}</option>
        {lookups.teachers.map(t => <option key={t.id} value={t.id}>{t.employee_no} — {t.full_name}</option>)}
      </select>);
    if (p.type === 'select' || p.type === 'session') {
      const options = p.type === 'session' ? sessions : p.options || [];
      return (
        <select className="input" value={v} onChange={e => set(e.target.value)}>
          {!p.required && <option value="">{tr('All')}</option>}
          {options.map(o => { const x = opt(o); return <option key={x.value} value={x.value}>{x.label}</option>; })}
        </select>);
    }
    return <input className="input" type={p.type === 'date' || p.type === 'month' || p.type === 'number' ? p.type : 'text'}
      value={v} onChange={e => set(e.target.value)} />;
  }

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
        <div>
          <div className="text-xs text-gray-500 no-print">{tr('Reports')} › {res?.group ? tr(res.group) : '…'}</div>
          <h2 className="text-xl font-bold text-brand-700">{tr(res?.title || 'Report')}</h2>
          {res?.description && <div className="text-sm text-gray-500">{res.description}</div>}
        </div>
        {res && canDoInArea(getStoredUser<any>(), REPORT_GROUP_AREAS[res.group] ?? null, 'export') && (
          <div className="flex gap-2 no-print">
            <button className="btn btn-accent text-sm" onClick={() => downloadCsv(`${res.key}-${new Date().toISOString().slice(0, 10)}`, res.columns, res.rows, REPORT_GROUP_AREAS[res.group] ?? null)}>{tr('Download Excel')}</button>
            <button className="btn bg-gray-200 text-sm" onClick={() => window.print()}>{tr('Print')}</button>
          </div>
        )}
      </div>

      {res && res.params.length > 0 && (
        <form className="card p-4 my-4 grid md:grid-cols-4 gap-3 text-sm no-print" onSubmit={e => { e.preventDefault(); run(); }}>
          {res.params.map(p => (
            <div key={p.name}><label className="label">{tr(p.label || p.name)}{p.required ? ' *' : ''}</label>{input(p)}</div>
          ))}
          <div className="flex items-end"><button className="btn btn-primary" disabled={busy}>{tr(busy ? 'Loading…' : 'Search')}</button></div>
        </form>
      )}
      {res && res.params.length > 0 && (
        <div className="print-only text-xs text-gray-600 mb-2">
          {res.params.filter(p => values[p.name]).map(p => `${p.label || p.name}: ${values[p.name]}`).join(' · ')}
        </div>
      )}

      {err && <div className="text-red-700 text-sm my-3">{err}</div>}

      {res && (
        <div className="card p-4 overflow-x-auto">
          <div className="text-xs text-gray-500 mb-2">{res.rows.length} {tr('record(s)')}</div>
          <table className="table min-w-max">
            <thead><tr>{res.columns.map(c => <th key={c.key} className={c.type && c.type !== 'text' && c.type !== 'date' ? 'text-right' : ''}>{tr(c.label)}</th>)}</tr></thead>
            <tbody>
              {res.rows.map((r, i) => (
                <tr key={i}>{res.columns.map(c => (
                  <td key={c.key} className={c.type && c.type !== 'text' && c.type !== 'date' ? 'text-right' : ''}>{cell(r[c.key], c)}</td>
                ))}</tr>
              ))}
              {!res.rows.length && <tr><td colSpan={res.columns.length} className="text-center py-4 text-gray-500">{tr('No records for these filters.')}</td></tr>}
              {totals && res.rows.length > 0 && (
                <tr className="font-semibold bg-brand-50">
                  {res.columns.map((c, i) => (
                    <td key={c.key} className={c.total ? 'text-right' : ''}>{c.total ? cell(totals[c.key], c) : i === 0 ? tr('Total') : ''}</td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
