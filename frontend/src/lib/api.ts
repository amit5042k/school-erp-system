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
  return raw ? JSON.parse(raw) : null;
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
  if (!res.ok) throw new Error((data as any).error || `Request failed (${res.status})`);
  return data as T;
}
