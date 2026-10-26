'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import Shell from '@/components/Shell';
import { api, getUser } from '@/lib/api';
import { Flash, ago, busIcon, escapeHtml, stopIcon, useFlash, useLeafletMap, when } from './_map';

type Trip = { id: number; vehicle_no: string; route_id: number | null; route_name: string | null; direction: string; started_at: string;
  driver: string | null; driver_phone: string | null; lat: number | null; lng: number | null; speed: number | null; last_at: string | null };
type Stop = { id: number | null; name: string; lat: number | null; lng: number | null };
type Live = { trips: Trip[]; routes: { id: number; name: string; stops: Stop[] }[]; my_stop: string | null; message?: string };

const POLL_MS = 15000;

export default function BusTrackingPage() {
  const user = getUser<any>();
  const staff = user && !['student', 'parent'].includes(user.role);
  const [live, setLive] = useState<Live | null>(null);
  const [follow, setFollow] = useState<number | null>(null);
  const { el, map, error, L } = useLeafletMap(520);
  const layers = useRef<any>(null);
  const fitted = useRef(false);
  const { msg, flash } = useFlash();

  useEffect(() => {
    let stop = false;
    const tick = () => api<Live>('/bus-tracking/live').then(r => { if (!stop) setLive(r); }).catch(e => flash(e.message, false));
    tick();
    const t = setInterval(tick, POLL_MS);
    return () => { stop = true; clearInterval(t); };
    /* eslint-disable-next-line */
  }, []);

  // Redraw buses, trails and stops whenever new positions arrive.
  useEffect(() => {
    if (!map || !L || !live) return;
    let cancelled = false;
    (async () => {
      const trails = await Promise.all(live.trips.map(t => api<{ lat: number; lng: number }[]>(`/bus-tracking/trips/${t.id}/trail`).catch(() => [])));
      if (cancelled) return;
      if (layers.current) layers.current.remove();
      const g = L.layerGroup().addTo(map);
      layers.current = g;
      const pts: [number, number][] = [];
      const myStop = (live.my_stop || '').trim().toLowerCase();
      for (const r of live.routes) for (const s of r.stops) {
        if (s.lat == null || s.lng == null) continue;
        const mine = !!myStop && s.name.trim().toLowerCase() === myStop;
        L.marker([s.lat, s.lng], { icon: stopIcon(L, mine) }).bindTooltip(escapeHtml(`${s.name}${mine ? ' (your stop)' : ''}`)).addTo(g);
        pts.push([s.lat, s.lng]);
      }
      live.trips.forEach((t, i) => {
        const trail = trails[i].map(p => [p.lat, p.lng]);
        if (trail.length > 1) L.polyline(trail, { color: '#2563eb', weight: 4, opacity: 0.6 }).addTo(g);
        if (t.lat == null || t.lng == null) return;
        L.marker([t.lat, t.lng], { icon: busIcon(L, t.vehicle_no, !staff) })
          .bindPopup(escapeHtml(`${t.vehicle_no} · ${t.route_name || 'No route'} (${t.direction})`) + `<br/>Updated ${ago(t.last_at)}`
            + (t.speed != null ? `<br/>${Math.round(t.speed * 3.6)} km/h` : '')).addTo(g);
        pts.push([t.lat, t.lng]);
      });
      const target = live.trips.find(t => t.id === follow && t.lat != null);
      if (target) map.setView([target.lat, target.lng], Math.max(map.getZoom(), 15));
      else if (!fitted.current && pts.length) { map.fitBounds(pts, { padding: [40, 40], maxZoom: 16 }); fitted.current = true; }
    })();
    return () => { cancelled = true; };
  }, [map, L, live, follow, staff]);

  return (
    <Shell>
      <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
        <div>
          <h2 className="text-xl font-bold text-brand-700">Bus Tracking</h2>
          <p className="text-sm text-gray-500">{staff ? 'All buses on a trip right now.' : user?.role === 'parent' ? 'Live position of your child\'s school bus.' : 'Live position of your school bus.'} Refreshes every 15 seconds.</p>
        </div>
        {staff && (
          <div className="flex gap-2">
            <Link href="/bus-tracking/driver" className="btn btn-primary text-sm">Driver: Start Trip</Link>
            {user?.role === 'admin' && <Link href="/bus-tracking/stops" className="btn bg-gray-200 text-sm">Stop Locations</Link>}
          </div>
        )}
      </div>
      <Flash msg={msg} />
      {error && <div className="text-red-700 text-sm mb-2">{error}</div>}
      {live?.message && <div className="card p-4 mb-3 text-sm text-gray-600">{live.message}</div>}
      <div className="grid lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3">{el}</div>
        <div className="space-y-2">
          {live?.trips.map(t => (
            <button key={t.id} onClick={() => setFollow(f => (f === t.id ? null : t.id))}
              className={`card p-3 w-full text-left text-sm ${follow === t.id ? 'ring-2 ring-brand-600' : ''}`}>
              <div className="flex justify-between"><span className="font-semibold text-brand-700">🚌 {t.vehicle_no}</span><span className="badge badge-green capitalize">{t.direction}</span></div>
              <div className="text-xs text-gray-600">{t.route_name || 'No route'}</div>
              <div className="text-xs text-gray-500">Started {when(t.started_at)} · updated {ago(t.last_at)}</div>
              {t.driver && <div className="text-xs text-gray-500">Driver: {t.driver}{t.driver_phone ? <> · <a className="text-brand-600" href={`tel:${t.driver_phone}`} onClick={e => e.stopPropagation()}>{t.driver_phone}</a></> : null}</div>}
              <div className="text-xs text-brand-600 mt-1">{follow === t.id ? 'Following – tap to stop' : 'Tap to follow on the map'}</div>
            </button>
          ))}
          {live && !live.trips.length && !live.message && <div className="card p-4 text-sm text-gray-500">No bus is on a trip right now.</div>}
          {live?.my_stop && <div className="text-xs text-gray-500">Your stop: <b>{live.my_stop}</b> (orange dot)</div>}
        </div>
      </div>
    </Shell>
  );
}
