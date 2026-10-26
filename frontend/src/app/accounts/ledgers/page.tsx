'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';
import { Flash, PageTitle, balText, inr, useFlash, useLedgers, type Ledger } from '../_ui';

type Group = { id: number; name: string; nature: 'asset' | 'liability' | 'income' | 'expense'; tally_parent: string; builtin: number; ledgers: number };
const NATURES: { key: Group['nature']; label: string }[] = [
  { key: 'asset', label: 'Assets' }, { key: 'liability', label: 'Liabilities & Funds' }, { key: 'income', label: 'Income' }, { key: 'expense', label: 'Expenses' },
];
const EMPTY = { id: 0, name: '', group_id: '', opening_balance: '0', opening_type: 'Dr', pan: '', gstin: '', bank_account: '', ifsc: '', notes: '', active: true };

export default function ChartOfAccounts({ searchParams }: { searchParams: { add?: string } }) {
  const { ledgers, reload } = useLedgers(true);
  const [groups, setGroups] = useState<Group[]>([]);
  const [parents, setParents] = useState<Record<string, string[]>>({});
  const [form, setForm] = useState<typeof EMPTY | null>(searchParams.add ? { ...EMPTY } : null);
  const [gForm, setGForm] = useState<{ id: number; name: string; nature: Group['nature']; tally_parent: string } | null>(null);
  const [q, setQ] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const { msg, flash } = useFlash();

  const loadGroups = () => api<{ groups: Group[]; tally_parents: Record<string, string[]> }>('/accounts/groups')
    .then(r => { setGroups(r.groups); setParents(r.tally_parents); }).catch(e => flash(e.message, false));
  useEffect(() => { loadGroups(); /* eslint-disable-next-line */ }, []);

  const shown = useMemo(() => ledgers.filter(l => (showInactive || l.active) && (!q || `${l.name} ${l.group_name}`.toLowerCase().includes(q.toLowerCase()))), [ledgers, q, showInactive]);

  function edit(l: Ledger) {
    setForm({ id: l.id, name: l.name, group_id: String(l.group_id), opening_balance: String(l.opening_balance), opening_type: l.opening_type,
      pan: l.pan || '', gstin: l.gstin || '', bank_account: l.bank_account || '', ifsc: l.ifsc || '', notes: l.notes || '', active: !!l.active });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function saveLedger(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const { id, ...body } = form;
    try {
      await api(id ? `/accounts/ledgers/${id}` : '/accounts/ledgers', { method: id ? 'PUT' : 'POST', body: JSON.stringify({ ...body, group_id: Number(body.group_id), opening_balance: Number(body.opening_balance) || 0 }) });
      flash(id ? 'Ledger saved.' : 'Ledger added.'); setForm(null); reload(); loadGroups();
    } catch (e: any) { flash(e.message, false); }
  }
  async function removeLedger(l: Ledger) {
    if (!confirm(`Delete ledger "${l.name}"?`)) return;
    try { await api(`/accounts/ledgers/${l.id}`, { method: 'DELETE' }); flash('Ledger deleted.'); reload(); loadGroups(); }
    catch (e: any) { flash(e.message, false); }
  }
  async function saveGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!gForm) return;
    const { id, ...body } = gForm;
    try {
      await api(id ? `/accounts/groups/${id}` : '/accounts/groups', { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) });
      flash(id ? 'Group saved.' : 'Group added.'); setGForm(null); loadGroups();
    } catch (e: any) { flash(e.message, false); }
  }
  async function removeGroup(g: Group) {
    if (!confirm(`Delete group "${g.name}"?`)) return;
    try { await api(`/accounts/groups/${g.id}`, { method: 'DELETE' }); flash('Group deleted.'); loadGroups(); }
    catch (e: any) { flash(e.message, false); }
  }

  const opening = ledgers.reduce((a, l) => a + (l.opening_type === 'Cr' ? -l.opening_balance : l.opening_balance), 0);

  return (
    <Shell>
      <PageTitle crumb="Chart of Accounts" title="Chart of Accounts" sub="Groups and ledgers with their current balances."
        right={<div className="flex gap-2">
          <button className="btn btn-primary text-sm" onClick={() => setForm({ ...EMPTY })}>+ Add Ledger</button>
          <button className="btn bg-gray-200 text-sm" onClick={() => setGForm({ id: 0, name: '', nature: 'expense', tally_parent: 'Indirect Expenses' })}>+ Add Group</button>
        </div>} />
      <Flash msg={msg} />
      {Math.round(opening * 100) !== 0 && (
        <div className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded px-3 py-2 mb-3">
          Opening balances differ by {balText(opening)}. Total Dr and Cr opening balances should be equal; the difference shows in the Trial Balance.
        </div>
      )}

      {form && (
        <form onSubmit={saveLedger} className="card p-4 mb-4 grid md:grid-cols-4 gap-3 text-sm">
          <div className="md:col-span-4 font-semibold text-brand-700">{form.id ? 'Edit Ledger' : 'Add Ledger'}</div>
          <div className="md:col-span-2"><label className="label">Ledger Name *</label><input className="input" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div className="md:col-span-2"><label className="label">Group *</label>
            <select className="input" required value={form.group_id} onChange={e => setForm({ ...form, group_id: e.target.value })}>
              <option value="">-- Select --</option>
              {NATURES.map(n => <optgroup key={n.key} label={n.label}>{groups.filter(g => g.nature === n.key).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</optgroup>)}
            </select></div>
          <div><label className="label">Opening Balance ₹</label><input className="input" inputMode="decimal" value={form.opening_balance} onChange={e => setForm({ ...form, opening_balance: e.target.value.replace(/[^0-9.]/g, '') })} /></div>
          <div><label className="label">Dr / Cr</label><select className="input" value={form.opening_type} onChange={e => setForm({ ...form, opening_type: e.target.value })}><option>Dr</option><option>Cr</option></select></div>
          <div><label className="label">PAN</label><input className="input uppercase" value={form.pan} onChange={e => setForm({ ...form, pan: e.target.value })} /></div>
          <div><label className="label">GSTIN</label><input className="input uppercase" value={form.gstin} onChange={e => setForm({ ...form, gstin: e.target.value })} /></div>
          <div><label className="label">Bank A/c No (bank ledgers)</label><input className="input" value={form.bank_account} onChange={e => setForm({ ...form, bank_account: e.target.value })} /></div>
          <div><label className="label">IFSC</label><input className="input uppercase" value={form.ifsc} onChange={e => setForm({ ...form, ifsc: e.target.value })} /></div>
          <div className="md:col-span-2"><label className="label">Notes</label><input className="input" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          {!!form.id && <label className="flex items-center gap-2"><input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} /> Active</label>}
          <div className="md:col-span-4 flex gap-2"><button className="btn btn-primary">Save Ledger</button><button type="button" className="btn bg-gray-200" onClick={() => setForm(null)}>Cancel</button></div>
        </form>
      )}

      {gForm && (
        <form onSubmit={saveGroup} className="card p-4 mb-4 grid md:grid-cols-4 gap-3 text-sm">
          <div className="md:col-span-4 font-semibold text-brand-700">{gForm.id ? 'Edit Group' : 'Add Group'}</div>
          <div className="md:col-span-2"><label className="label">Group Name *</label><input className="input" required value={gForm.name} onChange={e => setGForm({ ...gForm, name: e.target.value })} /></div>
          <div><label className="label">Nature</label>
            <select className="input" value={gForm.nature} onChange={e => { const nature = e.target.value as Group['nature']; setGForm({ ...gForm, nature, tally_parent: parents[nature]?.[0] || '' }); }}>
              {NATURES.map(n => <option key={n.key} value={n.key}>{n.label}</option>)}</select></div>
          <div><label className="label">Tally Group</label>
            <select className="input" value={gForm.tally_parent} onChange={e => setGForm({ ...gForm, tally_parent: e.target.value })}>
              {(parents[gForm.nature] || []).map(p => <option key={p}>{p}</option>)}</select></div>
          <div className="md:col-span-4 flex gap-2"><button className="btn btn-primary">Save Group</button><button type="button" className="btn bg-gray-200" onClick={() => setGForm(null)}>Cancel</button></div>
        </form>
      )}

      <div className="flex flex-wrap gap-3 items-center mb-3 text-sm">
        <input className="input max-w-xs" placeholder="Search ledgers…" value={q} onChange={e => setQ(e.target.value)} />
        <label className="flex items-center gap-2"><input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} /> Show inactive</label>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {NATURES.map(n => (
          <div key={n.key} className="card p-0 overflow-hidden">
            <div className="bg-brand-600 text-white text-sm font-semibold px-3 py-2">{n.label}</div>
            {groups.filter(g => g.nature === n.key).map(g => {
              const ls = shown.filter(l => l.group_id === g.id);
              if (q && !ls.length) return null;
              const sum = ls.reduce((a, l) => a + l.balance, 0);
              return (
                <div key={g.id} className="border-b last:border-b-0">
                  <div className="flex justify-between items-center px-3 py-1.5 bg-brand-50 text-sm">
                    <span className="font-semibold text-brand-700">{g.name} <span className="text-[11px] text-gray-500 font-normal">→ Tally: {g.tally_parent}</span></span>
                    <span className="flex gap-3 items-center text-xs">
                      {ls.length > 0 && <span className="font-semibold">{balText(sum)}</span>}
                      {!g.builtin && <button className="text-brand-600 hover:underline" onClick={() => setGForm({ id: g.id, name: g.name, nature: g.nature, tally_parent: g.tally_parent })}>Edit</button>}
                      {!g.builtin && !g.ledgers && <button className="text-red-600 hover:underline" onClick={() => removeGroup(g)}>Delete</button>}
                    </span>
                  </div>
                  {ls.map(l => (
                    <div key={l.id} className={`flex justify-between items-center px-3 py-1 text-sm ${l.active ? '' : 'opacity-50'}`}>
                      <span>{l.name}{l.system_key && <span className="badge badge-gray ml-1" title="Used for automatic posting">auto</span>}</span>
                      <span className="flex gap-3 items-center text-xs">
                        <Link className="font-mono text-gray-700 hover:underline" href={`/report/acc-ledger?ledger_id=${l.id}`} title="Ledger statement">{l.balance ? balText(l.balance) : '—'}</Link>
                        <button className="text-brand-600 hover:underline" onClick={() => edit(l)}>Edit</button>
                        {!l.in_use && !l.system_key && <button className="text-red-600 hover:underline" onClick={() => removeLedger(l)}>Delete</button>}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-500 mt-3">Balances are as on today, including opening balances. Click a balance for the ledger statement. Total ledgers: {ledgers.length} · opening Dr ₹{inr(ledgers.filter(l => l.opening_type === 'Dr').reduce((a, l) => a + l.opening_balance, 0))} · opening Cr ₹{inr(ledgers.filter(l => l.opening_type === 'Cr').reduce((a, l) => a + l.opening_balance, 0))}</p>
    </Shell>
  );
}
