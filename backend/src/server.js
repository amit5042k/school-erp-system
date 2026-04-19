require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const routes = require('./routes');

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:3000', credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 30 }));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'school-erp-backend', time: new Date().toISOString() }));
app.use('/api', routes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
