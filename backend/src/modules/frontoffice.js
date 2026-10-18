// Front Office: visitor purposes, incident categories/purposes, visitor check-out, incident reports.
const { db, ROLES, auth, role, safe, addColumn, registerMaster, registerReport, today } = require('./_kit');

registerMaster({
  type: 'visit-purposes', title: 'Purposes To Meet', group: 'Front Office',
  description: 'Reasons visitors come in. Shown as choices when adding a visitor.',
  seed: ['Admission Enquiry', 'Meet Principal', 'Meet Teacher', 'Fee Payment', 'Parent Teacher Meeting', 'Interview', 'Vendor / Delivery', 'Official Work', 'Other'],
});
registerMaster({
  type: 'incident-categories', title: 'Incident Categories', group: 'Front Office',
  seed: ['Discipline', 'Injury / Medical', 'Bullying', 'Property Damage', 'Lost & Found', 'Safety', 'Other'],
});
registerMaster({
  type: 'incident-purposes', title: 'Incident Purposes', group: 'Front Office',
  description: 'Why the incident is being recorded (what follow-up it needs).',
  seed: ['Information Only', 'Parent To Be Informed', 'Counselling Required', 'Disciplinary Action', 'Medical Follow-up'],
});

addColumn('incidents', 'category TEXT');
addColumn('incidents', 'purpose TEXT');
addColumn('incidents', 'student_id INTEGER REFERENCES students(id) ON DELETE SET NULL');

registerReport({
  key: 'visitor-register', title: 'Visitor Register', group: 'Front Office',
  params: [
    { name: 'from', label: 'From', type: 'date', default: 'monthStart' },
    { name: 'to', label: 'To', type: 'date', default: 'today' },
    { name: 'purpose', label: 'Purpose', type: 'text' },
  ],
  columns: [
    { key: 'in_time', label: 'In', type: 'date' }, { key: 'visitor_name', label: 'Visitor' }, { key: 'phone', label: 'Phone' },
    { key: 'purpose', label: 'Purpose' }, { key: 'to_meet', label: 'To Meet' }, { key: 'id_proof', label: 'ID Proof' },
    { key: 'out_time', label: 'Out', type: 'date' },
  ],
  run: (p) => db.prepare(`
    SELECT * FROM visitors WHERE date(in_time, 'localtime') BETWEEN ? AND ? AND (? = '' OR purpose LIKE '%' || ? || '%')
    ORDER BY in_time DESC`).all(p.from, p.to, p.purpose, p.purpose),
});

registerReport({
  key: 'incident-register', title: 'Incident Report', group: 'Front Office', roles: ROLES.STAFF,
  params: [
    { name: 'from', label: 'From', type: 'date', default: 'yearStart' },
    { name: 'to', label: 'To', type: 'date', default: 'today' },
    { name: 'status', label: 'Status', type: 'select', options: ['open', 'resolved'] },
    { name: 'class_id', label: 'Class', type: 'class' },
  ],
  columns: [
    { key: 'incident_date', label: 'Date', type: 'date' }, { key: 'category', label: 'Category' }, { key: 'purpose', label: 'Purpose' },
    { key: 'student', label: 'Student' }, { key: 'class', label: 'Class' }, { key: 'location', label: 'Location' },
    { key: 'description', label: 'Description' }, { key: 'action_taken', label: 'Action Taken' }, { key: 'status', label: 'Status' },
  ],
  run: (p) => db.prepare(`
    SELECT i.*, s.full_name || ' (' || s.admission_no || ')' AS student, c.name || ' ' || c.section AS class
    FROM incidents i LEFT JOIN students s ON s.id = i.student_id LEFT JOIN classes c ON c.id = s.class_id
    WHERE i.incident_date BETWEEN ? AND ? AND (? = '' OR i.status = ?) AND (? = '' OR s.class_id = ?)
    ORDER BY i.incident_date DESC`).all(p.from, p.to, p.status, p.status, p.class_id, p.class_id),
});

registerReport({
  key: 'incident-summary', title: 'Incident Dashboard', group: 'Front Office', roles: ROLES.STAFF,
  description: 'Incidents by category, with open and resolved counts.',
  params: [
    { name: 'from', label: 'From', type: 'date', default: 'yearStart' },
    { name: 'to', label: 'To', type: 'date', default: 'today' },
  ],
  columns: [
    { key: 'category', label: 'Category' }, { key: 'total', label: 'Total', type: 'number', total: true },
    { key: 'open', label: 'Open', type: 'number', total: true }, { key: 'resolved', label: 'Resolved', type: 'number', total: true },
  ],
  run: (p) => db.prepare(`
    SELECT COALESCE(category, 'Uncategorised') AS category, COUNT(*) AS total,
      SUM(status = 'open') AS open, SUM(status = 'resolved') AS resolved
    FROM incidents WHERE incident_date BETWEEN ? AND ? GROUP BY 1 ORDER BY total DESC`).all(p.from, p.to),
});

function register(router) {
  router.post('/visitors/:id/checkout', auth, role(...ROLES.ADMIN), safe((req, res) => {
    const info = db.prepare('UPDATE visitors SET out_time = ? WHERE id = ? AND out_time IS NULL').run(new Date().toISOString(), req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'Visitor not found or already checked out' });
    res.json({ ok: true, date: today() });
  }));
}

module.exports = { register };
