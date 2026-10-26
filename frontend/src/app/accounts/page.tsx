'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import ExploreOptions from '@/components/ExploreOptions';
import { api } from '@/lib/api';
import { balText, inr } from './_ui';

type Summary = {
  fy: string;
  cash: { id: number; name: string; balance: number }[];
  bank: { id: number; name: string; balance: number }[];
  today: { receipts: number; payments: number };
  vouchers_this_fy: number;
  unposted: { receipts: number; salaries: number };
};

function Card({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: string }) {
  return (
    <div className={`rounded-lg p-4 text-white shadow ${tone}`}>
      <div className="text-xs uppercase tracking-wide opacity-90">{label}</div>
      <div className="text-xl font-bold mt-1">{value}</div>
      {sub && <div className="text-xs opacity-90 mt-1">{sub}</div>}
    </div>
  );
}

export default function AccountsHome() {
  const [s, setS] = useState<Summary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api<Summary>('/accounts/summary').then(setS).catch(e => setErr(e.message)); }, []);

  const cash = s?.cash.reduce((a, l) => a + l.balance, 0) ?? 0;
  const bank = s?.bank.reduce((a, l) => a + l.balance, 0) ?? 0;
  const unposted = (s?.unposted.receipts || 0) + (s?.unposted.salaries || 0);

  return (
    <Shell>
      {err && <div className="text-red-700 text-sm mb-3">{err}</div>}
      {s && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <Card label="Cash in Hand" value={balText(cash)} sub={s.cash.map(l => l.name).join(', ')} tone="bg-gradient-to-br from-green-600 to-green-500" />
          <Card label="Bank Balance" value={balText(bank)} sub={`${s.bank.length} account(s)`} tone="bg-gradient-to-br from-brand-700 to-brand-600" />
          <Card label="Received Today" value={`₹${inr(s.today.receipts)}`} sub={`Paid today ₹${inr(s.today.payments)}`} tone="bg-gradient-to-br from-teal-600 to-teal-500" />
          <Card label={`Vouchers ${s.fy}`} value={String(s.vouchers_this_fy)} sub="Financial year April–March" tone="bg-gradient-to-br from-amber-600 to-amber-500" />
        </div>
      )}
      {s && unposted > 0 && (
        <div className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded px-3 py-2 mb-4">
          {s.unposted.receipts} fee receipt(s) and {s.unposted.salaries} salary payment(s) are not in the books yet.{' '}
          <Link href="/accounts/settings" className="underline font-semibold">Post them now</Link>
        </div>
      )}

      <ExploreOptions
        icon="📒"
        title="Accounts"
        subtitle="Vouchers, Books & Tally — Explore Options"
        breadcrumb={['Dashboard', 'Accounts']}
        columns={3}
        groups={[
          { title: 'Vouchers', actions: [
            { label: 'Receipt Voucher', href: '/accounts/voucher?type=receipt' },
            { label: 'Payment Voucher', href: '/accounts/voucher?type=payment' },
            { label: 'Contra Voucher', href: '/accounts/voucher?type=contra' },
            { label: 'Journal Voucher', href: '/accounts/voucher?type=journal' },
            { label: 'Voucher List / Search', href: '/accounts/vouchers' },
          ]},
          { title: 'Books', actions: [
            { label: 'Day Book', href: '/report/acc-day-book' },
            { label: 'Cash Book', href: '/report/acc-cash-book' },
            { label: 'Bank Book', href: '/report/acc-bank-book' },
            { label: 'Ledger Statement', href: '/report/acc-ledger' },
          ]},
          { title: 'Final Reports', actions: [
            { label: 'Trial Balance', href: '/report/acc-trial-balance' },
            { label: 'Income & Expenditure', href: '/report/acc-income-expenditure' },
            { label: 'Receipts & Payments', href: '/report/acc-receipts-payments' },
            { label: 'Balance Sheet', href: '/report/acc-balance-sheet' },
            { label: 'Monthly Expenses by Head', href: '/report/acc-expense-monthly' },
          ]},
          { title: 'Masters', actions: [
            { label: 'Chart of Accounts', href: '/accounts/ledgers' },
            { label: 'Add Ledger', href: '/accounts/ledgers?add=1' },
          ]},
          { title: 'Settings & Export', actions: [
            { label: 'Auto-Posting & Settings', href: '/accounts/settings' },
            { label: 'Post Fee Receipts & Salaries', href: '/accounts/settings#sync' },
            { label: 'Tally Export', href: '/accounts/tally' },
          ]},
        ]}
      />
    </Shell>
  );
}
