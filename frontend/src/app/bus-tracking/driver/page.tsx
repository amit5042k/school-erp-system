'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';
import { Flash, ago, useFlash, when } from '../_map';

type Options = {
  vehicles: { id: number; vehicle_no: string; model: string | null; driver_name: string | null }[];
  routes: { id: number; name: string; vehicle_id: number | null; vehicle_no: string | null; students: number }[];
  active_trip: { id: number; vehicle_no: string; route_name: string | null; direction: string; started_at: string; last_at: string | null } | null;
};

const SEND_EVERY_MS = 15000;

export default function DriverPage() {
  const [opts, setOpts] = useState<Options | null>(null);
  const [vehicleId, setVehicleId] = useState('');
  const [routeId, setRouteId] = useState('');
  const [direction, setDirection] = useState('pickup');
  const [trip, setTrip] = useState<Options['active_trip']>(null);
  const [lastSent, setLastSent] = useState<string | null>(null);
  const [fix, setFix] = useState<GeolocationPosition | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [sent, setSent] = useState(0);
  const { msg, flash } = useFlash();
  const latest = useRef<GeolocationPosition | null>(null);
  const wake = useRef<any>(null);

  const load = () => api<Options>('/bus-tracking/driver').then(o => { setOpts(o); setTrip(o.active_trip); }).catch(e => flash(e.message, false));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  // Pick the route that belongs to the chosen vehicle.
  useEffect(() => {
    const r = opts?.routes.find(x => String(x.vehicle_id) === vehicleId);
    if (r) setRouteId(String(r.id));
  }, [vehicleId, opts]);

  // While a trip runs: watch GPS, send the latest fix every 15 s, keep the screen awake if the browser allows it.
  useEffect(() => {
    if (!trip) return;
    if (!('geolocation' in navigator)) { setGpsError('This device or browser cannot share its location.'); return; }
    const watch = navigator.geolocation.watchPosition(
      p => { latest.current = p; setFix(p); setGpsError(null); },
      e => setGpsError(e.code === e.PERMISSION_DENIED ? 'Location permission was refused. Allow location for this site and reload.' : `GPS problem: ${e.message}`),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 },
    );
    const send = async () => {
      const p = latest.current;
      if (!p) return;
      try {
        await api(`/bus-tracking/trips/${trip.id}/location`, { method: 'POST', body: JSON.stringify({
          lat: p.coords.latitude, lng: p.coords.longitude, speed: p.coords.speed, heading: p.coords.heading, accuracy: p.coords.accuracy }) });
        setLastSent(new Date().toISOString()); setSent(n => n + 1);
      } catch (e: any) {
        if (/ended/.test(e.message)) { setTrip(null); flash('This trip was ended.', false); } else setGpsError(`Could not send location: ${e.message}`);
      }
    };
    const first = setTimeout(send, 2000);
    const timer = setInterval(send, SEND_EVERY_MS);
    const keepAwake = async () => { try { wake.current = await (navigator as any).wakeLock?.request('screen'); } catch { /* not supported */ } };
    keepAwake();
    const onVisible = () => { if (document.visibilityState === 'visible') { keepAwake(); send(); } };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      navigator.geolocation.clearWatch(watch); clearTimeout(first); clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      try { wake.current?.release(); } catch { /* ignore */ }
    };
    /* eslint-disable-next-line */
  }, [trip?.id]);

  async function start(takeOver = false) {
    try {
      const r = await api<{ id: number }>('/bus-tracking/trips', { method: 'POST', body: JSON.stringify({
        vehicle_id: Number(vehicleId), route_id: Number(routeId) || null, direction, take_over: takeOver }) });
      flash('Trip started. Keep this page open with the screen on.');
      const o = await api<Options>('/bus-tracking/driver');
      setOpts(o); setTrip(o.active_trip || { id: r.id, vehicle_no: '', route_name: null, direction, started_at: new Date().toISOString(), last_at: null });
    } catch (e: any) {
      if (/take it over/.test(e.message) && confirm(`${e.message}\n\nTake over this bus now?`)) return start(true);
      flash(e.message, false);
    }
  }
  async function end() {
    if (!trip || !confirm('End this trip? Parents will stop seeing the bus.')) return;
    try { await api(`/bus-tracking/trips/${trip.id}/end`, { method: 'POST', body: '{}' }); setTrip(null); setFix(null); setSent(0); flash('Trip ended.'); load(); }
    catch (e: any) { flash(e.message, false); }
  }

  return (
    <Shell>
      <div className="text-xs text-gray-500 mb-1"><Link href="/bus-tracking" className="hover:underline">Bus Tracking</Link> › Driver</div>
      <h2 className="text-xl font-bold text-brand-700 mb-4">Driver Trip</h2>
      <Flash msg={msg} />
      {!trip && opts && (
        <div className="card p-4 max-w-lg space-y-3 text-sm">
          <div><label className="label">Bus *</label>
            <select className="input" value={vehicleId} onChange={e => setVehicleId(e.target.value)}>
              <option value="">— Select —</option>
              {opts.vehicles.map(v => <option key={v.id} value={v.id}>{v.vehicle_no}{v.model ? ` (${v.model})` : ''}</option>)}
            </select></div>
          <div><label className="label">Route</label>
            <select className="input" value={routeId} onChange={e => setRouteId(e.target.value)}>
              <option value="">— No route —</option>
              {opts.routes.map(r => <option key={r.id} value={r.id}>{r.name} ({r.students} students)</option>)}
            </select></div>
          <div><label className="label">Trip</label>
            <div className="flex gap-2">
              {[['pickup', 'Morning pickup'], ['drop', 'Afternoon drop']].map(([k, l]) => (
                <button key={k} type="button" className={`btn flex-1 ${direction === k ? 'btn-primary' : 'bg-gray-200'}`} onClick={() => setDirection(k)}>{l}</button>
              ))}
            </div></div>
          <button className="btn btn-primary w-full py-3 text-base" disabled={!vehicleId} onClick={() => start()}>▶ Start Trip</button>
          <p className="text-xs text-gray-500">Your phone will ask to share its location; allow it. Parents on this route are told the bus has started.</p>
        </div>
      )}
      {trip && (
        <div className="card p-4 max-w-lg space-y-3 text-sm">
          <div className="flex justify-between items-center">
            <div><div className="font-semibold text-brand-700 text-lg">🚌 {trip.vehicle_no}</div><div className="text-gray-600">{trip.route_name || 'No route'} · {trip.direction}</div></div>
            <span className="badge badge-green">On trip</span>
          </div>
          <div className="text-xs text-gray-500">Started {when(trip.started_at)}</div>
          <div className="bg-gray-50 rounded p-3 space-y-1">
            <div>GPS: {fix ? `${fix.coords.latitude.toFixed(5)}, ${fix.coords.longitude.toFixed(5)} (±${Math.round(fix.coords.accuracy)} m)` : 'waiting for a fix…'}</div>
            <div>Last sent: {lastSent ? ago(lastSent) : '—'} · {sent} update(s)</div>
            {gpsError && <div className="text-red-700">{gpsError}</div>}
          </div>
          <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded p-2">
            Keep this page open and the screen on. Phones stop sharing location when the screen locks or you switch apps.
          </div>
          <button className="btn w-full py-3 text-base bg-red-600 text-white" onClick={end}>■ End Trip</button>
        </div>
      )}
    </Shell>
  );
}
