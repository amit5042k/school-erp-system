// Inventory: store masters, stores, item allocation to staff (with returns) and staff item requests.
const { db, ROLES, auth, role, safe, addColumn, today, isDate, num, registerMaster, registerReport } = require('./_kit');

registerMaster({ type: 'store-categories', title: 'Store Categories', group: 'Inventory', seed: ['General Store', 'Academic Store', 'Sports Store', 'Maintenance Store', 'Kitchen / Canteen'] });
registerMaster({ type: 'store-types', title: 'Store Type', group: 'Inventory', seed: ['Main Store', 'Sub Store', 'Department Store', 'Lab Store'] });
registerMaster({
  type: 'item-categories', title: 'Item Category', group: 'Inventory', read: ROLES.STAFF,
  seed: ['Stationery', 'Cleaning', 'Furniture', 'Electronics', 'Sports', 'Lab Equipment', 'Books', 'Uniform', 'Other'],
});

addColumn('inventory_items', 'store_id INTEGER');

db.exec(`
  CREATE TABLE IF NOT EXISTS inv_stores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    store_type TEXT,
    category TEXT,
    location TEXT,
    incharge_teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
    active INTEGER NOT NULL DEFAULT 1,
    remarks TEXT
  );

  CREATE TABLE IF NOT EXISTS inv_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    item_id INTEGER REFERENCES inventory_items(id),
    item_name TEXT,
    qty INTEGER NOT NULL CHECK (qty > 0),
    purpose TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
    requested_on TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    decided_by INTEGER,
    decided_on TEXT,
    remarks TEXT,
    allocation_id INTEGER
  );

  CREATE TABLE IF NOT EXISTS inv_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES inventory_items(id),
    teacher_id INTEGER NOT NULL REFERENCES teachers(id),
    qty INTEGER NOT NULL CHECK (qty > 0),
    returned_qty INTEGER NOT NULL DEFAULT 0,
    allocated_on TEXT NOT NULL,
    due_back TEXT,
    returnable INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'allocated' CHECK (status IN ('allocated','partially_returned','returned','consumed')),
    request_id INTEGER REFERENCES inv_requests(id),
    remarks TEXT,
    allocated_by INTEGER,
    last_returned_on TEXT
  );
`);

const err = (status, message) => Object.assign(new Error(message), { status });
const wholePositive = (v) => Number.isInteger(num(v)) && num(v) > 0;

