require('dotenv').config();
process.env.TZ = process.env.TZ || 'Asia/Kolkata';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.error('JWT_SECRET is missing or shorter than 16 characters. Set it in backend/.env (e.g. `openssl rand -hex 32`).');
  process.exit(1);
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const routes = require('./routes');

const app = express();
app.set('trust proxy', 1);
// Uploaded files are loaded by the frontend from another origin (api. subdomain), so allow cross-origin reads.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:3000', credentials: true }));
// Device endpoints (e.g. eSSL ADMS at /iclock) speak plain text and live outside /api.
require('./modules').registerRootModules(app);
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

// Only failed sign-ins count, so a whole staff room behind one school IP can log in at 8am.
// Per username+IP stops password guessing on one account; per IP stops spraying many accounts.
const loginLimitMsg = { error: 'Too many failed sign-in attempts. Please wait 15 minutes and try again.' };
app.use('/api/auth/login', rateLimit({
  windowMs: 15 * 60 * 1000, max: 10, skipSuccessfulRequests: true, message: loginLimitMsg,
  standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}|${String(req.body?.username || '').toLowerCase().slice(0, 64)}`,
}));
app.use('/api/auth/login', rateLimit({
  windowMs: 15 * 60 * 1000, max: 100, skipSuccessfulRequests: true, message: loginLimitMsg,
  standardHeaders: true, legacyHeaders: false,
}));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'school-erp-backend', time: new Date().toISOString() }));
// Activity log: every change (non-GET) request by a signed-in user.
const auditDb = require('./config/db');
const auditIns = auditDb.prepare('INSERT INTO audit_log (user_id, action, path, status, ip) VALUES (?, ?, ?, ?, ?)');
const events = require('./utils/events');
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'OPTIONS') {
    // Keep the JSON reply so listeners (e.g. push notifications) know what was created.
    const json = res.json.bind(res);
    res.json = (body) => { res.locals.body = body; return json(body); };
    res.on('finish', () => {
      if (!req.user) return;
      const path = req.originalUrl.split('?')[0];
      try { auditIns.run(req.user.id, req.method, path.slice(0, 200), res.statusCode, req.ip); } catch (_) { /* never block a request on logging */ }
      if (res.statusCode < 400) {
        setImmediate(() => {
          try { events.emit('api:change', { method: req.method, path, body: req.body || {}, user: req.user, status: res.statusCode, result: res.locals.body }); }
          catch (e) { console.error('event listener failed:', e.message); }
        });
      }
    });
  }
  next();
});
app.use('/api', routes);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, next) => {
  console.error(err);
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
  const status = err.status || 500;
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on the server' : err.message });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
