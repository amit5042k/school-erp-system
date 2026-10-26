// Live bus tracking: a driver's phone posts its location during a trip; families see their child's bus on a map.
const { db, ROLES, auth, role, safe, isStaff } = require('./_kit');

db.exec(`
  CREATE TABLE IF NOT EXISTS gps_trips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    route_id INTEGER REFERENCES routes(id) ON DELETE SET NULL,
    direction TEXT NOT NULL DEFAULT 'pickup' CHECK (direction IN ('pickup','drop')),
    driver_user_id INTEGER,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
    last_lat REAL, last_lng REAL, last_speed REAL, last_heading REAL, last_accuracy REAL, last_at TEXT
  );
  CREATE INDEX IF NOT EXISTS ix_gps_trips_active ON gps_trips(status, vehicle_id);
  CREATE TABLE IF NOT EXISTS gps_points (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER NOT NULL REFERENCES gps_trips(id) ON DELETE CASCADE,
    lat REAL NOT NULL, lng REAL NOT NULL, speed REAL, heading REAL, accuracy REAL,
    recorded_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS ix_gps_points_trip ON gps_points(trip_id, id);
  CREATE TABLE IF NOT EXISTS gps_stops (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    seq INTEGER NOT NULL DEFAULT 0,
    lat REAL, lng REAL,
    UNIQUE(route_id, name)
  );
  CREATE TABLE IF NOT EXISTS gps_stop_alerts (
    trip_id INTEGER NOT NULL REFERENCES gps_trips(id) ON DELETE CASCADE,
    stop_id INTEGER NOT NULL REFERENCES gps_stops(id) ON DELETE CASCADE,
    PRIMARY KEY (trip_id, stop_id)
  );
`);

const TRAIL_POINTS = 400;          // kept per trip; older points are dropped
const KEEP_DAYS = 3;               // trips older than this lose their trail
const MIN_INTERVAL_MS = 5000;      // ignore points sent faster than this
const STALE_TRIP_HOURS = 6;        // a trip with no update for this long is ended automatically
const ARRIVING_METERS = 600;
const err = (status, message) => Object.assign(new Error(message), { status });
const nowIso = () => new Date().toISOString();

