'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api, getUser, localDate } from '@/lib/api';
import { Crumb, Flash, useFlash, useHostels } from '../_ui';

const MEALS = ['breakfast', 'lunch', 'snacks', 'dinner'] as const;
type Day = { day: number; name: string } & Record<(typeof MEALS)[number], string>;
type CountRow = { id: number; name: string; residents: number; present: number | null; counts: Record<string, number | null> };
type FeeRow = { hostel_id: number; name: string; monthly_fee: number; due_day: number };
type GenResult = { term: string; created: number; skipped_existing: number; skipped_no_fee: number; total: number;
  rows: { student_id: number; full_name: string; hostel_name: string; amount: number; due_date: string }[] };

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export default function MessPage() {
  const admin = getUser<any>()?.role === 'admin';
  const [tab, setTab] = useState<'menu' | 'counts' | 'fees'>('menu');
  return (
    <Shell>
      <Crumb title="Mess" />
      <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
        <h2 className="text-xl font-bold text-brand-700">Mess</h2>
        <div className="flex gap-2">
          {([['menu', 'Weekly Menu'], ['counts', 'Meal Counts'], ...(admin ? [['fees', 'Mess Fee']] : [])] as [typeof tab, string][]).map(([k, l]) => (
            <button key={k} className={`btn text-sm ${tab === k ? 'btn-primary' : 'bg-gray-200'}`} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
      </div>
      {tab === 'menu' && <Menu admin={admin} />}
      {tab === 'counts' && <Counts />}
      {tab === 'fees' && admin && <Fees />}
    </Shell>
  );
}

function Menu({ admin }: { admin: boolean }) {
  const hostels = useHostels();
  const [hostelId, setHostelId] = useState('0');
  const [days, setDays] = useState<Day[]>([]);
  const { msg, flash } = useFlash();
  useEffect(() => { api<{ days: Day[] }>(`/hostel-ops/menu?hostel_id=${hostelId}`).then(r => setDays(r.days)).catch(e => flash(e.message, false)); /* eslint-disable-next-line */ }, [hostelId]);
  const set = (d: number, meal: string, v: string) => setDays(l => l.map(x => (x.day === d ? { ...x, [meal]: v } : x)));

  async function save() {
    try { await api('/hostel-ops/menu', { method: 'PUT', body: JSON.stringify({ hostel_id: Number(hostelId), days }) }); flash('Menu saved.'); }
    catch (e: any) { flash(e.message, false); }
  }
  return (
    <>
      <Flash msg={msg} />
      <div className="card p-4 mb-3 flex flex-wrap gap-3 items-end text-sm no-print">
        <div><label className="label">Menu for</label>
          <select className="input" value={hostelId} onChange={e => setHostelId(e.target.value)}>
            <option value="0">All hostels (common menu)</option>
            {hostels.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select></div>
        {hostelId !== '0' && <div className="text-xs text-gray-500">Leave a meal blank to use the common menu for it.</div>}
        <div className="ml-auto flex gap-2">
          <button className="btn bg-gray-200" onClick={() => window.print()}>Print</button>
          {admin && <button className="btn btn-primary" onClick={save}>Save Menu</button>}
        </div>
      </div>
      <div className="card p-4 overflow-x-auto">
        <table className="table text-sm min-w-max">
          <thead><tr><th>Day</th>{MEALS.map(m => <th key={m}>{cap(m)}</th>)}</tr></thead>
          <tbody>
            {days.map(d => (
              <tr key={d.day}>
                <td className="font-medium">{d.name}</td>
                {MEALS.map(m => (
                  <td key={m}>{admin
                    ? <textarea className="input text-xs min-w-[160px]" rows={2} value={d[m] || ''} onChange={e => set(d.day, m, e.target.value)} />
                    : <span className="whitespace-pre-wrap">{d[m] || '—'}</span>}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Counts() {
  const [date, setDate] = useState(localDate());
  const [rows, setRows] = useState<CountRow[]>([]);
  const { msg, flash } = useFlash();
  const load = () => api<{ hostels: CountRow[] }>(`/hostel-ops/meal-counts?date=${date}`).then(r => setRows(r.hostels)).catch(e => flash(e.message, false));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [date]);
  const set = (id: number, meal: string, v: string) => setRows(l => l.map(r => (r.id === id ? { ...r, counts: { ...r.counts, [meal]: v === '' ? null : Number(v) } } : r)));

  async function save(r: CountRow) {
    try { await api('/hostel-ops/meal-counts', { method: 'PUT', body: JSON.stringify({ date, hostel_id: r.id, counts: r.counts }) }); flash(`Saved for ${r.name}.`); }
    catch (e: any) { flash(e.message, false); }
  }
  return (
    <>
      <Flash msg={msg} />
      <div className="card p-4 mb-3 flex flex-wrap gap-3 items-end text-sm">
        <div><label className="label">Date</label><input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
        <div className="text-xs text-gray-500">Record how many plates were served. &ldquo;Present&rdquo; is boarders marked present or late at any of that day&apos;s roll calls, each counted once.</div>
        <Link href="/report/hostel-meal-counts" className="ml-auto btn bg-gray-200 text-sm">Meal Count Report</Link>
      </div>
      <div className="card p-4 overflow-x-auto">
        <table className="table text-sm min-w-max">
          <thead><tr><th>Hostel</th><th>Boarders</th><th>Present</th>{MEALS.map(m => <th key={m}>{cap(m)}</th>)}<th></th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td className="font-medium">{r.name}</td><td>{r.residents}</td><td>{r.present ?? '—'}</td>
                {MEALS.map(m => <td key={m}><input className="input w-20" type="number" min={0} value={r.counts[m] ?? ''} onChange={e => set(r.id, m, e.target.value)} /></td>)}
                <td><button className="btn btn-primary text-xs" onClick={() => save(r)}>Save</button></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={8} className="text-center py-6 text-gray-500">No hostels set up yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Fees() {
  const [rows, setRows] = useState<FeeRow[]>([]);
  const [month, setMonth] = useState(localDate().slice(0, 7));
  const [hostelId, setHostelId] = useState('0');
  const [preview, setPreview] = useState<GenResult | null>(null);
  const { msg, flash } = useFlash();
  useEffect(() => { api<FeeRow[]>('/hostel-ops/mess-fees').then(setRows).catch(e => flash(e.message, false)); /* eslint-disable-next-line */ }, []);
  const set = (id: number, patch: Partial<FeeRow>) => setRows(l => l.map(r => (r.hostel_id === id ? { ...r, ...patch } : r)));

  async function saveSettings() {
    try { await api('/hostel-ops/mess-fees', { method: 'PUT', body: JSON.stringify({ items: rows }) }); flash('Mess fee settings saved.'); }
    catch (e: any) { flash(e.message, false); }
  }
  async function generate(dry: boolean) {
    try {
      const r = await api<GenResult>('/hostel-ops/mess-fees/generate', { method: 'POST', body: JSON.stringify({ month, hostel_id: Number(hostelId), preview: dry }) });
      if (dry) setPreview(r);
      else { setPreview(null); flash(`${r.created} mess fee dues added (${r.term}, ₹${r.total}). ${r.skipped_existing} already had this month's fee.`); }
    } catch (e: any) { flash(e.message, false); }
  }
  return (
    <>
      <Flash msg={msg} />
      <div className="card p-4 mb-4">
        <div className="font-semibold text-brand-700 mb-2">Monthly mess fee per hostel</div>
        <table className="table text-sm">
          <thead><tr><th>Hostel</th><th>Monthly fee (₹)</th><th>Due on day</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.hostel_id}>
                <td>{r.name}</td>
                <td><input className="input w-32" type="number" min={0} value={r.monthly_fee} onChange={e => set(r.hostel_id, { monthly_fee: Number(e.target.value) })} /></td>
                <td><input className="input w-20" type="number" min={1} max={28} value={r.due_day} onChange={e => set(r.hostel_id, { due_day: Number(e.target.value) })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="text-right mt-2"><button className="btn btn-primary text-sm" onClick={saveSettings}>Save Settings</button></div>
      </div>
      <div className="card p-4">
        <div className="font-semibold text-brand-700 mb-1">Add this month&apos;s mess fee</div>
        <p className="text-xs text-gray-500 mb-3">Adds a &ldquo;Mess Fee&rdquo; due to every current boarder; it is then collected like any other fee. Each boarder gets it only once per month.</p>
        <div className="flex flex-wrap gap-3 items-end text-sm">
          <div><label className="label">Month</label><input className="input" type="month" value={month} onChange={e => { setMonth(e.target.value); setPreview(null); }} /></div>
          <div><label className="label">Hostel</label>
            <select className="input" value={hostelId} onChange={e => { setHostelId(e.target.value); setPreview(null); }}>
              <option value="0">All hostels</option>
              {rows.map(h => <option key={h.hostel_id} value={h.hostel_id}>{h.name}</option>)}
            </select></div>
          <button className="btn bg-gray-200" onClick={() => generate(true)}>Preview</button>
          {preview && preview.rows.length > 0 && <button className="btn btn-primary" onClick={() => generate(false)}>Add {preview.rows.length} Dues</button>}
        </div>
        {preview && (
          <div className="mt-3">
            <div className="text-sm mb-2">{preview.term}: <b>{preview.rows.length}</b> boarders, total <b>₹{preview.total}</b>
              {preview.skipped_existing ? ` · ${preview.skipped_existing} already charged` : ''}{preview.skipped_no_fee ? ` · ${preview.skipped_no_fee} in hostels with no fee set` : ''}</div>
            {preview.rows.length > 0 && (
              <table className="table text-sm"><thead><tr><th>Student</th><th>Hostel</th><th>Amount</th><th>Due</th></tr></thead>
                <tbody>{preview.rows.map(r => <tr key={r.student_id}><td>{r.full_name}</td><td>{r.hostel_name}</td><td>₹{r.amount}</td><td>{r.due_date}</td></tr>)}</tbody></table>
            )}
          </div>
        )}
      </div>
    </>
  );
}
