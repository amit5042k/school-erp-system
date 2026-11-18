'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, setToken, setUser } from '@/lib/api';
import { LANGS, getLang, setLang, t } from '@/lib/i18n';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('admin');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('expired')) setError(t('Your session has expired. Please sign in again.'));
    // Students and parents usually sign in on their own phone: keep the "Login As" they used last time.
    try { const last = localStorage.getItem('erp_login_as'); if (last && ['admin', 'teacher', 'student', 'parent'].includes(last)) setRole(last); } catch { /* storage blocked */ }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api<{ token: string; user: any }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password, role }),
      });
      setToken(res.token);
      setUser(res.user);
      try { localStorage.setItem('erp_login_as', role); } catch { /* storage blocked */ }
      // Phones and the installed app open on the phone-first Home screen; computers get the full dashboard.
      const app = navigator.userAgent.includes('SchoolERP-App') || window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(max-width: 640px)').matches;
      router.push(app ? '/home' : '/dashboard');
    } catch (err: any) {
      setError(err.message || t('Login failed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col login-bg">
      {/* Top school strip */}
      <header className="bg-white/95 border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto flex items-center gap-4 px-4 py-3">
          <div className="w-14 h-14 rounded-full bg-brand-600 text-white grid place-items-center font-bold text-xl shadow">
            SE
          </div>
          <div className="flex-1">
            <h1 className="text-brand-700 font-bold text-lg sm:text-xl leading-tight">
              SCHOOL ERP
            </h1>
            <p className="text-xs sm:text-sm text-gray-600">
              {t('School Management System')} &nbsp;|&nbsp; {t('Excellence in Education')}
            </p>
          </div>
          <div className="hidden sm:block text-right">
            <p className="text-xs text-gray-500">Powered by</p>
            <p className="text-sm font-semibold text-brand-600">School ERP</p>
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-4xl grid md:grid-cols-2 bg-white rounded-xl shadow-2xl overflow-hidden">
          {/* Left panel */}
          <div className="hidden md:flex flex-col justify-center bg-gradient-to-br from-brand-700 to-brand-500 text-white p-10">
            <h2 className="text-3xl font-bold mb-3">{t('Welcome Back')}</h2>
            <p className="opacity-90 mb-6 leading-relaxed">
              {t('Sign in to the School ERP portal to access academic records, attendance, fee payments, timetable and announcements.')}
            </p>
            <ul className="space-y-2 text-sm opacity-95">
              <li>✓ {t('Student & Parent portal')}</li>
              <li>✓ {t('Teacher & Staff dashboard')}</li>
              <li>✓ {t('Online attendance and fee management')}</li>
              <li>✓ {t('Timetable & circular notices')}</li>
            </ul>
            <div className="mt-8 text-xs opacity-75 border-t border-white/20 pt-4">
              {t('For login issues, contact the school office (Mon–Sat, 9:00 AM – 3:00 PM).')}
            </div>
          </div>

          {/* Form panel */}
          <div className="p-8 sm:p-10">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-brand-700">{t('User Login')}</h2>
              <p className="text-sm text-gray-600">{t('Please enter your credentials to continue.')}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label" htmlFor="role">{t('Login As')}</label>
                <select id="role" className="input" value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="admin">{t('Administration / Office')}</option>
                  <option value="teacher">{t('Teacher / Staff')}</option>
                  <option value="student">{t('Student')}</option>
                  <option value="parent">{t('Parent')}</option>
                </select>
              </div>

              <div>
                <label className="label" htmlFor="username">{t('User ID')}</label>
                <input
                  id="username"
                  type="text"
                  className="input"
                  placeholder={t('Enter User ID / Admission No.')}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                />
              </div>

              <div>
                <label className="label" htmlFor="password">{t('Password')}</label>
                <input
                  id="password"
                  type="password"
                  className="input"
                  placeholder={t('Enter password')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>

              {error && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-between text-sm">
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" className="rounded border-gray-300" />
                  <span>{t('Remember me')}</span>
                </label>
                <a href="#" className="text-brand-600 hover:underline">{t('Forgot password?')}</a>
              </div>

              <button type="submit" className="btn btn-primary w-full" disabled={loading}>
                {loading ? t('Signing in…') : t('Sign In')}
              </button>
            </form>

            <div className="mt-4 flex justify-center gap-2 text-xs" aria-label="Language">
              {LANGS.map(l => (
                <button key={l.key} type="button" onClick={() => setLang(l.key)}
                  className={`px-2 py-1 rounded border ${getLang() === l.key ? 'bg-brand-600 text-white border-brand-600' : 'text-gray-600 hover:bg-brand-50'}`}>{l.label}</button>
              ))}
            </div>

            <div className="mt-6 border-t pt-4">
              <p className="text-xs text-gray-500 mb-2">{t('Demo credentials')}</p>
              <div className="text-xs text-gray-700 space-y-1">
                <div><b>Admin:</b> admin / admin123</div>
                <div><b>Teacher:</b> ritu / teacher123</div>
                <div><b>Student:</b> ADM2025001 / student123</div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white/95 border-t border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-3 text-xs text-gray-600 flex flex-col sm:flex-row justify-between gap-1">
          <div>© {new Date().getFullYear()} School ERP. All rights reserved.</div>
          <div>School Management System</div>
        </div>
      </footer>
    </div>
  );
}