// Stock out to a staff member: one issue movement and one allocation, all or nothing.
function allocate({ item_id, teacher_id, qty, due_back, returnable = true, remarks, request_id, userId }) {
  if (!item_id) throw err(400, 'Select an item');
  if (!teacher_id) throw err(400, 'Select a staff member');
  if (!wholePositive(qty)) throw err(400, 'Quantity must be a positive whole number');
  if (due_back && !isDate(due_back)) throw err(400, 'Due back date must be YYYY-MM-DD');
  if (due_back && due_back < today()) throw err(400, 'Due back date cannot be in the past');
  const teacher = db.prepare('SELECT id, full_name, employee_no FROM teachers WHERE id = ?').get(teacher_id);
  if (!teacher) throw err(400, 'Staff member not found');
  const item = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(item_id);
  if (!item) throw err(404, 'Item not found');
  const q = num(qty);
  if (item.qty_on_hand < q) throw err(400, `Not enough stock: only ${item.qty_on_hand} ${item.unit || 'units'} of ${item.name} on hand`);
  const info = db.prepare(`INSERT INTO inv_allocations (item_id, teacher_id, qty, allocated_on, due_back, returnable, status, request_id, remarks, allocated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(item.id, teacher.id, q, today(), due_back || null, returnable ? 1 : 0,
    returnable ? 'allocated' : 'consumed', request_id || null, remarks || null, userId);
  db.prepare('UPDATE inventory_items SET qty_on_hand = qty_on_hand - ? WHERE id = ?').run(q, item.id);
  db.prepare(`INSERT INTO inventory_movements (item_id, movement_type, qty, reference, note) VALUES (?, 'issue', ?, ?, ?)`)
    .run(item.id, q, `ALLOC-${info.lastInsertRowid}`, `Allocated to ${teacher.full_name} (${teacher.employee_no})`);
  return info.lastInsertRowid;
}

const ALLOC_SELECT = `
  SELECT a.*, i.name AS item_name, i.sku, i.unit, t.full_name AS staff_name, t.employee_no, t.department,
    a.qty - a.returned_qty AS outstanding
  FROM inv_allocations a JOIN inventory_items i ON i.id = a.item_id JOIN teachers t ON t.id = a.teacher_id`;
const REQ_SELECT = `
  SELECT r.*, COALESCE(i.name, r.item_name) AS item_label, i.sku, i.unit, i.qty_on_hand,
    t.full_name AS staff_name, t.employee_no, t.department, u.full_name AS decided_by_name
  FROM inv_requests r JOIN teachers t ON t.id = r.teacher_id LEFT JOIN inventory_items i ON i.id = r.item_id
  LEFT JOIN users u ON u.id = r.decided_by`;

const h = {
  stores(req, res) {
    res.json(db.prepare(`
      SELECT s.*, t.full_name AS incharge_name, (SELECT COUNT(*) FROM inventory_items i WHERE i.store_id = s.id) AS item_count
      FROM inv_stores s LEFT JOIN teachers t ON t.id = s.incharge_teacher_id ORDER BY s.name`).all());
  },
  storeSave(req, res) {
    const existing = req.params.id ? db.prepare('SELECT * FROM inv_stores WHERE id = ?').get(req.params.id) : null;
    if (req.params.id && !existing) return res.status(404).json({ error: 'Not found' });
    const v = { ...(existing || {}) };
    for (const f of ['name', 'store_type', 'category', 'location', 'incharge_teacher_id', 'active', 'remarks']) {
      if (f in req.body) v[f] = req.body[f] === '' ? null : req.body[f];
    }
    v.name = String(v.name || '').trim();
    if (!v.name) return res.status(400).json({ error: 'Store name is required' });
    if (v.incharge_teacher_id && !db.prepare('SELECT 1 FROM teachers WHERE id = ?').get(v.incharge_teacher_id)) return res.status(400).json({ error: 'Store in-charge not found' });
    v.active = v.active == null ? 1 : (v.active === true || Number(v.active) === 1 ? 1 : 0);
    const vals = [v.name, v.store_type || null, v.category || null, v.location || null, v.incharge_teacher_id || null, v.active, v.remarks || null];
    if (existing) {
      db.prepare('UPDATE inv_stores SET name = ?, store_type = ?, category = ?, location = ?, incharge_teacher_id = ?, active = ?, remarks = ? WHERE id = ?').run(...vals, existing.id);
      return res.json({ ok: true });
    }
    const info = db.prepare('INSERT INTO inv_stores (name, store_type, category, location, incharge_teacher_id, active, remarks) VALUES (?, ?, ?, ?, ?, ?, ?)').run(...vals);
    res.status(201).json({ id: info.lastInsertRowid });
  },
  storeRemove(req, res) {
    const { c } = db.prepare('SELECT COUNT(*) AS c FROM inventory_items WHERE store_id = ?').get(req.params.id);
    if (c) return res.status(409).json({ error: `${c} item(s) are kept in this store; move them first or mark the store inactive` });
    const info = db.prepare('DELETE FROM inv_stores WHERE id = ?').run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  },
  itemStore(req, res) {
    const storeId = req.body.store_id ? num(req.body.store_id) : null;
    if (storeId && !db.prepare('SELECT 1 FROM inv_stores WHERE id = ?').get(storeId)) return res.status(400).json({ error: 'Store not found' });
    const info = db.prepare('UPDATE inventory_items SET store_id = ? WHERE id = ?').run(storeId, req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'Item not found' });
    res.json({ ok: true });
  },
  items(req, res) {
    res.json(db.prepare(`SELECT i.*, s.name AS store_name FROM inventory_items i LEFT JOIN inv_stores s ON s.id = i.store_id ORDER BY i.name`).all());
  },

  allocations(req, res) {
    const w = [], p = [];
    if (req.user.role !== 'admin') { w.push('a.teacher_id = ?'); p.push(req.user.linked_id ?? -1); }
    else if (req.query.teacher_id) { w.push('a.teacher_id = ?'); p.push(req.query.teacher_id); }
    if (req.query.open === '1') w.push("a.status IN ('allocated','partially_returned')");
    res.json(db.prepare(`${ALLOC_SELECT} ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY a.id DESC`).all(...p));
  },
  allocationCreate(req, res) {
    const id = db.transaction(() => allocate({ ...req.body, returnable: req.body.returnable !== false && req.body.returnable !== 0, userId: req.user.id }))();
    res.status(201).json({ id });
  },
  allocationReturn(req, res) {
    const out = db.transaction(() => {
      const a = db.prepare(`${ALLOC_SELECT} WHERE a.id = ?`).get(req.params.id);
      if (!a) throw err(404, 'Allocation not found');
      if (!a.returnable) throw err(400, 'This item was issued for use (consumable) and is not returnable');
      if (a.outstanding <= 0) throw err(400, 'Everything on this allocation has already been returned');
      const q = req.body.qty == null || req.body.qty === '' ? a.outstanding : num(req.body.qty);
      if (!Number.isInteger(q) || q <= 0) throw err(400, 'Return quantity must be a positive whole number');
      if (q > a.outstanding) throw err(400, `Only ${a.outstanding} ${a.unit || 'unit(s)'} are outstanding`);
      const returned = a.returned_qty + q;
      db.prepare('UPDATE inv_allocations SET returned_qty = ?, status = ?, last_returned_on = ? WHERE id = ?')
        .run(returned, returned >= a.qty ? 'returned' : 'partially_returned', today(), a.id);
      db.prepare('UPDATE inventory_items SET qty_on_hand = qty_on_hand + ? WHERE id = ?').run(q, a.item_id);
      db.prepare(`INSERT INTO inventory_movements (item_id, movement_type, qty, reference, note) VALUES (?, 'adjust', ?, ?, ?)`)
        .run(a.item_id, q, `RET-${a.id}`, `Returned by ${a.staff_name}${req.body.remarks ? ': ' + String(req.body.remarks).slice(0, 200) : ''}`);
      return { returned: q, outstanding: a.outstanding - q };
    })();
    res.json({ ok: true, ...out });
  },

  requests(req, res) {
    const w = [], p = [];
    if (req.user.role !== 'admin') { w.push('r.teacher_id = ?'); p.push(req.user.linked_id ?? -1); }
    if (req.query.status) { w.push('r.status = ?'); p.push(req.query.status); }
    res.json(db.prepare(`${REQ_SELECT} ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY r.id DESC`).all(...p));
  },
  requestCreate(req, res) {
    const b = req.body;
    const teacherId = req.user.role === 'admin' ? num(b.teacher_id) : req.user.linked_id;
    if (!teacherId) return res.status(400).json({ error: req.user.role === 'admin' ? 'Select a staff member' : 'Your account is not linked to a staff record' });
    if (!db.prepare('SELECT 1 FROM teachers WHERE id = ?').get(teacherId)) return res.status(400).json({ error: 'Staff member not found' });
    const itemId = b.item_id ? num(b.item_id) : null;
    const itemName = String(b.item_name || '').trim();
    if (!itemId && !itemName) return res.status(400).json({ error: 'Choose an item or describe what you need' });
    if (itemId && !db.prepare('SELECT 1 FROM inventory_items WHERE id = ?').get(itemId)) return res.status(400).json({ error: 'Item not found' });
    if (!wholePositive(b.qty)) return res.status(400).json({ error: 'Quantity must be a positive whole number' });
    const info = db.prepare('INSERT INTO inv_requests (teacher_id, item_id, item_name, qty, purpose) VALUES (?, ?, ?, ?, ?)')
      .run(teacherId, itemId, itemId ? null : itemName, num(b.qty), b.purpose || null);
    res.status(201).json({ id: info.lastInsertRowid });
  },
  requestDecision(req, res) {
    const { action, remarks } = req.body;
    if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'action must be approve or reject' });
    const out = db.transaction(() => {
      const r = db.prepare('SELECT * FROM inv_requests WHERE id = ?').get(req.params.id);
      if (!r) throw err(404, 'Request not found');
      if (r.status !== 'pending') throw err(400, `Request is already ${r.status}`);
      if (action === 'reject') {
        if (!String(remarks || '').trim()) throw err(400, 'Give a reason for rejecting');
        db.prepare("UPDATE inv_requests SET status = 'rejected', remarks = ?, decided_by = ?, decided_on = ? WHERE id = ?")
          .run(remarks, req.user.id, today(), r.id);
        return { status: 'rejected' };
      }
      // Approving allocates from stock; the admin may map a free-text request to a stock item and adjust the quantity.
      const itemId = num(req.body.item_id) || r.item_id;
      if (!itemId) throw err(400, 'Pick the stock item to issue for this request');
      const qty = req.body.qty == null || req.body.qty === '' ? r.qty : num(req.body.qty);
      const allocationId = allocate({
        item_id: itemId, teacher_id: r.teacher_id, qty, due_back: req.body.due_back, returnable: req.body.returnable !== false,
        remarks: `Request #${r.id}${r.purpose ? ': ' + r.purpose : ''}`, request_id: r.id, userId: req.user.id,
      });
      db.prepare("UPDATE inv_requests SET status = 'approved', item_id = ?, remarks = ?, decided_by = ?, decided_on = ?, allocation_id = ? WHERE id = ?")
        .run(itemId, remarks || null, req.user.id, today(), allocationId, r.id);
      return { status: 'approved', allocation_id: allocationId };
    })();
    res.json({ ok: true, ...out });
  },
  requestCancel(req, res) {
    const r = db.prepare('SELECT * FROM inv_requests WHERE id = ?').get(req.params.id);
    if (!r) return res.status(404).json({ error: 'Request not found' });
    if (req.user.role !== 'admin' && r.teacher_id !== req.user.linked_id) return res.status(403).json({ error: 'You can only cancel your own requests' });
    if (r.status !== 'pending') return res.status(400).json({ error: `Request is already ${r.status}` });
    db.prepare("UPDATE inv_requests SET status = 'cancelled', decided_on = ? WHERE id = ?").run(today(), r.id);
    res.json({ ok: true });
  },
};

