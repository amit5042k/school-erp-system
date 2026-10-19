'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';
import ConfigNotice from '../_lib/ConfigNotice';

type TargetType = 'all_staff' | 'staff' | 'staff_group' | 'all_students' | 'students' | 'student_group' | 'class' | 'section' | 'route';
type Recipient = { to: string; name: string; detail: string };
type Result = { batch_id: string; total: number; sent: number; failed: number; not_configured: number; skipped: number; missing: number; configured: boolean };

const MODES: Record<string, { title: string; types: TargetType[] }> = {
  staff: { title: 'Staff Communication', types: ['all_staff', 'staff', 'staff_group'] },
  selected: { title: 'SMS to Selected Students', types: ['students'] },
  many: { title: 'SMS to Many', types: ['all_students', 'class', 'section', 'student_group', 'route'] },
  classwise: { title: 'SMS Classwise', types: ['class', 'section'] },
  transport: { title: 'Transport Communication', types: ['route'] },
};
const TYPE_LABEL: Record<TargetType, string> = {
  all_staff: 'All Staff', staff: 'Selected Staff', staff_group: 'Staff Groups', all_students: 'All Students (parents)',
  students: 'Selected Students', student_group: 'Student Groups', class: 'Whole Classes (all sections)', section: 'Class Sections',
  route: 'Transport Routes',
};

