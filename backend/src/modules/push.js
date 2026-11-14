// Notifications for the Android and iOS apps (utils/appPush.js), the installed web app (PWA) and browsers that allow
// them (Web Push), plus an inbox that always works. Notifications are triggered from utils/events 'api:change', so other modules need no edits.
//
// Works without setup: a VAPID key pair is generated on first start and kept in the database. To use your own
// (e.g. to share one across servers), set in backend/.env: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and
// VAPID_SUBJECT (mailto:office@yourschool.in or https://erp.yourschool.in).
const webpush = require('web-push');
const { sendToDevice, appPushStatus } = require('../utils/appPush');
const { db, ROLES, auth, role, safe, today } = require('./_kit');
const { familyUserIds } = require('../utils/family');
const events = require('../utils/events');

db.exec(`
  CREATE TABLE IF NOT EXISTS push_absent_log (
    student_id INTEGER NOT NULL, date TEXT NOT NULL, PRIMARY KEY (student_id, date)
  );
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    endpoint TEXT UNIQUE NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS ix_push_subscriptions_user ON push_subscriptions(user_id);
  CREATE TABLE IF NOT EXISTS push_vapid (id INTEGER PRIMARY KEY CHECK (id = 1), public_key TEXT NOT NULL, private_key TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS push_inbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    link TEXT,
    kind TEXT,
    delivery TEXT NOT NULL DEFAULT 'pending' CHECK (delivery IN ('pending','sent','no_device','not_configured','failed')),
    read_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS ix_push_inbox_user ON push_inbox(user_id, created_at);
`);

/* ---------- VAPID keys ---------- */
function vapid() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  let row = db.prepare('SELECT public_key, private_key FROM push_vapid WHERE id = 1').get();
  if (!row) {
    const k = webpush.generateVAPIDKeys();
    db.prepare('INSERT OR IGNORE INTO push_vapid (id, public_key, private_key) VALUES (1, ?, ?)').run(k.publicKey, k.privateKey);
    row = db.prepare('SELECT public_key, private_key FROM push_vapid WHERE id = 1').get();
  }
  return { publicKey: row.public_key, privateKey: row.private_key };
}
const KEYS = vapid();
const subject = () => {
  const s = process.env.VAPID_SUBJECT || process.env.APP_URL || '';
  return /^(mailto:|https:\/\/)/.test(s) ? s : 'mailto:office@school.invalid';
};
webpush.setVapidDetails(subject(), KEYS.publicKey, KEYS.privateKey);

// Sends one message to one browser subscription. Returns 'sent' | 'gone' | 'failed'.
async function sendTo(sub, msg) {
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify({ title: msg.title, body: msg.body, link: msg.link || '/home', kind: msg.kind || 'general', inbox_id: msg.inboxId || null }),
      { TTL: 24 * 3600, urgency: 'high' });
    return 'sent';
  } catch (e) {
    if (e.statusCode === 404 || e.statusCode === 410) return 'gone';
    console.error(`Web push failed (${e.statusCode || '-'}): ${String(e.body || e.message).slice(0, 200)}`);
    return 'failed';
  }
}

/* ---------- Notify ---------- */
const insertInbox = db.prepare('INSERT INTO push_inbox (user_id, title, body, link, kind) VALUES (?, ?, ?, ?, ?)');
const setDelivery = db.prepare('UPDATE push_inbox SET delivery = ? WHERE id = ?');

/**
 * Notify users by id. Each gets an inbox row; each of their browsers/installed apps that allowed notifications
 * gets a Web Push. Never throws: delivery problems are recorded on the inbox row.
 */
async function notify(userIds, { title, body, link, kind }) {
  const ids = [...new Set((userIds || []).map(Number).filter(Boolean))];
  if (!ids.length || !title || !body) return { users: 0 };
  let sent = 0;
  for (const uid of ids) {
    const inboxId = insertInbox.run(uid, String(title).slice(0, 120), String(body).slice(0, 500), link || null, kind || null).lastInsertRowid;
    const subs = db.prepare('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?').all(uid);
    const devices = db.prepare('SELECT id, token, platform FROM push_devices WHERE user_id = ?').all(uid);
    if (!subs.length && !devices.length) { setDelivery.run('no_device', inboxId); continue; }
    let ok = false, unconfigured = 0;
    const msg = { title, body, link, kind, inboxId };
    for (const sub of subs) {
      const r = await sendTo(sub, msg);
      if (r === 'sent') ok = true;
      else if (r === 'gone') db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id);
    }
    for (const d of devices) {
      const r = await sendToDevice(d, msg);
      if (r === 'sent') ok = true;
      else if (r === 'gone') db.prepare('DELETE FROM push_devices WHERE id = ?').run(d.id);
      else if (r === 'not_configured') unconfigured++;
    }
    setDelivery.run(ok ? 'sent' : (unconfigured && unconfigured === subs.length + devices.length ? 'not_configured' : 'failed'), inboxId);
    if (ok) sent++;
  }
  return { users: ids.length, sent };
}

