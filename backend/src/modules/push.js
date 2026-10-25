// Push notifications for the Android app (FCM HTTP v1) plus an inbox that works without FCM.
// Notifications are triggered from utils/events 'api:change', so other modules need no edits.
//
// Configure in backend/.env (optional):
//   FCM_SERVICE_ACCOUNT_FILE=/path/to/firebase-service-account.json   (or FCM_SERVICE_ACCOUNT_JSON='{...}')
//   FCM_BASE_URL=https://fcm.googleapis.com   (override only for testing)
// Without credentials every notification still lands in the inbox; delivery is recorded as 'not_configured'.
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { db, ROLES, auth, role, safe } = require('./_kit');
const events = require('../utils/events');

db.exec(`
  CREATE TABLE IF NOT EXISTS push_devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    platform TEXT NOT NULL DEFAULT 'android',
    app_version TEXT,
    last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS ix_push_devices_user ON push_devices(user_id);
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

/* ---------- FCM HTTP v1 ---------- */
let serviceAccount;
function credentials() {
  if (serviceAccount !== undefined) return serviceAccount;
  serviceAccount = null;
  try {
    const raw = process.env.FCM_SERVICE_ACCOUNT_JSON
      || (process.env.FCM_SERVICE_ACCOUNT_FILE && fs.readFileSync(process.env.FCM_SERVICE_ACCOUNT_FILE, 'utf8'));
    if (raw) {
      const sa = JSON.parse(raw);
      if (sa.client_email && sa.private_key && sa.project_id) serviceAccount = sa;
      else console.error('FCM service account is missing client_email, private_key or project_id');
    }
  } catch (e) { console.error('Could not read FCM service account:', e.message); }
  return serviceAccount;
}

let cachedToken = null;
async function accessToken(sa) {
  if (cachedToken && cachedToken.exp - 60 > Date.now() / 1000) return cachedToken.value;
  const tokenUri = sa.token_uri || 'https://oauth2.googleapis.com/token';
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    { iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: tokenUri, iat: now, exp: now + 3600 },
    sa.private_key, { algorithm: 'RS256' });
  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(`FCM auth failed (${res.status})`);
  cachedToken = { value: data.access_token, exp: now + (data.expires_in || 3600) };
  return cachedToken.value;
}

const UNREGISTERED = /UNREGISTERED|NOT_FOUND|INVALID_ARGUMENT.*registration/i;

// Sends one message to one device token. Returns 'sent' | 'gone' | 'failed'.
async function sendToToken(sa, token, msg) {
  const base = (process.env.FCM_BASE_URL || 'https://fcm.googleapis.com').replace(/\/$/, '');
  const res = await fetch(`${base}/v1/projects/${sa.project_id}/messages:send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await accessToken(sa)}` },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: msg.title, body: msg.body },
        data: { link: msg.link || '/home', kind: msg.kind || 'general', inbox_id: String(msg.inboxId || '') },
        android: { priority: 'HIGH', notification: { channel_id: 'school_erp_default', click_action: 'FCM_PLUGIN_ACTIVITY' } },
      },
    }),
  });
  if (res.ok) return 'sent';
  const text = await res.text().catch(() => '');
  if (res.status === 404 || UNREGISTERED.test(text)) return 'gone';
  console.error(`FCM send failed (${res.status}): ${text.slice(0, 200)}`);
  return 'failed';
}

/* ---------- Notify ---------- */
const insertInbox = db.prepare('INSERT INTO push_inbox (user_id, title, body, link, kind) VALUES (?, ?, ?, ?, ?)');
const setDelivery = db.prepare('UPDATE push_inbox SET delivery = ? WHERE id = ?');

/**
 * Notify users by id. Each gets an inbox row; devices get an FCM push when configured.
 * Never throws: delivery problems are recorded on the inbox row.
 */
async function notify(userIds, { title, body, link, kind }) {
  const ids = [...new Set((userIds || []).map(Number).filter(Boolean))];
  if (!ids.length || !title || !body) return { users: 0 };
  const sa = credentials();
  let sent = 0;
  for (const uid of ids) {
    const inboxId = insertInbox.run(uid, String(title).slice(0, 120), String(body).slice(0, 500), link || null, kind || null).lastInsertRowid;
    const devices = db.prepare('SELECT id, token FROM push_devices WHERE user_id = ?').all(uid);
    if (!devices.length) { setDelivery.run('no_device', inboxId); continue; }
    if (!sa) { setDelivery.run('not_configured', inboxId); continue; }
    let ok = false;
    for (const d of devices) {
      try {
        const r = await sendToToken(sa, d.token, { title, body, link, kind, inboxId });
        if (r === 'sent') ok = true;
        else if (r === 'gone') db.prepare('DELETE FROM push_devices WHERE id = ?').run(d.id);
      } catch (e) { console.error('FCM error:', e.message); }
    }
    setDelivery.run(ok ? 'sent' : 'failed', inboxId);
    if (ok) sent++;
  }
  return { users: ids.length, sent };
}

/* ---------- Recipients ---------- */
const hasColumn = (table, col) => db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === col);
const activeUsers = (sql, ...p) => db.prepare(`SELECT id FROM users WHERE active = 1 AND ${sql}`).all(...p).map(r => r.id);

// Student and parent logins of the given students.
const familyOf = (studentIds) => {
  const ids = [...new Set(studentIds.map(Number).filter(Boolean))];
  if (!ids.length) return [];
  return activeUsers(`role IN ('student','parent') AND linked_id IN (${ids.map(() => '?').join(',')})`, ...ids);
};
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
      const absent = (body.records || []).filter(r => r && r.status === 'absent').map(r => r.student_id);
      return absent.map(sid => {
        const s = db.prepare('SELECT full_name FROM students WHERE id = ?').get(sid);
        return { to: familyOf([sid]), kind: 'attendance', link: '/dashboard',
          title: 'Absent today', body: `${s?.full_name || 'Your child'} was marked absent on ${fmtDate(body.date)}.` };
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
  router.post('/push/register', auth, safe((req, res) => {
    const token = String(req.body.token || '').trim();
    if (token.length < 20 || token.length > 4096) return res.status(400).json({ error: 'A valid device token is required' });
    const platform = ['android', 'ios', 'web'].includes(req.body.platform) ? req.body.platform : 'android';
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
    const out = {
      configured: !!credentials(),
      my_devices: db.prepare('SELECT COUNT(*) AS c FROM push_devices WHERE user_id = ?').get(req.user.id).c,
    };
    if (req.user.role === 'admin') {
      out.devices = db.prepare('SELECT COUNT(*) AS c FROM push_devices').get().c;
      out.users_with_app = db.prepare('SELECT COUNT(DISTINCT user_id) AS c FROM push_devices').get().c;
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
