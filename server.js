// One process for hosts that run a single Node app on one port (Hostinger "Deploy from GitHub", Render, Railway…):
// the ERP API and device endpoints (/api, /iclock) go to the Express backend, every other path to the Next.js site.
//   npm run build   (builds the website)
//   npm start       (this file; listens on $PORT, default 3000)
// The website calls the API on its own address (/api), so only one domain and one port are needed.
const path = require('path');
const http = require('http');
const os = require('os');

// Such hosts publish each deploy into a new version folder, so data kept inside the app would vanish on the next
// deploy. By default keep the database, uploads and backups in ~/school-erp-data instead (set DB_PATH, UPLOAD_DIR
// and BACKUP_DIR to choose another place). This runs before the backend loads, so it sees these paths.
require('dotenv').config({ path: path.join(__dirname, 'backend', '.env') });
require('dotenv').config();
require('./backend/src/config/paths');
const DATA = process.env.ERP_DATA_DIR || path.join(os.homedir(), 'school-erp-data');
process.env.DB_PATH = process.env.DB_PATH || path.join(DATA, 'school.sqlite');
process.env.UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(DATA, 'uploads');
process.env.BACKUP_DIR = process.env.BACKUP_DIR || path.join(DATA, 'backups');
const next = require(require.resolve('next', { paths: [path.join(__dirname, 'frontend')] }));

const api = require('./backend/src/server');
const site = next({ dev: false, dir: path.join(__dirname, 'frontend') });
const handle = site.getRequestHandler();
const toApi = /^\/(api|iclock)(\/|$|\?)/;

site.prepare().then(() => {
  const port = Number(process.env.PORT) || 3000;
  http.createServer((req, res) => (toApi.test(req.url) ? api(req, res) : handle(req, res)))
    .listen(port, () => console.log(`School ERP (website + API) on http://localhost:${port}`));
}).catch((e) => {
  console.error('Could not start the website. Run "npm run build" first.', e);
  process.exit(1);
});