/* ---------- Recipients ---------- */
const hasColumn = (table, col) => db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === col);
const activeUsers = (sql, ...p) => db.prepare(`SELECT id FROM users WHERE active = 1 AND ${sql}`).all(...p).map(r => r.id);

// Student and parent logins of the given students.
const familyOf = (studentIds) => familyUserIds(studentIds);
const classFamilies = (classIds) => {
  const ids = [...new Set(classIds.map(Number).filter(Boolean))];
  if (!ids.length) return [];
  const students = db.prepare(`SELECT id FROM students WHERE class_id IN (${ids.map(() => '?').join(',')}) AND COALESCE(status, 'active') = 'active'`)
    .all(...ids).map(r => r.id);
  return familyOf(students);
};
const teacherUsers = (teacherId) => activeUsers("role = 'teacher' AND linked_id = ?", teacherId);
// Super admins plus principals (role_key arrives with the roles feature; tolerate its absence).
const leaders = () => (hasColumn('users', 'role_key')
  ? activeUsers("(role = 'admin' OR role_key = 'principal')")
  : activeUsers("role = 'admin'"));
const audienceUsers = (audience) => {
  if (!audience || audience === 'all') return activeUsers('1 = 1');
  return activeUsers('role = ?', audience);
};

/* ---------- Triggers ---------- */
const fmtDate = (d) => {
  const [y, m, day] = String(d || '').split('-');
  return y && m && day ? `${day}/${m}/${y}` : String(d || '');
};
const className = (id) => {
  const c = db.prepare('SELECT name, section FROM classes WHERE id = ?').get(id);
  return c ? `${c.name} ${c.section}` : 'your class';
};

