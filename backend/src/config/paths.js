// Relative DB_PATH / UPLOAD_DIR / BACKUP_DIR (e.g. ./data/school.sqlite in backend/.env) always mean "inside the
// backend folder", whichever folder the server was started from. Otherwise starting the same site another way
// (npm start at the repository root, pm2 with a different cwd) would quietly open a new, empty database.
const path = require('path');

const BACKEND = path.join(__dirname, '..', '..');
for (const key of ['DB_PATH', 'UPLOAD_DIR', 'BACKUP_DIR']) {
  const v = process.env[key];
  if (v && !path.isAbsolute(v)) process.env[key] = path.resolve(BACKEND, v);
}
