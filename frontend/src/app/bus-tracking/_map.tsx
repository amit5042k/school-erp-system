'use client';

import { useEffect, useRef, useState } from 'react';

export { Flash, useFlash, when } from '../online-tests/_ui';

// Leaflet is loaded from the CDN on first use, so it adds nothing to other pages.
const LEAFLET = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet';
let loading: Promise<any> | null = null;

export function loadLeaflet(): Promise<any> {
  const w = window as any;
  if (w.L) return Promise.resolve(w.L);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = `${LEAFLET}.css`;
    document.head.appendChild(css);
    const js = document.createElement('script');
    js.src = `${LEAFLET}.js`;
    js.async = true;
    js.onload = () => resolve(w.L);
    js.onerror = () => { loading = null; reject(new Error('Could not load the map. Check the internet connection.')); };
    document.head.appendChild(js);
  });
  return loading;
}

const DEFAULT_CENTER: [number, number] = [22.97, 78.66]; // India

/** A Leaflet map with OpenStreetMap tiles. Returns the map once ready (null until then). */
export function useLeafletMap(height = 480) {
  const ref = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let m: any;
    loadLeaflet().then(L => {
      if (!ref.current) return;
      m = L.map(ref.current).setView(DEFAULT_CENTER, 5);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(m);
      setMap(m);
    }).catch(e => setError(e.message));
    return () => { if (m) m.remove(); };
  }, []);
  const el = <div ref={ref} style={{ height }} className="w-full rounded border z-0" />;
  return { el, map, error, L: typeof window !== 'undefined' ? (window as any).L : null };
}

export const busIcon = (L: any, label: string, mine = false) => L.divIcon({
  className: '',
  html: `<div style="background:${mine ? '#16a34a' : '#1d4ed8'};color:#fff;border-radius:6px;padding:2px 6px;font:600 11px sans-serif;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.4)">🚌 ${label.replace(/[<>&"]/g, '')}</div>`,
  iconAnchor: [20, 10],
});

export const stopIcon = (L: any, mine = false) => L.divIcon({
  className: '',
  html: `<div style="width:12px;height:12px;border-radius:50%;background:${mine ? '#f59e0b' : '#fff'};border:3px solid ${mine ? '#b45309' : '#475569'}"></div>`,
  iconAnchor: [9, 9],
});

export const ago = (iso?: string | null) => {
  if (!iso) return 'no position yet';
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`;
};

export const escapeHtml = (s: string) => s.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c] as string));
