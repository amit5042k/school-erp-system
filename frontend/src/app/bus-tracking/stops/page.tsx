'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';
import { Flash, escapeHtml, stopIcon, useFlash, useLeafletMap } from '../_map';

type Stop = { name: string; lat: number | string | null; lng: number | string | null };
type Route = { id: number; name: string; stops: Stop[] };

export default function StopsPage() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [routeId, setRouteId] = useState('');
  const [stops, setStops] = useState<Stop[]>([]);
  const [picking, setPicking] = useState<number | null>(null);
  const { el, map, error, L } = useLeafletMap(420);
  const layer = useRef<any>(null);
  const pickRef = useRef<number | null>(null);
  pickRef.current = picking;
  const { msg, flash } = useFlash();

  const load = () => api<Route[]>('/bus-tracking/stops').then(r => {
    setRoutes(r);
    const id = routeId || (r[0] ? String(r[0].id) : '');
    setRouteId(id);
    setStops(r.find(x => String(x.id) === id)?.stops.map(s => ({ name: s.name, lat: s.lat, lng: s.lng })) || []);
  }).catch(e => flash(e.message, false));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  // Click the map to place the stop being edited.
  useEffect(() => {
    if (!map) return;
    const onClick = (e: any) => {
      const i = pickRef.current;
      if (i == null) return;
      setStops(l => l.map((s, j) => (j === i ? { ...s, lat: Number(e.latlng.lat.toFixed(6)), lng: Number(e.latlng.lng.toFixed(6)) } : s)));
      setPicking(null);
    };
    map.on('click', onClick);
    return () => { map.off('click', onClick); };
  }, [map]);

  useEffect(() => {
    if (!map || !L) return;
    if (layer.current) layer.current.remove();
    const g = L.layerGroup().addTo(map);
    layer.current = g;
    const pts = stops.filter(s => s.lat !== '' && s.lat != null && s.lng !== '' && s.lng != null).map(s => [Number(s.lat), Number(s.lng)] as [number, number]);
    stops.forEach(s => { if (s.lat !== '' && s.lat != null && s.lng !== '' && s.lng != null) L.marker([Number(s.lat), Number(s.lng)], { icon: stopIcon(L) }).bindTooltip(escapeHtml(s.name), { permanent: true, direction: 'right' }).addTo(g); });
    if (pts.length > 1) L.polyline(pts, { color: '#64748b', dashArray: '4 6' }).addTo(g);
  }, [map, L, stops]);

  useEffect(() => {
    if (!map) return;
    const pts = stops.filter(s => s.lat != null && s.lat !== '').map(s => [Number(s.lat), Number(s.lng)]);
    if (pts.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: 16 });
    /* eslint-disable-next-line */
  }, [map, routeId]);

  function pickRoute(id: string) {
    setRouteId(id); setPicking(null);
    setStops(routes.find(x => String(x.id) === id)?.stops.map(s => ({ name: s.name, lat: s.lat, lng: s.lng })) || []);
  }
  const set = (i: number, patch: Partial<Stop>) => setStops(l => l.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: number) => setStops(l => { const n = l.slice(); const j = i + d; if (j < 0 || j >= n.length) return l; [n[i], n[j]] = [n[j], n[i]]; return n; });

  async function save() {
    try { await api(`/bus-tracking/stops/${routeId}`, { method: 'PUT', body: JSON.stringify({ stops }) }); flash('Stop locations saved.'); load(); }
    catch (e: any) { flash(e.message, false); }
  }

  return (
    <Shell>
      <div className="text-xs text-gray-500 mb-1"><Link href="/bus-tracking" className="hover:underline">Bus Tracking</Link> › Stop Locations</div>
      <h2 className="text-xl font-bold text-brand-700 mb-1">Bus Stop Locations</h2>
      <p className="text-sm text-gray-500 mb-4">Place each stop on the map so parents see it and get an &ldquo;arriving&rdquo; alert when the bus is about 600 m away. Stop names must match the pickup stop on each student&apos;s transport record.</p>
      <Flash msg={msg} />
      {error && <div className="text-red-700 text-sm mb-2">{error}</div>}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-4 text-sm">
          <div className="flex gap-2 items-end mb-3">
            <div className="flex-1"><label className="label">Route</label>
              <select className="input" value={routeId} onChange={e => pickRoute(e.target.value)}>
                {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select></div>
            <button className="btn bg-gray-200" onClick={() => setStops(l => [...l, { name: '', lat: null, lng: null }])}>+ Stop</button>
          </div>
          <table className="table text-sm">
            <thead><tr><th></th><th>Stop</th><th>Latitude</th><th>Longitude</th><th></th></tr></thead>
            <tbody>
              {stops.map((s, i) => (
                <tr key={i} className={picking === i ? 'bg-amber-50' : ''}>
                  <td className="whitespace-nowrap text-xs"><button onClick={() => move(i, -1)}>▲</button><button onClick={() => move(i, 1)}>▼</button></td>
                  <td><input className="input" value={s.name} onChange={e => set(i, { name: e.target.value })} /></td>
                  <td><input className="input w-28" value={s.lat ?? ''} onChange={e => set(i, { lat: e.target.value })} /></td>
                  <td><input className="input w-28" value={s.lng ?? ''} onChange={e => set(i, { lng: e.target.value })} /></td>
                  <td className="whitespace-nowrap text-xs space-x-2">
                    <button className="text-brand-600 hover:underline" onClick={() => setPicking(picking === i ? null : i)}>{picking === i ? 'Click map…' : 'Pick on map'}</button>
                    <button className="text-red-600 hover:underline" onClick={() => setStops(l => l.filter((_, j) => j !== i))}>✕</button>
                  </td>
                </tr>
              ))}
              {!stops.length && <tr><td colSpan={5} className="text-center py-4 text-gray-500">No stops on this route. Add them here or on the route in Transport.</td></tr>}
            </tbody>
          </table>
          {routeId && <div className="text-right mt-3"><button className="btn btn-primary" onClick={save}>Save Stops</button></div>}
        </div>
        <div>{el}{picking != null && <div className="text-xs text-amber-700 mt-1">Click on the map to place &ldquo;{stops[picking]?.name || 'this stop'}&rdquo;.</div>}</div>
      </div>
    </Shell>
  );
}