registerReport({
  key: 'inventory-allocations', title: 'Staff Allocation Report', group: 'Inventory',
  description: 'Items issued to staff and what is still to be returned.',
  params: [
    { name: 'teacher_id', label: 'Staff', type: 'teacher' },
    { name: 'state', label: 'Show', type: 'select', options: [{ value: 'open', label: 'Not yet returned' }, { value: 'returned', label: 'Returned' }, { value: 'consumed', label: 'Consumed' }] },
    { name: 'from', label: 'Allocated From', type: 'date', default: 'yearStart' },
    { name: 'to', label: 'Allocated To', type: 'date', default: 'today' },
  ],
  columns: [
    { key: 'allocated_on', label: 'Date', type: 'date' }, { key: 'staff_name', label: 'Staff' }, { key: 'department', label: 'Department' },
    { key: 'item_name', label: 'Item' }, { key: 'qty', label: 'Issued', type: 'number', total: true },
    { key: 'returned_qty', label: 'Returned', type: 'number', total: true }, { key: 'outstanding', label: 'Outstanding', type: 'number', total: true },
    { key: 'due_back', label: 'Due Back', type: 'date' }, { key: 'status', label: 'Status' },
  ],
  run: (p) => db.prepare(`${ALLOC_SELECT}
    WHERE a.allocated_on BETWEEN ? AND ? AND (? = '' OR a.teacher_id = ?)
      AND (? = '' OR (? = 'open' AND a.status IN ('allocated','partially_returned')) OR a.status = ?)
    ORDER BY a.allocated_on DESC`).all(p.from, p.to, p.teacher_id, p.teacher_id, p.state, p.state, p.state)
    .map(r => ({ ...r, status: r.status.replace('_', ' '), outstanding: r.returnable ? r.outstanding : 0 })),
});

