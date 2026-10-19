// Transport: daily bus boarding attendance per route, route-wise student lists and bus occupancy.
const { db, ROLES, auth, role, safe, today, isDate, registerReport } = require('./_kit');

db.exec(`
  CREATE TABLE IF NOT EXISTS tr_bus_attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    trip TEXT NOT NULL DEFAULT 'pickup' CHECK (trip IN ('pickup','drop')),
    route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('present','absent')),
    marked_by INTEGER,
    marked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(date, trip, student_id)
  );
`);

const TRIPS = ['pickup', 'drop'];

const h = {
  // Students on the route with what was marked for that date/trip (null = not marked yet).
  sheet(req, res) {
    const { route_id } = req.query;
    const date = req.query.date || today();
    const trip = req.query.trip || 'pickup';
    if (!route_id) return res.status(400).json({ error: 'Select a route' });
    if (!isDate(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    if (!TRIPS.includes(trip)) return res.status(400).json({ error: 'trip must be pickup or drop' });
    const route = db.prepare('SELECT r.*, v.vehicle_no, v.capacity FROM routes r LEFT JOIN vehicles v ON v.id = r.vehicle_id WHERE r.id = ?').get(route_id);
    if (!route) return res.status(404).json({ error: 'Route not found' });
    const rows = db.prepare(`
      SELECT s.id AS student_id, s.admission_no, s.full_name, c.name || ' ' || c.section AS class, st.pickup_stop, a.status
      FROM student_transport st JOIN students s ON s.id = st.student_id LEFT JOIN classes c ON c.id = s.class_id
      LEFT JOIN tr_bus_attendance a ON a.student_id = s.id AND a.date = ? AND a.trip = ?
      WHERE st.route_id = ? AND COALESCE(s.status, 'active') = 'active'
      ORDER BY st.pickup_stop, s.full_name`).all(date, trip, route_id);
    res.json({ route, date, trip, rows });
  },

  mark(req, res) {
    const { route_id, records } = req.body;
    const date = req.body.date || today();
    const trip = req.body.trip || 'pickup';
    if (!route_id || !Array.isArray(records) || !records.length) return res.status(400).json({ error: 'route_id and records[] are required' });
    if (!isDate(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    if (date > today()) return res.status(400).json({ error: 'Cannot mark bus attendance for a future date' });
    if (!TRIPS.includes(trip)) return res.status(400).json({ error: 'trip must be pickup or drop' });
    const onRoute = new Set(db.prepare('SELECT student_id FROM student_transport WHERE route_id = ?').all(route_id).map(r => r.student_id));
    for (const r of records) {
      if (!r || !['present', 'absent'].includes(r.status)) return res.status(400).json({ error: 'Each record needs a status of present or absent' });
      if (!onRoute.has(Number(r.student_id))) return res.status(400).json({ error: `Student ${r.student_id} is not assigned to this route` });
    }
    const up = db.prepare(`INSERT INTO tr_bus_attendance (date, trip, route_id, student_id, status, marked_by) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(date, trip, student_id) DO UPDATE SET status = excluded.status, route_id = excluded.route_id,
        marked_by = excluded.marked_by, marked_at = CURRENT_TIMESTAMP`);
    db.transaction(() => { for (const r of records) up.run(date, trip, route_id, r.student_id, r.status, req.user.id); })();
    res.json({ ok: true, count: records.length });
  },
};

registerReport({
  key: 'transport-students', title: 'Transport Report', group: 'Transport', roles: ROLES.STAFF,
  description: 'Students using school transport, route by route, with pickup stops and fares.',
  params: [
    { name: 'route', label: 'Route (name contains)', type: 'text' },
    { name: 'class_id', label: 'Class', type: 'class' },
  ],
  columns: [
    { key: 'route', label: 'Route' }, { key: 'vehicle_no', label: 'Bus' }, { key: 'driver', label: 'Driver' },
    { key: 'pickup_stop', label: 'Stop' }, { key: 'admission_no', label: 'Adm No' }, { key: 'full_name', label: 'Student' },
    { key: 'class', label: 'Class' }, { key: 'contact', label: 'Contact' }, { key: 'fare', label: 'Fare', type: 'money', total: true },
  ],
  run: (p) => db.prepare(`
    SELECT r.name AS route, v.vehicle_no, v.driver_name || COALESCE(' (' || v.driver_phone || ')', '') AS driver, st.pickup_stop,
      s.admission_no, s.full_name, c.name || ' ' || c.section AS class, s.contact, r.fare
    FROM student_transport st JOIN students s ON s.id = st.student_id JOIN routes r ON r.id = st.route_id
    LEFT JOIN vehicles v ON v.id = r.vehicle_id LEFT JOIN classes c ON c.id = s.class_id
    WHERE COALESCE(s.status, 'active') = 'active' AND (? = '' OR r.name LIKE '%' || ? || '%') AND (? = '' OR s.class_id = ?)
    ORDER BY r.name, st.pickup_stop, s.full_name`).all(p.route, p.route, p.class_id, p.class_id),
});

registerReport({
  key: 'bus-occupancy', title: 'Bus Occupancy Report', group: 'Transport', roles: ROLES.STAFF,
  description: 'Seats on each bus against the students assigned to its routes.',
  params: [],
  columns: [
    { key: 'vehicle_no', label: 'Bus' }, { key: 'model', label: 'Model' }, { key: 'driver_name', label: 'Driver' },
    { key: 'routes', label: 'Routes' }, { key: 'capacity', label: 'Seats', type: 'number', total: true },
    { key: 'assigned', label: 'Students', type: 'number', total: true }, { key: 'vacant', label: 'Vacant', type: 'number', total: true },
    { key: 'occupancy', label: 'Occupancy', type: 'percent' }, { key: 'state', label: 'Status' },
  ],
  run: () => db.prepare(`
    SELECT v.vehicle_no, v.model, v.driver_name, COALESCE(v.capacity, 0) AS capacity,
      (SELECT GROUP_CONCAT(name, ', ') FROM routes WHERE vehicle_id = v.id) AS routes,
      (SELECT COUNT(*) FROM student_transport st JOIN routes r ON r.id = st.route_id JOIN students s ON s.id = st.student_id
        WHERE r.vehicle_id = v.id AND COALESCE(s.status, 'active') = 'active') AS assigned
    FROM vehicles v ORDER BY v.vehicle_no`).all().map(r => ({
    ...r,
    vacant: Math.max(0, r.capacity - r.assigned),
    occupancy: r.capacity ? (r.assigned / r.capacity) * 100 : null,
    state: !r.capacity ? 'Seats not set' : r.assigned > r.capacity ? 'Over capacity' : r.assigned === r.capacity ? 'Full' : 'Seats available',
  })),
});

registerReport({
  key: 'bus-attendance', title: 'Bus Attendance Report', group: 'Transport', roles: ROLES.STAFF,
  description: 'Bus boarding attendance per student for a period.',
  params: [
    { name: 'from', label: 'From', type: 'date', default: 'monthStart' },
    { name: 'to', label: 'To', type: 'date', default: 'today' },
    { name: 'route', label: 'Route (name contains)', type: 'text' },
    { name: 'trip', label: 'Trip', type: 'select', options: [{ value: 'pickup', label: 'Pickup' }, { value: 'drop', label: 'Drop' }] },
  ],
  columns: [
    { key: 'route', label: 'Route' }, { key: 'admission_no', label: 'Adm No' }, { key: 'full_name', label: 'Student' },
    { key: 'class', label: 'Class' }, { key: 'marked', label: 'Trips Marked', type: 'number', total: true },
    { key: 'present', label: 'Present', type: 'number', total: true }, { key: 'absent', label: 'Absent', type: 'number', total: true },
    { key: 'pct', label: 'Present %', type: 'percent' }, { key: 'last_absent', label: 'Last Absent', type: 'date' },
  ],
  run: (p) => db.prepare(`
    SELECT r.name AS route, s.admission_no, s.full_name, c.name || ' ' || c.section AS class,
      COUNT(*) AS marked, SUM(a.status = 'present') AS present, SUM(a.status = 'absent') AS absent,
      100.0 * SUM(a.status = 'present') / COUNT(*) AS pct, MAX(CASE WHEN a.status = 'absent' THEN a.date END) AS last_absent
    FROM tr_bus_attendance a JOIN students s ON s.id = a.student_id JOIN routes r ON r.id = a.route_id
    LEFT JOIN classes c ON c.id = s.class_id
    WHERE a.date BETWEEN ? AND ? AND (? = '' OR r.name LIKE '%' || ? || '%') AND (? = '' OR a.trip = ?)
    GROUP BY a.route_id, a.student_id ORDER BY r.name, s.full_name`).all(p.from, p.to, p.route, p.route, p.trip, p.trip),
});

function register(router) {
  router.get('/tr/bus-attendance', auth, role(...ROLES.STAFF), h.sheet);
  router.post('/tr/bus-attendance', auth, role(...ROLES.STAFF), safe(h.mark));
}

module.exports = { register };