function metersBetween(a, b) {
  const R = 6371000, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Stop names come from the route's free-text stops; coordinates are added on the Stops screen.
function stopsOf(routeId) {
  if (!routeId) return [];
  const route = db.prepare('SELECT stops FROM routes WHERE id = ?').get(routeId);
  const names = String(route?.stops || '').split(/[,;\n|]+/).map(s => s.trim()).filter(Boolean);
  const saved = db.prepare('SELECT * FROM gps_stops WHERE route_id = ? ORDER BY seq, id').all(routeId);
  const byName = new Map(saved.map(s => [s.name.toLowerCase(), s]));
  const merged = names.map((name, i) => byName.get(name.toLowerCase()) || { id: null, route_id: routeId, name, seq: i, lat: null, lng: null });
  for (const s of saved) if (!names.some(n => n.toLowerCase() === s.name.toLowerCase())) merged.push(s);
  return merged;
}

function endStaleTrips() {
  const cutoff = new Date(Date.now() - STALE_TRIP_HOURS * 3600e3).toISOString();
  db.prepare(`UPDATE gps_trips SET status = 'ended', ended_at = COALESCE(last_at, started_at)
    WHERE status = 'active' AND COALESCE(last_at, started_at) < ?`).run(cutoff);
}
function prune(tripId) {
  db.prepare(`DELETE FROM gps_points WHERE trip_id = ? AND id NOT IN (SELECT id FROM gps_points WHERE trip_id = ? ORDER BY id DESC LIMIT ${TRAIL_POINTS})`).run(tripId, tripId);
  const old = new Date(Date.now() - KEEP_DAYS * 86400e3).toISOString();
  db.prepare("DELETE FROM gps_points WHERE trip_id IN (SELECT id FROM gps_trips WHERE status = 'ended' AND ended_at < ?)").run(old);
}

// Route ids a student/parent may watch: the route their child rides.
function familyRouteIds(user) {
  if (!user.linked_id) return [];
  return db.prepare('SELECT route_id FROM student_transport WHERE student_id = ?').all(user.linked_id).map(r => r.route_id);
}
const familiesOnRoute = (routeId, stopName) => db.prepare(`
  SELECT u.id FROM student_transport st JOIN users u ON u.linked_id = st.student_id
  WHERE st.route_id = ? AND u.active = 1 AND u.role IN ('student','parent') AND (? IS NULL OR LOWER(TRIM(st.pickup_stop)) = LOWER(?))`)
  .all(routeId, stopName ?? null, stopName ?? null).map(r => r.id);
function notify(userIds, title, body) {
  try { require('./push').notify(userIds, { title, body, link: '/bus-tracking', kind: 'bus' }).catch(() => {}); } catch (_) { /* optional */ }
}

const TRIP_SELECT = `SELECT t.*, v.vehicle_no, v.driver_name, v.driver_phone, r.name AS route_name, u.full_name AS driver_user_name
  FROM gps_trips t JOIN vehicles v ON v.id = t.vehicle_id LEFT JOIN routes r ON r.id = t.route_id LEFT JOIN users u ON u.id = t.driver_user_id`;

const api = {
  // What a driver can pick when starting a trip.
  options(req, res) {
    endStaleTrips();
    const vehicles = db.prepare('SELECT id, vehicle_no, model, driver_name FROM vehicles ORDER BY vehicle_no').all();
    const routes = db.prepare(`SELECT r.id, r.name, r.vehicle_id, v.vehicle_no,
      (SELECT COUNT(*) FROM student_transport st WHERE st.route_id = r.id) AS students FROM routes r LEFT JOIN vehicles v ON v.id = r.vehicle_id ORDER BY r.name`).all();
    const mine = db.prepare(`${TRIP_SELECT} WHERE t.status = 'active' AND t.driver_user_id = ? ORDER BY t.id DESC LIMIT 1`).get(req.user.id) || null;
    res.json({ vehicles, routes, active_trip: mine });
  },
  start(req, res) {
    endStaleTrips();
    const vehicleId = Number(req.body.vehicle_id);
    const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicleId);
    if (!vehicle) throw err(400, 'Choose a vehicle');
    const routeId = req.body.route_id ? Number(req.body.route_id) : (db.prepare('SELECT id FROM routes WHERE vehicle_id = ?').get(vehicleId)?.id || null);
    if (routeId && !db.prepare('SELECT 1 FROM routes WHERE id = ?').get(routeId)) throw err(400, 'Unknown route');
    const direction = req.body.direction === 'drop' ? 'drop' : 'pickup';
    const running = db.prepare("SELECT * FROM gps_trips WHERE vehicle_id = ? AND status = 'active'").get(vehicleId);
    if (running) {
      if (running.driver_user_id === req.user.id) return res.json({ id: running.id, resumed: true });
      if (!req.body.take_over) throw err(409, `${vehicle.vehicle_no} already has a trip running. Ask the other driver to end it, or take it over.`);
      db.prepare("UPDATE gps_trips SET status = 'ended', ended_at = ? WHERE id = ?").run(nowIso(), running.id);
    }
    const info = db.prepare('INSERT INTO gps_trips (vehicle_id, route_id, direction, driver_user_id, started_at) VALUES (?, ?, ?, ?, ?)')
      .run(vehicleId, routeId, direction, req.user.id, nowIso());
    if (routeId) notify(familiesOnRoute(routeId), `Bus ${vehicle.vehicle_no} has started`, `The ${direction === 'drop' ? 'drop' : 'pickup'} trip has started. Track it live in the app.`);
    res.status(201).json({ id: info.lastInsertRowid });
  },
  location(req, res) {
    const t = db.prepare('SELECT * FROM gps_trips WHERE id = ?').get(req.params.id);
    if (!t) throw err(404, 'Trip not found');
    if (t.driver_user_id !== req.user.id && req.user.role !== 'admin') throw err(403, 'Only the driver of this trip can send its location');
    if (t.status !== 'active') throw err(409, 'This trip has ended');
    const lat = Number(req.body.lat), lng = Number(req.body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180 || (lat === 0 && lng === 0)) {
      throw err(400, 'lat/lng are not a valid position');
    }
    const opt = (v, lo, hi) => { const n = Number(v); return v == null || v === '' || !Number.isFinite(n) || n < lo || n > hi ? null : n; };
    const speed = opt(req.body.speed, 0, 100), heading = opt(req.body.heading, 0, 360), accuracy = opt(req.body.accuracy, 0, 100000);
    if (t.last_at && Date.now() - Date.parse(t.last_at) < MIN_INTERVAL_MS) return res.json({ ok: true, skipped: true });
    const at = nowIso();
    db.transaction(() => {
      db.prepare('INSERT INTO gps_points (trip_id, lat, lng, speed, heading, accuracy, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(t.id, lat, lng, speed, heading, accuracy, at);
      db.prepare('UPDATE gps_trips SET last_lat = ?, last_lng = ?, last_speed = ?, last_heading = ?, last_accuracy = ?, last_at = ? WHERE id = ?')
        .run(lat, lng, speed, heading, accuracy, at, t.id);
    })();
    prune(t.id);
    // Pickup trips: tell families at a stop once when the bus gets close.
    if (t.route_id && t.direction === 'pickup') {
      const alerted = db.prepare('INSERT OR IGNORE INTO gps_stop_alerts (trip_id, stop_id) VALUES (?, ?)');
      const vehicle = db.prepare('SELECT vehicle_no FROM vehicles WHERE id = ?').get(t.vehicle_id);
      for (const s of stopsOf(t.route_id)) {
        if (!s.id || s.lat == null || metersBetween({ lat, lng }, s) > ARRIVING_METERS) continue;
        if (alerted.run(t.id, s.id).changes) notify(familiesOnRoute(t.route_id, s.name), `Bus ${vehicle.vehicle_no} is arriving`, `The bus is about ${ARRIVING_METERS} m from ${s.name}.`);
      }
    }
    res.json({ ok: true });
  },
  end(req, res) {
    const t = db.prepare('SELECT * FROM gps_trips WHERE id = ?').get(req.params.id);
    if (!t) throw err(404, 'Trip not found');
    if (t.driver_user_id !== req.user.id && req.user.role !== 'admin') throw err(403, 'Only the driver of this trip (or an admin) can end it');
    if (t.status !== 'active') return res.json({ ok: true });
    db.prepare("UPDATE gps_trips SET status = 'ended', ended_at = ? WHERE id = ?").run(nowIso(), t.id);
    res.json({ ok: true });
  },
  // Buses on the road. Staff see all; students/parents only their child's route.
  live(req, res) {
    endStaleTrips();
    const staff = isStaff(req.user);
    const routeIds = staff ? null : familyRouteIds(req.user);
    if (!staff && !routeIds.length) return res.json({ trips: [], routes: [], message: 'Your child is not assigned to a bus route.' });
    const trips = db.prepare(`${TRIP_SELECT} WHERE t.status = 'active' ORDER BY v.vehicle_no`).all()
      .filter(t => staff || routeIds.includes(t.route_id))
      .map(t => ({
        id: t.id, vehicle_no: t.vehicle_no, route_id: t.route_id, route_name: t.route_name, direction: t.direction, started_at: t.started_at,
        driver: t.driver_user_name || t.driver_name, driver_phone: staff ? t.driver_phone : (t.driver_phone || null),
        lat: t.last_lat, lng: t.last_lng, speed: t.last_speed, heading: t.last_heading, accuracy: t.last_accuracy, last_at: t.last_at,
      }));
    const ids = staff ? [...new Set([...trips.map(t => t.route_id).filter(Boolean)])] : routeIds;
    const routes = ids.map(id => ({ id, name: db.prepare('SELECT name FROM routes WHERE id = ?').get(id)?.name, stops: stopsOf(id) }));
    const myStop = staff ? null : db.prepare('SELECT pickup_stop FROM student_transport WHERE student_id = ?').get(req.user.linked_id)?.pickup_stop || null;
    res.json({ trips, routes, my_stop: myStop, server_time: nowIso() });
  },
  trail(req, res) {
    const t = db.prepare('SELECT * FROM gps_trips WHERE id = ?').get(req.params.id);
    if (!t) throw err(404, 'Trip not found');
    if (!isStaff(req.user) && !familyRouteIds(req.user).includes(t.route_id)) throw err(404, 'Trip not found');
    res.json(db.prepare(`SELECT lat, lng, recorded_at FROM gps_points WHERE trip_id = ? ORDER BY id DESC LIMIT ${TRAIL_POINTS}`).all(t.id).reverse());
  },
  stops(req, res) {
    const routes = db.prepare('SELECT id, name FROM routes ORDER BY name').all();
    res.json(routes.map(r => ({ ...r, stops: stopsOf(r.id) })));
  },
  saveStops(req, res) {
    const routeId = Number(req.params.routeId);
    if (!db.prepare('SELECT 1 FROM routes WHERE id = ?').get(routeId)) throw err(404, 'Route not found');
    const items = Array.isArray(req.body.stops) ? req.body.stops : [];
    const up = db.prepare(`INSERT INTO gps_stops (route_id, name, seq, lat, lng) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(route_id, name) DO UPDATE SET seq = excluded.seq, lat = excluded.lat, lng = excluded.lng`);
    db.transaction(() => {
      items.forEach((s, i) => {
        const name = String(s.name || '').trim().slice(0, 100);
        if (!name) throw err(400, 'Every stop needs a name');
        const lat = s.lat === '' || s.lat == null ? null : Number(s.lat), lng = s.lng === '' || s.lng == null ? null : Number(s.lng);
        if ((lat == null) !== (lng == null)) throw err(400, `${name}: give both latitude and longitude, or neither`);
        if (lat != null && (!(lat >= -90 && lat <= 90) || !(lng >= -180 && lng <= 180))) throw err(400, `${name}: position is out of range`);
        up.run(routeId, name, i, lat, lng);
      });
    })();
    res.json({ ok: true });
  },
  history(req, res) {
    res.json(db.prepare(`${TRIP_SELECT} ORDER BY t.id DESC LIMIT 100`).all().map(t => ({ ...t, points: db.prepare('SELECT COUNT(*) AS c FROM gps_points WHERE trip_id = ?').get(t.id).c })));
  },
};

function register(router) {
  const S = [auth, role(...ROLES.STAFF)];
  router.get('/bus-tracking/live', auth, safe(api.live));
  router.get('/bus-tracking/trips/:id/trail', auth, safe(api.trail));
  router.get('/bus-tracking/driver', ...S, safe(api.options));
  router.post('/bus-tracking/trips', ...S, safe(api.start));
  router.post('/bus-tracking/trips/:id/location', ...S, safe(api.location));
  router.post('/bus-tracking/trips/:id/end', ...S, safe(api.end));
  router.get('/bus-tracking/trips', ...S, safe(api.history));
  router.get('/bus-tracking/stops', ...S, safe(api.stops));
  router.put('/bus-tracking/stops/:routeId', auth, role(...ROLES.ADMIN), safe(api.saveStops));
}

module.exports = { register, metersBetween };
