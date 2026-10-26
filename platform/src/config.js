// Platform settings from platform/.env (see .env.example). Values here end up in generated nginx/pm2 files,
// so the ones that do are validated strictly at start-up.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
process.env.TZ = process.env.TZ || 'Asia/Kolkata';

const ROOT = path.join(__dirname, '..');
const abs = (p, def) => path.resolve(ROOT, p || def);

const cfg = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || '',
  dataDir: abs(process.env.DATA_DIR, 'data'),
  baseDomain: (process.env.BASE_DOMAIN || 'erp.example.in').toLowerCase(),
  publicUrl: (process.env.PUBLIC_URL || `http://127.0.0.1:${process.env.PORT || 4000}`).replace(/\/+$/, ''),
  schoolsDir: abs(process.env.SCHOOLS_DIR, '/var/erp/schools'),
  backendDir: abs(process.env.BACKEND_DIR, '../backend'),
  frontendDir: abs(process.env.FRONTEND_DIR, '../frontend'),
  frontendPort: Number(process.env.FRONTEND_PORT || 3000),
  portRangeStart: Number(process.env.PORT_RANGE_START || 6101),
  schoolHost: process.env.SCHOOL_HOST || '127.0.0.1',
  sslMode: (process.env.SSL_MODE || 'wildcard').toLowerCase(),
  certName: process.env.CERT_NAME || process.env.BASE_DOMAIN || 'erp.example.in',
  applyEnabled: String(process.env.APPLY_ENABLED || 'false') === 'true',
  useSudo: String(process.env.USE_SUDO || 'false') === 'true',
  nodeBin: process.env.NODE_BIN || process.execPath,
};
cfg.generatedDir = abs(process.env.GENERATED_DIR, path.join(cfg.dataDir, 'generated'));
cfg.ecosystemPath = abs(process.env.ECOSYSTEM_PATH, path.join(cfg.generatedDir, 'ecosystem.config.js'));
cfg.nginxConfPath = abs(process.env.NGINX_CONF_PATH, path.join(cfg.generatedDir, 'erp-schools.conf'));
cfg.consoleHost = process.env.CONSOLE_HOST || `console.${cfg.baseDomain}`;

const HOST_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const SAFE_PATH_RE = /^[\w./-]+$/;

function check() {
  const problems = [];
  if (cfg.jwtSecret.length < 16) problems.push('JWT_SECRET must be at least 16 characters');
  if (!HOST_RE.test(cfg.baseDomain)) problems.push('BASE_DOMAIN is not a valid domain name');
  if (!HOST_RE.test(cfg.consoleHost)) problems.push('CONSOLE_HOST is not a valid host name');
  if (!/^[\w.*-]+$/.test(cfg.certName)) problems.push('CERT_NAME may only contain letters, digits, dots and dashes');
  if (!['wildcard', 'none'].includes(cfg.sslMode)) problems.push('SSL_MODE must be wildcard or none');
  for (const [k, v] of Object.entries({ SCHOOLS_DIR: cfg.schoolsDir, BACKEND_DIR: cfg.backendDir, FRONTEND_DIR: cfg.frontendDir,
    ECOSYSTEM_PATH: cfg.ecosystemPath, NGINX_CONF_PATH: cfg.nginxConfPath })) {
    if (!SAFE_PATH_RE.test(v)) problems.push(`${k} may only contain letters, digits and ./_-`);
  }
  for (const [k, v] of Object.entries({ PORT: cfg.port, FRONTEND_PORT: cfg.frontendPort, PORT_RANGE_START: cfg.portRangeStart })) {
    if (!Number.isInteger(v) || v < 1024 || v > 65000) problems.push(`${k} must be a port number between 1024 and 65000`);
  }
  return problems;
}

module.exports = { cfg, check, HOST_RE };
