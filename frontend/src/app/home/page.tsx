'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Shell from '@/components/Shell';
import { api, fmtDateTime, fmtMoney, getStoredUser, localDate } from '@/lib/api';
import { t as tr } from '@/lib/i18n';

type Level = 'none' | 'standard' | 'full';
type User = {
  fullName?: string; role: string; baseRole?: string; roleKey?: string | null; roleName?: string;
  perms?: Record<string, Level> | null;
};
// `area` hides a tile when the role has no access to that area; tiles without one are self-service.
type Tile = { label: string; href: string; icon: string; area?: string };
type Stat = { label: string; value: string; href?: string; tone: string };
type InboxItem = { id: number; title: string; body: string; link: string | null; read_at: string | null; created_at: string };

const T = {
  approveLeaves: { label: 'Approve Leaves', href: '/leaves', icon: '✅', area: 'hr' },
  studentAttendance: { label: 'Attendance Report', href: '/report/student-attendance', icon: '📋', area: 'attendance' },
  markAttendance: { label: 'Mark Attendance', href: '/attendance', icon: '✔️', area: 'attendance' },
  staffAttendance: { label: 'Staff Attendance', href: '/hr/staff-attendance', icon: '🕘', area: 'hr' },
  feeSubmission: { label: 'Fee Submission', href: '/finance/collect', icon: '💳', area: 'finance' },
  pendingFees: { label: 'Pending Fees', href: '/report/fee-pending', icon: '⏳', area: 'finance' },
  daywise: { label: 'Daywise Collection', href: '/report/fee-daywise-collection', icon: '📈', area: 'finance' },
  ledger: { label: 'Student Ledger', href: '/finance/ledger', icon: '📒', area: 'finance' },
  cheques: { label: 'Cheques', href: '/finance/cheques', icon: '🧾', area: 'finance' },
  reconciliation: { label: 'Reconciliation', href: '/finance/reconciliation', icon: '🏦', area: 'finance' },
  payroll: { label: 'Payroll', href: '/payroll', icon: '💰', area: 'payroll' },
  myPayslips: { label: 'My Payslips', href: '/payroll', icon: '💰' },
  myAttendance: { label: 'My Attendance', href: '/my-attendance', icon: '🕘' },
  notices: { label: 'Notices', href: '/announcements', icon: '📣' },
  sendMessage: { label: 'Send SMS', href: '/comms/compose?mode=many', icon: '💬', area: 'communication' },
  publish: { label: 'Publish Results', href: '/exams/publish', icon: '🏆', area: 'academics' },
  reportCards: { label: 'Report Cards', href: '/exams/report-card', icon: '📄', area: 'academics' },
  marksEntry: { label: 'Marks Entry', href: '/marks', icon: '📝', area: 'academics' },
  timetable: { label: 'Timetable', href: '/timetable', icon: '🗓️' },
  myTimetable: { label: 'My Timetable', href: '/timetable', icon: '🗓️' },
  substitution: { label: 'Substitution', href: '/academic-comm/substitution', icon: '🔁', area: 'academic-comm' },
  planner: { label: 'Weekly Planner', href: '/exams/weekly-planner', icon: '🧭', area: 'academics' },
  homework: { label: 'Homework', href: '/homework', icon: '📚', area: 'academic-comm' },
  diary: { label: 'School Diary', href: '/academic-comm/diary', icon: '📔', area: 'academic-comm' },
  onlineClasses: { label: 'Online Classes', href: '/academic-comm/online-classes', icon: '🎥', area: 'academic-comm' },
  applyLeave: { label: 'Apply Leave', href: '/leaves', icon: '🏖️' },
  users: { label: 'Users & Logins', href: '/users', icon: '🔐', area: 'administration' },
  roles: { label: 'Roles & Permissions', href: '/roles', icon: '🛡️', area: 'administration' },
  devices: { label: 'Biometric Devices', href: '/hr/biometric-devices', icon: '🖐️', area: 'hr' },
  backups: { label: 'Backups', href: '/backups', icon: '💾', area: 'administration' },
  activityLog: { label: 'Activity Log', href: '/report/staff-activity-log', icon: '🕵️', area: 'administration' },
  loginStats: { label: 'Login Statistics', href: '/report/app-usage', icon: '📱', area: 'administration' },
  sendLogins: { label: 'Send Login Details', href: '/send-credentials', icon: '✉️', area: 'administration' },
  settings: { label: 'Settings', href: '/settings', icon: '⚙️', area: 'administration' },
  visitors: { label: 'Visitors', href: '/visitors', icon: '🚪', area: 'front-office' },
  enquiries: { label: 'Enquiries', href: '/enquiries', icon: '❓', area: 'students' },
  admission: { label: 'Admission', href: '/students/admission', icon: '🎓', area: 'students' },
  manageStudents: { label: 'Students', href: '/students/manage', icon: '👤', area: 'students' },
  prospectus: { label: 'Prospectus', href: '/prospectus', icon: '📃', area: 'students' },
  tc: { label: 'Transfer Certificate', href: '/students/tc', icon: '📜', area: 'students' },
  calls: { label: 'Call Log', href: '/calls', icon: '📞', area: 'front-office' },
  postal: { label: 'Postal', href: '/postal', icon: '📮', area: 'front-office' },
  complaints: { label: 'Complaints', href: '/complaints', icon: '⚠️', area: 'front-office' },
  stock: { label: 'Store Stock', href: '/inventory', icon: '📦', area: 'inventory' },
  itemRequests: { label: 'Item Requests', href: '/inventory/requests', icon: '📦' },
  calendar: { label: 'Calendar', href: '/calendar', icon: '📅' },
  suggestions: { label: 'Suggestion Box', href: '/suggestions', icon: '💡' },
  fees: { label: 'Fees', href: '/fees', icon: '₹' },
  marks: { label: 'Marks', href: '/marks', icon: '📝' },
  reportCard: { label: 'Report Card', href: '/exams/report-card', icon: '📄' },
  surveys: { label: 'Surveys', href: '/surveys', icon: '🗳️' },
} satisfies Record<string, Tile>;