registerReport({
  key: 'inventory-requests', title: 'Staff Requests Report', group: 'Inventory',
  params: [
    { name: 'from', label: 'From', type: 'date', default: 'monthStart' },
    { name: 'to', label: 'To', type: 'date', default: 'today' },
    { name: 'status', label: 'Status', type: 'select', options: ['pending', 'approved', 'rejected', 'cancelled'] },
  ],
  columns: [
    { key: 'requested_on', label: 'Requested', type: 'date' }, { key: 'staff_name', label: 'Staff' }, { key: 'item_label', label: 'Item' },
    { key: 'qty', label: 'Qty', type: 'number', total: true }, { key: 'purpose', label: 'Purpose' }, { key: 'status', label: 'Status' },
    { key: 'decided_on', label: 'Decided', type: 'date' }, { key: 'decided_by_name', label: 'By' }, { key: 'remarks', label: 'Remarks' },
  ],
  run: (p) => db.prepare(`${REQ_SELECT}
    WHERE date(r.requested_on, 'localtime') BETWEEN ? AND ? AND (? = '' OR r.status = ?) ORDER BY r.id DESC`)
    .all(p.from, p.to, p.status, p.status),
});

function register(router) {
  const A = [auth, role(...ROLES.ADMIN)];
  const S = [auth, role(...ROLES.STAFF)];
  router.get('/inv/stores', ...S, h.stores);
  router.post('/inv/stores', ...A, safe(h.storeSave));
  router.put('/inv/stores/:id', ...A, safe(h.storeSave));
  router.delete('/inv/stores/:id', ...A, safe(h.storeRemove));
  router.get('/inv/items', ...S, h.items);
  router.put('/inv/items/:id/store', ...A, safe(h.itemStore));
  router.get('/inv/allocations', ...S, h.allocations);
  router.post('/inv/allocations', ...A, safe(h.allocationCreate));
  router.post('/inv/allocations/:id/return', ...A, safe(h.allocationReturn));
  router.get('/inv/requests', ...S, h.requests);
  router.post('/inv/requests', ...S, safe(h.requestCreate));
  router.post('/inv/requests/:id/decision', ...A, safe(h.requestDecision));
  router.post('/inv/requests/:id/cancel', ...S, safe(h.requestCancel));
}

module.exports = { register };
