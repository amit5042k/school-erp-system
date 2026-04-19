'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import ExploreOptions from '@/components/ExploreOptions';
import { api } from '@/lib/api';

export default function TransportPage() {
  const [tab, setTab] = useState<null | 'vehicles' | 'routes' | 'students'>(null);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setVehicles(await api('/vehicles'));
      setRoutes(await api('/routes'));
      setAssignments(await api('/student-transport'));
      setStudents(await api('/students'));
    } catch (e: any) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function addVehicle(e: React.FormEvent) {
    e.preventDefault();
    const f = e.target as any;
    try {
      await api('/vehicles', { method: 'POST', body: JSON.stringify({
        vehicle_no: f.vehicle_no.value, model: f.model.value,
        capacity: Number(f.capacity.value) || 0, driver_name: f.driver_name.value,
        driver_phone: f.driver_phone.value, license_no: f.license_no.value,
      }) });
      f.reset(); load();
    } catch (e: any) { setError(e.message); }
  }

  async function addRoute(e: React.FormEvent) {
    e.preventDefault();
    const f = e.target as any;
    try {
      await api('/routes', { method: 'POST', body: JSON.stringify({
        name: f.name.value, stops: f.stops.value,
        fare: Number(f.fare.value) || 0, vehicle_id: f.vehicle_id.value ? Number(f.vehicle_id.value) : null,
      }) });
      f.reset(); load();
    } catch (e: any) { setError(e.message); }
  }

  async function assign(e: React.FormEvent) {
    e.preventDefault();
    const f = e.target as any;
    try {
      await api('/student-transport', { method: 'POST', body: JSON.stringify({
        student_id: Number(f.student_id.value), route_id: Number(f.route_id.value), pickup_stop: f.pickup_stop.value,
      }) });
      f.reset(); load();
    } catch (e: any) { setError(e.message); }
  }

  return (
    <Shell>
      <ExploreOptions
        icon="🚌"
        title="Transport"
        subtitle="Routes, Vehicles & Reports — Explore Options"
        breadcrumb={['Dashboard', 'Transport']}
        columns={3}
        groups={[
          { title: 'Vehicles & Routes', actions: [
            { label: 'Manage Buses', onClick: () => setTab('vehicles') },
            { label: 'Add Route', onClick: () => setTab('routes') },
            { label: 'Manage Route', onClick: () => setTab('routes') },
            { label: 'Assign Student Transport', onClick: () => setTab('students') },
          ]},
          { title: 'Reports', actions: [
            { label: 'Transport Report' },
            { label: 'Bus Occupancy Report' },
            { label: 'Bus Attendance Report' },
            { label: 'Pending Transport Fee Report', href: '/fees' },
          ]},
          { title: 'Communication', actions: [
            { label: 'Transport Communication', href: '/communications' },
            { label: 'Student Activate/Deactivate Report' },
          ]},
        ]}
      />

      {tab && (
        <>
          <div className="flex items-center justify-between mt-6 mb-3">
            <div className="flex gap-2">
              {(['vehicles', 'routes', 'students'] as const).map(t => (
                <button key={t} className={`btn text-sm ${tab === t ? 'btn-primary' : 'bg-gray-200'}`} onClick={() => setTab(t)}>
                  {t === 'students' ? 'Student Transport' : t[0].toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
            <button className="text-xs text-gray-500 hover:underline" onClick={() => setTab(null)}>Close</button>
          </div>

          {error && <div className="text-red-700 text-sm mb-2">{error}</div>}

          {tab === 'vehicles' && (
            <>
              <form onSubmit={addVehicle} className="card p-4 mb-4 grid md:grid-cols-3 gap-3 text-sm">
                <div><label className="label">Vehicle No *</label><input className="input" name="vehicle_no" required /></div>
                <div><label className="label">Model</label><input className="input" name="model" /></div>
                <div><label className="label">Capacity</label><input className="input" name="capacity" type="number" /></div>
                <div><label className="label">Driver Name</label><input className="input" name="driver_name" /></div>
                <div><label className="label">Driver Phone</label><input className="input" name="driver_phone" /></div>
                <div><label className="label">License No</label><input className="input" name="license_no" /></div>
                <div className="md:col-span-3"><button className="btn btn-primary">Add Vehicle</button></div>
              </form>
              <div className="card p-4 overflow-x-auto">
                <table className="table"><thead><tr><th>Vehicle</th><th>Model</th><th>Capacity</th><th>Driver</th><th>Phone</th><th>License</th></tr></thead>
                  <tbody>{vehicles.map(v => (<tr key={v.id}><td>{v.vehicle_no}</td><td>{v.model}</td><td>{v.capacity}</td><td>{v.driver_name}</td><td>{v.driver_phone}</td><td>{v.license_no}</td></tr>))}
                    {!vehicles.length && <tr><td colSpan={6} className="text-center py-3 text-gray-500">No vehicles.</td></tr>}
                  </tbody></table>
              </div>
            </>
          )}

          {tab === 'routes' && (
            <>
              <form onSubmit={addRoute} className="card p-4 mb-4 grid md:grid-cols-3 gap-3 text-sm">
                <div><label className="label">Route Name *</label><input className="input" name="name" required /></div>
                <div><label className="label">Stops (comma)</label><input className="input" name="stops" /></div>
                <div><label className="label">Fare</label><input className="input" name="fare" type="number" /></div>
                <div><label className="label">Vehicle</label>
                  <select className="input" name="vehicle_id"><option value="">—</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.vehicle_no}</option>)}</select>
                </div>
                <div className="md:col-span-3"><button className="btn btn-primary">Add Route</button></div>
              </form>
              <div className="card p-4 overflow-x-auto">
                <table className="table"><thead><tr><th>Route</th><th>Stops</th><th>Fare</th><th>Vehicle</th></tr></thead>
                  <tbody>{routes.map(r => (<tr key={r.id}><td>{r.name}</td><td>{r.stops}</td><td>₹{r.fare}</td><td>{r.vehicle_no}</td></tr>))}
                    {!routes.length && <tr><td colSpan={4} className="text-center py-3 text-gray-500">No routes.</td></tr>}
                  </tbody></table>
              </div>
            </>
          )}

          {tab === 'students' && (
            <>
              <form onSubmit={assign} className="card p-4 mb-4 grid md:grid-cols-3 gap-3 text-sm">
                <div><label className="label">Student</label>
                  <select className="input" name="student_id" required>
                    <option value="">-- Select --</option>
                    {students.map(s => <option key={s.id} value={s.id}>{s.admission_no} — {s.full_name}</option>)}
                  </select></div>
                <div><label className="label">Route</label>
                  <select className="input" name="route_id" required>
                    <option value="">-- Select --</option>
                    {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select></div>
                <div><label className="label">Pickup Stop</label><input className="input" name="pickup_stop" /></div>
                <div className="md:col-span-3"><button className="btn btn-primary">Assign</button></div>
              </form>
              <div className="card p-4 overflow-x-auto">
                <table className="table"><thead><tr><th>Student</th><th>Adm. No</th><th>Route</th><th>Pickup</th><th>Fare</th></tr></thead>
                  <tbody>{assignments.map(a => (<tr key={a.id}><td>{a.student_name}</td><td>{a.admission_no}</td><td>{a.route_name}</td><td>{a.pickup_stop}</td><td>₹{a.fare}</td></tr>))}
                    {!assignments.length && <tr><td colSpan={5} className="text-center py-3 text-gray-500">No assignments.</td></tr>}
                  </tbody></table>
              </div>
            </>
          )}
        </>
      )}
    </Shell>
  );
}