const TILES: Record<string, Tile[]> = {
  principal: [T.approveLeaves, T.studentAttendance, T.daywise, T.pendingFees, T.notices, T.sendMessage, T.publish, T.staffAttendance, T.myAttendance],
  admin: [T.approveLeaves, T.studentAttendance, T.daywise, T.pendingFees, T.notices, T.users, T.publish, T.backups],
  'academic-coordinator': [T.timetable, T.marksEntry, T.publish, T.reportCards, T.substitution, T.homework, T.markAttendance, T.planner, T.myAttendance],
  'it-head': [T.users, T.roles, T.devices, T.backups, T.activityLog, T.loginStats, T.sendLogins, T.settings, T.myAttendance],
  'office-superintendent': [T.visitors, T.enquiries, T.admission, T.approveLeaves, T.staffAttendance, T.notices, T.postal, T.complaints, T.myAttendance],
  clerk: [T.admission, T.manageStudents, T.visitors, T.enquiries, T.prospectus, T.calls, T.postal, T.tc, T.myAttendance],
  accountant: [T.feeSubmission, T.pendingFees, T.daywise, T.ledger, T.cheques, T.payroll, T.reconciliation, T.stock, T.myAttendance],
  teacher: [T.markAttendance, T.marksEntry, T.homework, T.diary, T.myTimetable, T.applyLeave, T.onlineClasses, T.myPayslips, T.myAttendance],
  staff: [T.applyLeave, T.myPayslips, T.notices, T.calendar, T.itemRequests, T.suggestions, T.myAttendance],
  student: [T.fees, T.marks, T.homework, T.diary, T.timetable, T.notices, T.onlineClasses, T.calendar],
  parent: [T.fees, T.marks, T.reportCard, T.homework, T.diary, T.notices, T.surveys, T.suggestions],
};

function profileOf(u: User): string {
  const base = u.baseRole || u.role;
  if (base === 'admin') return 'admin';
  if (base === 'student' || base === 'parent') return base;
  return u.roleKey && TILES[u.roleKey] ? u.roleKey : 'teacher';
}

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

export default function HomePage() {
  const [user, setUserState] = useState<User | null>(null);
  const [stats, setStats] = useState<Stat[]>([]);
  const [inbox, setInbox] = useState<{ unread: number; items: InboxItem[] }>({ unread: 0, items: [] });

  useEffect(() => { setUserState(getStoredUser<User>()); }, []);
  const profile = user ? profileOf(user) : null;

  const tiles = useMemo(() => {
    if (!user || !profile) return [];
    const perms = user.perms;
    // Hide tiles for areas this role can't open (staff roles only; admin/student/parent lists are fixed).
    return TILES[profile].filter(t => !perms || !t.area || (perms[t.area] && perms[t.area] !== 'none'));
  }, [user, profile]);

  useEffect(() => {
    if (!profile) return;
    api<{ unread: number; items: InboxItem[] }>('/push/inbox?limit=5').then(setInbox).catch(() => {});
    loadStats(profile, user!).then(setStats).catch(() => setStats([]));
  }, [profile, user]);

  if (!user) return <Shell><div className="text-gray-500">{tr('Loading…')}</div></Shell>;

  return (
    <Shell>
      <div className="max-w-3xl mx-auto">
        <div className="mb-4">
          <div className="text-sm text-gray-500">{tr(greeting() + ',')}</div>
          <h1 className="text-2xl font-bold text-brand-700 leading-tight">{user.fullName || tr('Welcome')}</h1>
          <div className="text-xs text-gray-500 mt-0.5">{tr(user.roleName || roleLabel(profile!))}</div>
        </div>

        {stats.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            {stats.map(s => {
              const body = (
                <div className={`rounded-xl p-3 text-white shadow-sm ${s.tone}`}>
                  <div className="text-[11px] uppercase tracking-wide opacity-90">{tr(s.label)}</div>
                  <div className="text-xl font-bold mt-0.5">{s.value}</div>
                </div>
              );
              return s.href ? <Link key={s.label} href={s.href}>{body}</Link> : <div key={s.label}>{body}</div>;
            })}
          </div>
        )}

        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mb-6">
          {tiles.map(t => (
            <Link key={t.label} href={t.href}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm active:scale-95 transition p-3 flex flex-col items-center justify-center text-center min-h-[96px]">
              <span className="text-3xl leading-none mb-2" aria-hidden>{t.icon}</span>
              <span className="text-[13px] font-medium text-gray-700 leading-tight">{tr(t.label)}</span>
            </Link>
          ))}
        </div>

        <div className="card p-0 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h2 className="font-semibold text-brand-700">
              {tr('Notifications')} {inbox.unread > 0 && <span className="badge badge-amber ml-1">{inbox.unread} {tr('new')}</span>}
            </h2>
            <Link href="/notifications" className="text-sm text-brand-600">{tr('See all')}</Link>
          </div>
          {inbox.items.map(n => (
            <Link key={n.id} href={n.link || '/notifications'} onClick={() => { if (!n.read_at) api(`/push/inbox/${n.id}/read`, { method: 'POST' }).catch(() => {}); }}
              className={`block px-4 py-3 border-b last:border-b-0 ${n.read_at ? '' : 'bg-brand-50/60'}`}>
              <div className="flex justify-between gap-3">
                <span className={`text-sm ${n.read_at ? 'text-gray-700' : 'font-semibold text-gray-900'}`}>{n.title}</span>
                <span className="text-[11px] text-gray-400 whitespace-nowrap">{fmtDateTime(n.created_at)}</span>
              </div>
              <div className="text-sm text-gray-600 mt-0.5">{n.body}</div>
            </Link>
          ))}
          {!inbox.items.length && <div className="px-4 py-6 text-center text-sm text-gray-500">{tr('No notifications yet.')}</div>}
        </div>
      </div>
    </Shell>
  );
}