export default function ComposePage({ searchParams }: { searchParams: { mode?: string } }) {
  const mode = MODES[searchParams.mode || ''] ? searchParams.mode! : 'staff';
  const cfg = MODES[mode];
  const [type, setType] = useState<TargetType>(cfg.types[0]);
  const [channel, setChannel] = useState<'sms' | 'email'>('sms');
  const [status, setStatus] = useState<{ sms: boolean; email: boolean } | null>(null);
  const [lists, setLists] = useState<{ teachers: any[]; students: any[]; classes: any[]; routes: any[]; staffGroups: any[]; studentGroups: any[]; templates: any[] }>(
    { teachers: [], students: [], classes: [], routes: [], staffGroups: [], studentGroups: [], templates: [] });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [classFilter, setClassFilter] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [preview, setPreview] = useState<{ total: number; missing: number; recipients: Recipient[] } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ sms: boolean; email: boolean }>('/messaging/status').then(setStatus).catch(() => {});
    const load = (k: string, url: string) => api<any[]>(url).then(rows => setLists(l => ({ ...l, [k]: rows }))).catch(() => {});
    load('teachers', '/teachers'); load('students', '/students'); load('classes', '/classes'); load('routes', '/routes');
    load('staffGroups', '/comm/groups?kind=staff'); load('studentGroups', '/comm/groups?kind=student'); load('templates', '/masters/message-templates');
  }, []);
  useEffect(() => { setPicked(new Set()); setPreview(null); setResult(null); }, [type]);
  useEffect(() => { setPreview(null); }, [picked, channel]);

  const classNames = useMemo(() => [...new Set(lists.classes.map(c => c.name as string))], [lists.classes]);
  const choices: { id: string; label: string; hint?: string }[] = useMemo(() => {
    switch (type) {
      case 'staff': return lists.teachers.filter(t => (t.status || 'active') === 'active').map(t => ({ id: String(t.id), label: t.full_name, hint: t.phone || t.email || 'no contact' }));
      case 'students': return lists.students.filter(s => (s.status || 'active') === 'active' && (!classFilter || String(s.class_id) === classFilter))
        .map(s => ({ id: String(s.id), label: `${s.full_name} (${s.admission_no})`, hint: `${s.class_name || ''} ${s.class_section || ''} · ${s.contact || 'no phone'}` }));
      case 'staff_group': return lists.staffGroups.map(g => ({ id: String(g.id), label: g.name, hint: `${g.member_count} members` }));
      case 'student_group': return lists.studentGroups.map(g => ({ id: String(g.id), label: g.name, hint: `${g.member_count} members` }));
      case 'class': return classNames.map(n => ({ id: n, label: n, hint: `${lists.classes.filter(c => c.name === n).length} section(s)` }));
      case 'section': return lists.classes.map(c => ({ id: String(c.id), label: `${c.name} ${c.section}`, hint: `${c.strength ?? 0} students` }));
      case 'route': return lists.routes.map(r => ({ id: String(r.id), label: r.name, hint: r.vehicle_no || '' }));
      default: return [];
    }
  }, [type, lists, classFilter, classNames]);

  const target = () => (type === 'class' ? { type, names: [...picked] } : { type, ids: [...picked].map(Number) });
  const needsPick = !type.startsWith('all_');
  const smsParts = Math.max(1, Math.ceil(body.length / 160));

  async function doPreview() {
    setErr(null);
    try { setPreview(await api('/comm/recipients', { method: 'POST', body: JSON.stringify({ channel, target: target() }) })); }
    catch (e: any) { setErr(e.message); }
  }
  async function send() {
    setErr(null); setResult(null);
    if (needsPick && !picked.size) return setErr('Choose at least one recipient.');
    if (!body.trim()) return setErr('Write the message.');
    if (!confirm(`Send this ${channel.toUpperCase()} now?`)) return;
    setBusy(true);
    try { setResult(await api<Result>('/comm/send', { method: 'POST', body: JSON.stringify({ channel, target: target(), subject, body }) })); setPreview(null); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }
  const toggle = (id: string) => setPicked(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allOn = choices.length > 0 && choices.every(c => picked.has(c.id));

  return (
    <Shell>
      <div className="text-xs text-gray-500 mb-1">Communication › {cfg.title}</div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 className="text-xl font-bold text-brand-700">{cfg.title}</h2>
        <Link href="/comms/sent-box" className="btn bg-gray-200 text-sm">Message Sent Box</Link>
      </div>
      <ConfigNotice status={status} channel={channel} />

      <div className="grid lg:grid-cols-5 gap-4">
        <div className="card p-4 lg:col-span-2 text-sm">
          <label className="label">Send To</label>
          <select className="input mb-3" value={type} onChange={e => setType(e.target.value as TargetType)}>
            {cfg.types.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
          {type === 'students' && (
            <select className="input mb-3" value={classFilter} onChange={e => setClassFilter(e.target.value)}>
              <option value="">All classes</option>
              {lists.classes.map(c => <option key={c.id} value={c.id}>{c.name} {c.section}</option>)}
            </select>
          )}
          {needsPick ? (
            <div className="border rounded max-h-96 overflow-y-auto">
              <label className="flex items-center gap-2 px-3 py-2 bg-brand-50 font-medium sticky top-0">
                <input type="checkbox" checked={allOn} onChange={() => setPicked(s => {
                  const n = new Set(s); choices.forEach(c => (allOn ? n.delete(c.id) : n.add(c.id))); return n; })} />
                Select all ({picked.size} selected)
              </label>
              {choices.map(c => (
                <label key={c.id} className="flex items-center gap-2 px-3 py-1.5 border-t cursor-pointer hover:bg-gray-50">
                  <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
                  <span className="flex-1">{c.label}</span><span className="text-xs text-gray-500">{c.hint}</span>
                </label>
              ))}
              {!choices.length && (
                <div className="px-3 py-4 text-gray-500">
                  Nothing to choose.{(type === 'staff_group' || type === 'student_group') && <> <Link className="text-brand-600 underline" href={`/comms/groups?kind=${type === 'staff_group' ? 'staff' : 'student'}`}>Create a group</Link></>}
                </div>
              )}
            </div>
          ) : <div className="text-gray-600">Every active {type === 'all_staff' ? 'staff member' : 'student\'s parent'} with a {channel === 'email' ? 'email address' : 'phone number'}.</div>}
        </div>

        <div className="card p-4 lg:col-span-3 text-sm space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <div><label className="label">Send By</label>
              <select className="input" value={channel} onChange={e => setChannel(e.target.value as any)}>
                <option value="sms">SMS{status && !status.sms ? ' (not configured)' : ''}</option>
                <option value="email">Email{status && !status.email ? ' (not configured)' : ''}</option>
              </select></div>
            <div><label className="label">Template</label>
              <select className="input" defaultValue="" onChange={e => { const t = lists.templates.find(x => String(x.id) === e.target.value); if (t) setBody(t.body || ''); }}>
                <option value="">— Choose a template —</option>
                {lists.templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <Link href="/masters/message-templates" className="text-xs text-brand-600 underline">Manage templates</Link></div>
          </div>
          {channel === 'email' && <div><label className="label">Subject *</label><input className="input" value={subject} onChange={e => setSubject(e.target.value)} /></div>}
          <div>
            <label className="label">Message *</label>
            <textarea className="input" rows={6} maxLength={1000} value={body} onChange={e => setBody(e.target.value)} placeholder="Dear Parent, …  (use {name} for each recipient's name)" />
            <div className="text-xs text-gray-500 mt-1">{body.length}/1000 characters{channel === 'sms' && ` · about ${smsParts} SMS per recipient`} · <code>{'{name}'}</code> becomes each recipient&apos;s name</div>
          </div>
          {err && <div className="text-red-700">{err}</div>}
          <div className="flex gap-2">
            <button className="btn bg-gray-200" onClick={doPreview} disabled={busy}>Preview Recipients</button>
            <button className="btn btn-primary" onClick={send} disabled={busy}>{busy ? 'Sending…' : 'Send'}</button>
          </div>

          {preview && (
            <div className="border rounded p-3">
              <div><b>{preview.recipients.length}</b> will receive it{preview.missing > 0 && <span className="text-amber-700"> · {preview.missing} have no {channel === 'email' ? 'email' : 'phone number'} and will be skipped</span>}</div>
              <ul className="mt-2 max-h-48 overflow-y-auto text-xs divide-y">
                {preview.recipients.map(r => <li key={r.to + r.name} className="py-1 flex justify-between gap-2"><span>{r.name} <span className="text-gray-500">{r.detail}</span></span><span className="font-mono">{r.to}</span></li>)}
              </ul>
            </div>
          )}
          {result && (
            <div className={`border rounded p-3 ${result.failed ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
              {result.configured
                ? <>Sent <b>{result.sent}</b> of {result.total}{result.failed > 0 && <>, <b>{result.failed}</b> failed (resend from the Sent Box)</>}.</>
                : <>Recorded {result.total} message(s) as <b>not configured</b>: nothing was delivered. Resend from the Sent Box once {channel.toUpperCase()} is set up.</>}
              {result.missing > 0 && <> {result.missing} skipped (no contact).</>}
              <div className="mt-1"><Link className="text-brand-600 underline" href={`/comms/sent-box?batch=${result.batch_id}`}>View in Sent Box</Link></div>
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}
