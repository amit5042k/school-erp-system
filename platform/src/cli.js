// Command line helpers: create the first owner account.
//   npm run create-owner -- --email you@example.com --name "Your Name"      (asks for the password)
//   OWNER_PASSWORD=... npm run create-owner -- --email ...                    (non-interactive)
const readline = require('readline');
const bcrypt = require('bcryptjs');
const { db, log } = require('./db');

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };

function ask(q, hidden) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    if (hidden) rl._writeToOutput = (s) => { if (s.includes(q)) rl.output.write(s); };
    rl.question(q, (a) => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(a); });
  });
}

(async () => {
  if (args[0] !== 'create-owner') { console.log('Usage: node src/cli.js create-owner --email you@example.com --name "Your Name"'); process.exit(1); }
  const email = String(opt('email') || await ask('Email: ')).trim().toLowerCase();
  const name = String(opt('name') || await ask('Name: ')).trim() || email;
  const password = process.env.OWNER_PASSWORD || await ask('Password (min 10 characters): ', true);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { console.error('Invalid email'); process.exit(1); }
  if (String(password).length < 10) { console.error('Password must be at least 10 characters'); process.exit(1); }
  try {
    const info = db.prepare('INSERT INTO owners (email, name, password_hash) VALUES (?, ?, ?)').run(email, name, bcrypt.hashSync(password, 10));
    log('owner.create', { ownerId: info.lastInsertRowid, detail: email });
    console.log(`Owner ${email} created.`);
  } catch (e) {
    console.error(/UNIQUE/.test(e.message) ? 'An owner with that email already exists' : e.message);
    process.exit(1);
  }
})();