function roleLabel(p: string) {
  return ({
    admin: 'Super Admin', principal: 'Principal', 'academic-coordinator': 'Academic Coordinator', 'it-head': 'IT Head',
    'office-superintendent': 'Office Superintendent', clerk: 'Clerk', accountant: 'Accountant', teacher: 'Teacher',
    staff: 'Staff', student: 'Student', parent: 'Parent',
  } as Record<string, string>)[p] || 'User';
}

// Today's numbers for the role, from endpoints that role can already read. Failures just hide a card.
async function loadStats(profile: string, user: User): Promise<Stat[]> {
  const out: Stat[] = [];
  const safe = async <X,>(p: Promise<X>) => { try { return await p; } catch { return null; } };
  const canFinance = profile === 'admin' || profile === 'principal' || profile === 'accountant' || user.perms?.finance === 'full';

  if (profile === 'student' || profile === 'parent') {
    const d = await safe(api<any>('/dashboard'));
    if (d?.attendance?.total) out.push({ label: 'Attendance', value: `${Math.round((d.attendance.present / d.attendance.total) * 100)}%`, tone: 'bg-teal-600' });
    if (Array.isArray(d?.fees)) {
      const due = d.fees.reduce((a: number, f: any) => a + Math.max(0, (Number(f.amount) || 0) - (Number(f.paid) || 0)), 0);
      out.push({ label: 'Fee Due', value: fmtMoney(due), href: '/fees', tone: due > 0 ? 'bg-amber-600' : 'bg-green-600' });
    }
    return out;
  }

  const [dash, notif] = await Promise.all([safe(api<any>('/dashboard')), safe(api<any>('/notifications/summary'))]);
  const t = dash?.totals;
  if (t && profile !== 'accountant' && profile !== 'it-head' && profile !== 'staff') {
    out.push({ label: 'Present Today', value: String(t.present_today ?? 0), tone: 'bg-green-600' });
    out.push({ label: 'Absent Today', value: String(t.absent_today ?? 0), tone: 'bg-red-600' });
  }
  const leaves = notif?.items?.find((i: any) => i.key === 'leaves');
  if (leaves) out.push({ label: leaves.label, value: String(leaves.count), href: '/leaves', tone: 'bg-amber-600' });

  if (canFinance) {
    const today = localDate();
    const r = await safe(api<any>(`/report/fee-daywise-collection?from=${today}&to=${today}`));
    if (r?.rows) {
      const col = r.columns?.find((c: any) => c.type === 'money' && c.total)?.key;
      const sum = col ? r.rows.reduce((a: number, row: any) => a + (Number(row[col]) || 0), 0) : 0;
      out.push({ label: 'Collected Today', value: fmtMoney(sum), href: '/report/fee-daywise-collection', tone: 'bg-brand-600' });
    }
    if (t?.fees_pending != null) out.push({ label: 'Fees Pending', value: fmtMoney(t.fees_pending), href: '/report/fee-pending', tone: 'bg-orange-600' });
  }
  if (profile === 'it-head') {
    const s = await safe(api<any>('/push/status'));
    if (s?.users_with_app != null) out.push({ label: 'Using the App', value: String(s.users_with_app), tone: 'bg-brand-600' });
  }
  return out.slice(0, 4);
}
