// Online fee payment through Razorpay (UPI, cards, netbanking).
// Configure in backend/.env: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET (and RAZORPAY_API_BASE only for testing).
// The amount is always worked out on the server from the student's dues, and a receipt is posted exactly once,
// whichever of the browser callback, the webhook or the admin's reconcile arrives first.
const crypto = require('crypto');
const express = require('express');
const { db, ROLES, auth, role, canSeeStudent, today } = require('./_kit');
const fees = require('../controllers/feesController');

db.exec(`
  CREATE TABLE IF NOT EXISTS online_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    user_id INTEGER,
    order_id TEXT UNIQUE NOT NULL,
    amount REAL NOT NULL,
    amount_paise INTEGER NOT NULL,
    items TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','conflict','cancelled')),
    payment_id TEXT,
    method TEXT,
    receipt_no TEXT,
    error TEXT,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    paid_at TEXT
  );
  CREATE INDEX IF NOT EXISTS ix_online_payments_student ON online_payments(student_id, created_at);
`);

const cfg = () => ({
  keyId: process.env.RAZORPAY_KEY_ID || '',
  secret: process.env.RAZORPAY_KEY_SECRET || '',
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  base: (process.env.RAZORPAY_API_BASE || 'https://api.razorpay.com').replace(/\/+$/, ''),
});
const configured = () => !!(cfg().keyId && cfg().secret);
const httpError = (status, message) => Object.assign(new Error(message), { status });
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''), 'utf8'), y = Buffer.from(String(b || ''), 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
const hmac = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');

async function razorpay(method, path, body) {
  const { keyId, secret, base } = cfg();
  const res = await fetch(base + path, {
    method,
    headers: { Authorization: 'Basic ' + Buffer.from(`${keyId}:${secret}`).toString('base64'), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw httpError(502, `Razorpay: ${data?.error?.description || `request failed (${res.status})`}`);
  return data;
}

// Outstanding dues of a student with today's late fine, as the fee counter would charge them.
function duesFor(studentId) {
  const st = fees.settings();
  return db.prepare('SELECT * FROM fees WHERE student_id = ? AND ROUND(amount - paid, 2) > 0 ORDER BY due_date, id').all(studentId)
    .map(f => ({ fee_id: f.id, label: f.head ? `${f.head} (${f.term})` : f.term, balance: round2(f.amount - (f.paid || 0)), fine: fees.fineFor(f, today(), st), due_date: f.due_date }));
}

function studentFor(req, studentId) {
  const id = Number(studentId || req.user.linked_id);
  if (!id) throw httpError(400, 'Choose a student');
  if (!canSeeStudent(req.user, id)) throw httpError(403, 'Forbidden');
  const s = db.prepare('SELECT id, full_name, admission_no, contact, email FROM students WHERE id = ?').get(id);
  if (!s) throw httpError(404, 'Student not found');
  return s;
}

/**
 * Mark an order paid and post its receipt. Safe to call many times for the same order: only the first call posts.
 * If the dues changed meanwhile (e.g. paid at the counter), the payment is kept as 'conflict' for the office to refund or adjust.
 */
function complete(orderId, paymentId, { method, amountPaise } = {}) {
  return db.transaction(() => {
    const p = db.prepare('SELECT * FROM online_payments WHERE order_id = ?').get(orderId);
    if (!p) throw httpError(404, 'Unknown order');
    if (p.status === 'paid') return { ...p, already: true };
    if (amountPaise != null && Number(amountPaise) !== p.amount_paise) {
      db.prepare("UPDATE online_payments SET status = 'conflict', payment_id = ?, error = ? WHERE id = ?")
        .run(paymentId, `Paid amount ${amountPaise / 100} does not match the order amount ${p.amount}`, p.id);
      return db.prepare('SELECT * FROM online_payments WHERE id = ?').get(p.id);
    }
    try {
      const items = JSON.parse(p.items);
      const r = fees.collect({ student_id: p.student_id, items, mode: 'online', remarks: `Razorpay ${paymentId}`, userId: p.user_id });
      db.prepare('UPDATE fee_payments SET bank_ref = ? WHERE receipt_no = ?').run(paymentId, r.receipt_no);
      db.prepare("UPDATE online_payments SET status = 'paid', payment_id = ?, method = ?, receipt_no = ?, error = NULL, paid_at = ? WHERE id = ?")
        .run(paymentId, method || null, r.receipt_no, new Date().toISOString(), p.id);
    } catch (e) {
      if (!e.status) throw e;
      db.prepare("UPDATE online_payments SET status = 'conflict', payment_id = ?, method = ?, error = ? WHERE id = ?")
        .run(paymentId, method || null, `Paid online but the receipt could not be posted: ${e.message}`, p.id);
    }
    return db.prepare('SELECT * FROM online_payments WHERE id = ?').get(p.id);
  })();
}

const view = (p) => p && ({
  id: p.id, order_id: p.order_id, student_id: p.student_id, amount: p.amount, status: p.status, payment_id: p.payment_id,
  method: p.method, receipt_no: p.receipt_no, error: p.error, note: p.note, created_at: p.created_at, paid_at: p.paid_at,
  items: JSON.parse(p.items),
});

const h = {
  config(req, res) {
    res.json({ enabled: configured(), key_id: configured() ? cfg().keyId : null });
  },
  dues(req, res) {
    const s = studentFor(req, req.query.student_id);
    const dues = duesFor(s.id);
    res.json({ enabled: configured(), student: { id: s.id, full_name: s.full_name, admission_no: s.admission_no }, dues,
      total: round2(dues.reduce((a, d) => a + d.balance + d.fine, 0)) });
  },
  async order(req, res) {
    if (!configured()) throw httpError(400, 'Online payment is not set up yet. Please pay at the school office.');
    const s = studentFor(req, req.body.student_id);
    const wanted = Array.isArray(req.body.fee_ids) ? [...new Set(req.body.fee_ids.map(Number).filter(Boolean))] : [];
    if (!wanted.length) throw httpError(400, 'Select at least one fee to pay');
    const dues = new Map(duesFor(s.id).map(d => [d.fee_id, d]));
    const items = [];
    for (const id of wanted) {
      const d = dues.get(id);
      if (!d) throw httpError(400, 'One of the selected fees is not an outstanding due of this student');
      items.push({ fee_id: d.fee_id, amount: d.balance, fine: d.fine });
    }
    // Any amount the browser sends is ignored: the payable total always comes from the dues on the server.
    const amount = round2(items.reduce((a, i) => a + i.amount + i.fine, 0));
    const amountPaise = Math.round(amount * 100);
    if (amountPaise < 100) throw httpError(400, 'Amount is too small to pay online');
    const order = await razorpay('POST', '/v1/orders', {
      amount: amountPaise, currency: 'INR', receipt: `S${s.id}-${Date.now().toString(36)}`.slice(0, 40),
      notes: { student_id: String(s.id), admission_no: s.admission_no || '' },
    });
    if (!order.id || Number(order.amount) !== amountPaise) throw httpError(502, 'Razorpay returned an unexpected order');
    db.prepare('INSERT INTO online_payments (student_id, user_id, order_id, amount, amount_paise, items) VALUES (?, ?, ?, ?, ?, ?)')
      .run(s.id, req.user.id, order.id, amount, amountPaise, JSON.stringify(items));
    const school = db.prepare('SELECT school_name FROM school_settings WHERE id = 1').get()?.school_name || 'School Fees';
    res.status(201).json({ key_id: cfg().keyId, order_id: order.id, amount, amount_paise: amountPaise, currency: 'INR',
      name: school, description: `Fees for ${s.full_name} (${s.admission_no})`,
      prefill: { name: s.full_name, contact: s.contact || '', email: s.email || '' } });
  },
  verify(req, res) {
    // Without a secret the signature check below would pass for anyone who computes HMAC('', ...).
    if (!configured()) throw httpError(400, 'Online payment is not set up');
    const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: sig } = req.body || {};
    if (!orderId || !paymentId || !sig) throw httpError(400, 'Missing payment details');
    const p = db.prepare('SELECT * FROM online_payments WHERE order_id = ?').get(orderId);
    if (!p || !canSeeStudent(req.user, p.student_id)) throw httpError(404, 'Payment not found');
    if (!safeEqual(hmac(cfg().secret, `${orderId}|${paymentId}`), sig)) throw httpError(400, 'Payment signature did not match');
    const done = complete(orderId, paymentId);
    res.json(view(done));
  },
  mine(req, res) {
    const s = studentFor(req, req.query.student_id);
    res.json(db.prepare('SELECT * FROM online_payments WHERE student_id = ? ORDER BY id DESC LIMIT 50').all(s.id).map(view));
  },
  list(req, res) {
    const { status, from, to } = req.query;
    const w = [], p = [];
    if (status) { w.push('op.status = ?'); p.push(status); }
    if (from) { w.push("date(op.created_at, 'localtime') >= ?"); p.push(from); }
    if (to) { w.push("date(op.created_at, 'localtime') <= ?"); p.push(to); }
    const rows = db.prepare(`SELECT op.*, s.full_name AS student_name, s.admission_no, c.name AS class_name, c.section AS class_section, u.full_name AS paid_by
      FROM online_payments op JOIN students s ON s.id = op.student_id LEFT JOIN classes c ON c.id = s.class_id LEFT JOIN users u ON u.id = op.user_id
      ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY op.id DESC LIMIT 1000`).all(...p);
    res.json({ enabled: configured(), rows: rows.map(r => ({ ...view(r), student_name: r.student_name, admission_no: r.admission_no,
      class_name: r.class_name, class_section: r.class_section, paid_by: r.paid_by })) });
  },
  // Ask Razorpay whether a pending order was actually paid (e.g. the browser closed before returning).
  async reconcile(req, res) {
    const p = db.prepare('SELECT * FROM online_payments WHERE id = ?').get(req.params.id);
    if (!p) throw httpError(404, 'Not found');
    if (p.status !== 'pending' && p.status !== 'failed') return res.json({ ...view(p), message: `Already ${p.status}` });
    if (!configured()) throw httpError(400, 'Razorpay is not configured');
    const r = await razorpay('GET', `/v1/orders/${encodeURIComponent(p.order_id)}/payments`);
    const captured = (r.items || []).find(x => x.status === 'captured');
    if (captured) return res.json({ ...view(complete(p.order_id, captured.id, { method: captured.method, amountPaise: captured.amount })), message: 'Payment found and receipt posted' });
    const failed = (r.items || []).length && (r.items || []).every(x => x.status === 'failed');
    if (failed) db.prepare("UPDATE online_payments SET status = 'failed', error = 'Payment failed at Razorpay' WHERE id = ?").run(p.id);
    res.json({ ...view(db.prepare('SELECT * FROM online_payments WHERE id = ?').get(p.id)), message: failed ? 'Payment failed' : 'No completed payment yet' });
  },
  note(req, res) {
    const p = db.prepare('SELECT * FROM online_payments WHERE id = ?').get(req.params.id);
    if (!p) throw httpError(404, 'Not found');
    const status = req.body.status;
    if (status && !(p.status !== 'paid' && ['cancelled', 'pending'].includes(status))) throw httpError(400, 'Only unpaid orders can be cancelled or reopened');
    db.prepare('UPDATE online_payments SET note = ?, status = COALESCE(?, status) WHERE id = ?')
      .run(String(req.body.note || '').slice(0, 500) || null, status || null, p.id);
    res.json(view(db.prepare('SELECT * FROM online_payments WHERE id = ?').get(p.id)));
  },
};

// Razorpay webhook: must see the raw body to check the signature, so it is mounted before express.json.
function webhook(req, res) {
  const secret = cfg().webhookSecret;
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  if (!secret) return res.status(400).json({ error: 'Webhook secret not configured' });
  if (!safeEqual(hmac(secret, raw), req.get('X-Razorpay-Signature'))) return res.status(400).json({ error: 'Invalid signature' });
  let evt;
  try { evt = JSON.parse(raw.toString('utf8')); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
  const pay = evt?.payload?.payment?.entity;
  try {
    if ((evt.event === 'payment.captured' || evt.event === 'order.paid') && pay?.order_id) {
      const known = db.prepare('SELECT id FROM online_payments WHERE order_id = ?').get(pay.order_id);
      if (known) complete(pay.order_id, pay.id, { method: pay.method, amountPaise: pay.amount });
    } else if (evt.event === 'payment.failed' && pay?.order_id) {
      db.prepare("UPDATE online_payments SET status = 'failed', payment_id = ?, error = ? WHERE order_id = ? AND status = 'pending'")
        .run(pay.id, String(pay.error_description || 'Payment failed').slice(0, 300), pay.order_id);
    }
  } catch (e) {
    console.error('Razorpay webhook failed:', e.message);
    return res.status(500).json({ error: 'Could not process' });   // Razorpay retries
  }
  res.json({ ok: true });
}

const wrap = (fn) => async (req, res, next) => {
  try { await fn(req, res, next); } catch (e) { if (e.status) return res.status(e.status).json({ error: e.message }); next(e); }
};

function registerRoot(app) {
  app.post('/api/payments/webhook', express.raw({ type: '*/*', limit: '1mb' }), webhook);
}

function register(router) {
  router.get('/payments/config', auth, h.config);
  router.get('/payments/dues', auth, wrap(h.dues));
  router.post('/payments/order', auth, role('student', 'parent', 'admin'), wrap(h.order));
  router.post('/payments/verify', auth, wrap(h.verify));
  router.get('/payments/mine', auth, wrap(h.mine));
  router.get('/payments', auth, role(...ROLES.ADMIN), wrap(h.list));
  router.post('/payments/:id/reconcile', auth, role(...ROLES.ADMIN), wrap(h.reconcile));
  router.put('/payments/:id', auth, role(...ROLES.ADMIN), wrap(h.note));
}

module.exports = { register, registerRoot, complete };
