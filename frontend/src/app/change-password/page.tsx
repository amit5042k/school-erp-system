'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Shell from '@/components/Shell';
import { api, clearSession } from '@/lib/api';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (next.length < 6) return setMsg({ kind: 'err', text: 'New password must be at least 6 characters.' });
    if (next !== confirm) return setMsg({ kind: 'err', text: 'New passwords do not match.' });
    setBusy(true);
    try {
      await api('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
      setMsg({ kind: 'ok', text: 'Password changed. Please log in again.' });
      setTimeout(() => { clearSession(); router.replace('/login'); }, 1200);
    } catch (e: any) { setMsg({ kind: 'err', text: e.message }); }
    finally { setBusy(false); }
  }

  return (
    <Shell>
      <div className="text-xs text-gray-500 mb-1">Account › Change Password</div>
      <h2 className="text-xl font-bold text-brand-700 mb-4">Change Password</h2>

      <form onSubmit={submit} className="card p-4 max-w-md space-y-3 text-sm">
        <div>
          <label className="label">Current password</label>
          <input type="password" className="input" value={current} onChange={e => setCurrent(e.target.value)} required />
        </div>
        <div>
          <label className="label">New password</label>
          <input type="password" className="input" value={next} onChange={e => setNext(e.target.value)} required minLength={6} />
        </div>
        <div>
          <label className="label">Confirm new password</label>
          <input type="password" className="input" value={confirm} onChange={e => setConfirm(e.target.value)} required />
        </div>
        {msg && <div className={msg.kind === 'ok' ? 'text-green-700' : 'text-red-700'}>{msg.text}</div>}
        <button disabled={busy} className="btn btn-primary">{busy ? 'Updating…' : 'Update Password'}</button>
      </form>
    </Shell>
  );
}