// Each rule: method, path pattern, and a handler that returns notifications to send.
const RULES = [
  {
    method: 'POST', re: /^\/api\/leaves\/(\d+)\/decision$/,
    run: ({ m, body }) => {
      const leave = db.prepare('SELECT * FROM staff_leaves WHERE id = ?').get(m[1]);
      if (!leave) return [];
      const word = { approve: 'approved', reject: 'rejected', cancel: 'cancelled' }[body.action] || leave.status;
      return [{ to: teacherUsers(leave.teacher_id), kind: 'leave', link: '/leaves',
        title: `Leave ${word}`, body: `Your ${leave.leave_type} (${fmtDate(leave.from_date)} – ${fmtDate(leave.to_date)}) was ${word}.${leave.remarks ? ` Remarks: ${leave.remarks}` : ''}` }];
    },
  },
  {
    method: 'POST', re: /^\/api\/leaves$/,
    run: ({ result, user }) => {
      const leave = result?.id && db.prepare(`SELECT l.*, t.full_name FROM staff_leaves l JOIN teachers t ON t.id = l.teacher_id WHERE l.id = ?`).get(result.id);
      if (!leave) return [];
      return [{ to: leaders().filter(id => id !== user.id), kind: 'leave', link: '/leaves',
        title: 'New leave request', body: `${leave.full_name}: ${leave.leave_type}, ${fmtDate(leave.from_date)} – ${fmtDate(leave.to_date)}.` }];
    },
  },
  {
    method: 'POST', re: /^\/api\/attendance\/bulk$/,
    run: ({ body }) => {
      // Attendance is often saved several times a day; tell each family once per student and date.
      const claim = db.prepare('INSERT OR IGNORE INTO push_absent_log (student_id, date) VALUES (?, ?)');
      const absent = (body.records || []).filter(r => r && r.status === 'absent').map(r => Number(r.student_id))
        .filter(sid => sid && claim.run(sid, String(body.date || '')).changes);
      return absent.map(sid => {
        const s = db.prepare('SELECT full_name FROM students WHERE id = ?').get(sid);
        return { to: familyOf([sid]), kind: 'attendance', link: '/dashboard',
          title: body.date && body.date !== today() ? 'Marked absent' : 'Absent today', body: `${s?.full_name || 'Your child'} was marked absent on ${fmtDate(body.date)}.` };
      });
    },
  },
  {
    method: 'PUT', re: /^\/api\/exam\/publish$/,
    run: ({ body }) => {
      if (!body.exam_id || !body.class_id) return [];
      if (!body.marks_published && !body.result_published) return [];
      const exam = db.prepare('SELECT name FROM exams WHERE id = ?').get(body.exam_id);
      const what = body.result_published ? 'Result' : 'Marks';
      return [{ to: classFamilies([body.class_id]), kind: 'result', link: body.result_published ? '/exams/report-card' : '/marks',
        title: `${what} published`, body: `${what} for ${exam?.name || 'the exam'} (${className(body.class_id)}) are now available.` }];
    },
  },
  {
    method: 'POST', re: /^\/api\/announcements$/,
    run: ({ body, user }) => [{ to: audienceUsers(body.audience).filter(id => id !== user.id), kind: 'notice', link: '/announcements',
      title: 'New notice', body: String(body.title || 'A new announcement has been posted.') }],
  },
  {
    method: 'POST', re: /^\/api\/homework$/,
    run: ({ body }) => [{ to: classFamilies([body.class_id]), kind: 'homework', link: '/homework',
      title: `Homework: ${body.subject || ''}`.trim(), body: `${body.title || 'New homework'}${body.due_date ? ` (due ${fmtDate(body.due_date)})` : ''}` }],
  },
  {
    method: 'POST', re: /^\/api\/comm\/diary$/,
    run: ({ body }) => [{ to: classFamilies([body.class_id]), kind: 'diary', link: '/academic-comm/diary',
      title: `School diary – ${className(body.class_id)}`, body: String(body.content || '').slice(0, 140) }],
  },
  {
    method: 'POST', re: /^\/api\/comm\/posts$/,
    run: ({ body }) => {
      const classIds = body.scope === 'class'
        ? db.prepare('SELECT id FROM classes WHERE name = ?').all(body.class_name).map(r => r.id)
        : [body.class_id];
      return [{ to: classFamilies(classIds), kind: 'homework', link: '/homework',
        title: `${body.category || 'Notice'}${body.subject ? `: ${body.subject}` : ''}`, body: String(body.title || 'New post from school') }];
    },
  },
  {
    method: 'POST', re: /^\/api\/comm\/online-classes$/,
    run: ({ body }) => [{ to: classFamilies([body.class_id]), kind: 'online-class', link: '/academic-comm/online-classes',
      title: `Online class: ${body.subject || ''}`.trim(), body: `Scheduled for ${String(body.start_at || '').replace('T', ' ')}.` }],
  },
  {
    method: 'POST', re: /^\/api\/comm\/news$/,
    run: ({ body, user }) => [{ to: activeUsers('1 = 1').filter(id => id !== user.id), kind: 'news', link: '/academic-comm/news',
      title: 'School news', body: String(body.title || 'New school news') }],
  },
  {
    method: 'POST', re: /^\/api\/finance\/collect$/,
    run: ({ result, body }) => {
      if (!result?.receipt_no) return [];
      const row = db.prepare('SELECT student_id FROM fee_payments WHERE receipt_no = ? LIMIT 1').get(result.receipt_no);
      const sid = row?.student_id || body.student_id;
      const amount = Number(result.grand_total ?? result.total ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
      return [{ to: familyOf([sid]), kind: 'fee', link: '/fees',
        title: 'Fee received', body: `₹${amount} received. Receipt ${result.receipt_no}. Thank you.` }];
    },
  },
  {
    method: 'POST', re: /^\/api\/finance\/app-blocks$/,
    run: ({ body }) => (body.student_ids || []).map(sid => ({ to: familyOf([sid]), kind: 'fee', link: '/fees',
      title: 'App access paused', body: `${String(body.reason || 'Fee pending').trim()}. Please contact the school office.` })),
  },
  {
    method: 'POST', re: /^\/api\/suggestions$/,
    run: ({ body }) => [{ to: leaders(), kind: 'suggestion', link: '/suggestions',
      title: 'New suggestion', body: String(body.subject || 'A new suggestion was posted.') }],
  },
];

events.on('api:change', (e) => {
  const rule = RULES.find(r => r.method === e.method && r.re.test(e.path));
  if (!rule) return;
  let list;
  try { list = rule.run({ ...e, m: e.path.match(rule.re) }) || []; }
  catch (err) { console.error('push rule failed:', err.message); return; }
  for (const n of list) notify(n.to, n).catch(err => console.error('push notify failed:', err.message));
});

/* ---------- Routes ---------- */
function register(router) {
  router.get('/push/public-key', auth, (req, res) => res.json({ publicKey: KEYS.publicKey }));
  // Save this browser's push subscription (from PushManager.subscribe) for the signed-in user.
  router.post('/push/subscribe', auth, safe((req, res) => {
    const sub = req.body?.subscription || req.body || {};
    const endpoint = String(sub.endpoint || '');
    const p256dh = String(sub.keys?.p256dh || ''), authKey = String(sub.keys?.auth || '');
    if (!/^https:\/\//.test(endpoint) || endpoint.length > 2048 || !p256dh || !authKey || p256dh.length > 200 || authKey.length > 100) {
      return res.status(400).json({ error: 'A valid push subscription is required' });
    }
    db.prepare(`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, last_seen = CURRENT_TIMESTAMP`)
      .run(req.user.id, endpoint, p256dh, authKey, String(req.headers['user-agent'] || '').slice(0, 200));
    res.json({ ok: true });
  }));
  // On sign-out the browser stops getting this user's notifications.
  router.post('/push/unsubscribe', auth, safe((req, res) => {
    const info = db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').run(String(req.body?.endpoint || ''), req.user.id);
    res.json({ ok: true, removed: info.changes });
  }));
  // The Android/iOS app registers its device token after sign-in, and removes it on sign-out.
  router.post('/push/register', auth, safe((req, res) => {
    const token = String(req.body.token || '').trim();
    if (token.length < 20 || token.length > 4096) return res.status(400).json({ error: 'A valid device token is required' });
    const platform = req.body.platform === 'ios' ? 'ios' : 'android';
    db.prepare(`INSERT INTO push_devices (user_id, token, platform, app_version, last_seen) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id, platform = excluded.platform,
        app_version = excluded.app_version, last_seen = CURRENT_TIMESTAMP`)
      .run(req.user.id, token, platform, String(req.body.app_version || '').slice(0, 40) || null);
    res.json({ ok: true });
  }));
  router.post('/push/unregister', auth, safe((req, res) => {
    const info = db.prepare('DELETE FROM push_devices WHERE token = ? AND user_id = ?').run(String(req.body.token || ''), req.user.id);
    res.json({ ok: true, removed: info.changes });
  }));
  router.get('/push/status', auth, (req, res) => {
    const mine = (t) => db.prepare(`SELECT COUNT(*) AS c FROM ${t} WHERE user_id = ?`).get(req.user.id).c;
    const out = { configured: true, apps: appPushStatus(), my_devices: mine('push_subscriptions') + mine('push_devices') };
    if (req.user.role === 'admin') {
      out.devices = db.prepare('SELECT (SELECT COUNT(*) FROM push_subscriptions) + (SELECT COUNT(*) FROM push_devices) AS c').get().c;
      out.users_with_app = db.prepare('SELECT COUNT(*) AS c FROM (SELECT user_id FROM push_subscriptions UNION SELECT user_id FROM push_devices)').get().c;
      out.by_platform = db.prepare('SELECT platform, COUNT(*) AS c FROM push_devices GROUP BY platform').all();
    }
    res.json(out);
  });
  router.get('/push/inbox', auth, (req, res) => {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const items = db.prepare(`SELECT id, title, body, link, kind, read_at, created_at FROM push_inbox
      WHERE user_id = ? ORDER BY id DESC LIMIT ?`).all(req.user.id, limit);
    const unread = db.prepare('SELECT COUNT(*) AS c FROM push_inbox WHERE user_id = ? AND read_at IS NULL').get(req.user.id).c;
    res.json({ unread, items });
  });
  router.post('/push/inbox/read-all', auth, (req, res) => {
    const info = db.prepare('UPDATE push_inbox SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND read_at IS NULL').run(req.user.id);
    res.json({ ok: true, updated: info.changes });
  });
  router.post('/push/inbox/:id/read', auth, (req, res) => {
    const info = db.prepare('UPDATE push_inbox SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP) WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    if (!info.changes) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  });
  // Admin test: send a notification to yourself to check the setup end to end.
  router.post('/push/test', auth, role(...ROLES.ADMIN), safe(async (req, res, next) => {
    try { res.json(await notify([req.user.id], { title: 'Test notification', body: 'Push notifications are working.', link: '/notifications', kind: 'test' })); }
    catch (e) { next(e); }
  }));
}

module.exports = { register, notify };
