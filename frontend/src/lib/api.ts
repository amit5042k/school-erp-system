const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:5000/api';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('erp_token');
}

export function setToken(token: string) {
  localStorage.setItem('erp_token', token);
}

export function clearSession() {
  localStorage.removeItem('erp_token');
  localStorage.removeItem('erp_user');
}

export function getUser<T = any>(): T | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('erp_user');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function setUser(user: any) {
  localStorage.setItem('erp_user', JSON.stringify(user));
}

export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  // Expired or disabled session: drop it and go back to login instead of leaving every page erroring.
  if (res.status === 401 && token && typeof window !== 'undefined' && !path.startsWith('/auth/login')) {
    clearSession();
    if (!window.location.pathname.startsWith('/login')) window.location.replace('/login?expired=1');
  }
  if (res.status === 403 && (data as any).code === 'PASSWORD_CHANGE_REQUIRED' && typeof window !== 'undefined'
      && !window.location.pathname.startsWith('/change-password')) {
    window.location.replace('/change-password?required=1');
  }
  if (!res.ok) throw new Error((data as any).error || `Request failed (${res.status})`);
  return data as T;
}

export type UploadedFile = { id: number; url: string; name: string; size: number; mime: string };

/** Upload one or more files (staff only). Returns stored file records whose `url` can be saved on any record. */
export async function upload(files: File | File[] | FileList): Promise<UploadedFile[]> {
  const list = files instanceof File ? [files] : Array.from(files as ArrayLike<File>);
  const form = new FormData();
  for (const f of list) form.append('file', f);
  const token = getToken();
  const res = await fetch(`${API_BASE}/uploads`, { method: 'POST', body: form, headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error || `Upload failed (${res.status})`);
  return data as UploadedFile[];
}

/** Turn a stored link into something the browser can open. Uploaded files are stored as "/api/files/<name>". */
export function fileUrl(u: string | null | undefined): string {
  if (!u) return '';
  if (u.startsWith('/api/')) return API_BASE.replace(/\/api\/?$/, '') + u;
  return u;
}

/** Download rows as a CSV file Excel can open (UTF-8 with BOM so ₹ and Hindi text survive). */
export function downloadCsv(filename: string, columns: { key: string; label: string }[], rows: any[]) {
  const esc = (v: any) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [columns.map(c => esc(c.label)).join(','), ...rows.map(r => columns.map(c => esc(r[c.key])).join(','))].join('\r\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`; a.click();
  URL.revokeObjectURL(url);
}

/** Indian-style money formatting: ₹1,23,456.00 */
export const fmtMoney = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
};

/** Today's date (YYYY-MM-DD) in the browser's timezone. `toISOString()` would give the UTC date. */
export function localDate(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parse a date from the API. SQLite's CURRENT_TIMESTAMP ("YYYY-MM-DD HH:MM:SS") is UTC but has no zone marker. */
export function parseDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(v) ? v.replace(' ', 'T') + 'Z' : v;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const fmtDate = (v: string | null | undefined) => parseDate(v)?.toLocaleDateString() ?? '—';
export const fmtDateTime = (v: string | null | undefined) => parseDate(v)?.toLocaleString() ?? '—';
