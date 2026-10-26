# School ERP — Platform (running the ERP for many schools)

One server hosts many schools. Each school gets **its own copy of the backend process** with its own database,
uploads and backups (`/var/erp/schools/<code>/`), so one school's data can never appear in another's.
All schools share **one Next.js frontend build**. nginx sends each school's subdomain to the right place:

```
alpha.erp.example.in  ─┬─ /api/*, /iclock/*  → alpha's backend (127.0.0.1:6101)
                       └─ everything else    → shared frontend (127.0.0.1:3000)
beta.erp.example.in   ─┬─ /api/*, /iclock/*  → beta's backend  (127.0.0.1:6102)
                       └─ everything else    → shared frontend
console.erp.example.in ── platform console   (127.0.0.1:4000)
```

The **platform console** (this folder) is where you, the owner, add schools, choose their plans, record payments,
suspend or renew them, and regenerate the nginx and pm2 config. Each school backend fetches its licence from the
console every 10 minutes (signed with the console's RSA key) and enforces it:

| Licence state | What the school sees |
|---|---|
| Trial / active | Everything in their plan |
| ≤ 30 days left | Yellow "Licence ends in N days" banner |
| Expired / suspended | Red banner; **read-only** (viewing, printing and sign-in work; saving returns 402) |
| Area not in plan | That part of the ERP returns 403 "not included in your plan" |
| Student limit reached | New admissions blocked; existing students unaffected |
| Console unreachable | Keeps working on the last licence it received, for up to 7 days |

A backend with no `LICENSE_*` settings runs unlimited, so a normal single-school install behaves as before.

---

## 1. Server setup (Ubuntu 22.04/24.04)

A 2 vCPU / 4 GB VPS comfortably runs 15–25 schools (each backend uses about 60–120 MB of RAM).

```bash
# Node 20, build tools for better-sqlite3, nginx, certbot
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs build-essential python3 nginx certbot python3-certbot-dns-cloudflare git
sudo npm install -g pm2

# A service user and folders
sudo adduser --system --group --home /opt/school-erp erp
sudo mkdir -p /var/erp/schools && sudo chown -R erp:erp /var/erp /opt/school-erp

# The code, built once
sudo -u erp git clone https://github.com/amit5042k/school-erp-system.git /opt/school-erp
cd /opt/school-erp
sudo -u erp npm --prefix backend ci --omit=dev
sudo -u erp npm --prefix platform install --omit=dev
echo 'NEXT_PUBLIC_API_BASE=/api' | sudo -u erp tee frontend/.env.production
sudo -u erp npm --prefix frontend ci
sudo -u erp npm --prefix frontend run build
```

`NEXT_PUBLIC_API_BASE=/api` makes the frontend call `/api` on whichever school subdomain it was opened from,
which is why one build serves every school.

### DNS
Add two records at your DNS provider, both pointing at the server's IP:

| Type | Name | Value |
|---|---|---|
| A | `erp.example.in` | server IP |
| A | `*.erp.example.in` | server IP |

### SSL certificates
**Wildcard (recommended):** one certificate covers every school, so new schools need no certificate work.
It needs a DNS challenge; with Cloudflare:

```bash
sudo mkdir -p /root/.secrets && sudo chmod 700 /root/.secrets
echo 'dns_cloudflare_api_token = <token with Zone:DNS:Edit>' | sudo tee /root/.secrets/cloudflare.ini
sudo chmod 600 /root/.secrets/cloudflare.ini
sudo certbot certonly --dns-cloudflare --dns-cloudflare-credentials /root/.secrets/cloudflare.ini \
  -d 'erp.example.in' -d '*.erp.example.in' --cert-name erp.example.in
```
Certbot renews it automatically. Other DNS providers have similar `python3-certbot-dns-*` plugins.

**Per-subdomain alternative:** set `SSL_MODE=none`, Apply, then run
`sudo certbot --nginx -d console.erp.example.in -d alpha.erp.example.in` each time you add a school.
Certbot edits the generated file, so the next Apply overwrites its changes and you'll need to run certbot again.
Wildcard avoids this.

### Console settings
```bash
cd /opt/school-erp/platform
sudo -u erp cp .env.example .env
sudo -u erp nano .env        # set JWT_SECRET (openssl rand -hex 32), BASE_DOMAIN, CERT_NAME, paths
sudo -u erp npm run create-owner -- --email you@yourcompany.in --name "Your Name"
```

Set these paths in `.env` for a real server: `SCHOOLS_DIR=/var/erp/schools`,
`BACKEND_DIR=/opt/school-erp/backend`, `FRONTEND_DIR=/opt/school-erp/frontend`,
`ECOSYSTEM_PATH=/opt/school-erp/ecosystem.config.js` and `NGINX_CONF_PATH=/etc/nginx/sites-enabled/erp-schools.conf`.
The `erp` user must be able to write the nginx file:
```bash
sudo touch /etc/nginx/sites-enabled/erp-schools.conf && sudo chown erp /etc/nginx/sites-enabled/erp-schools.conf
sudo rm -f /etc/nginx/sites-enabled/default
```

**Apply** runs `nginx -t` and `nginx -s reload`, which need root. Allow exactly those two commands without a password
(`sudo visudo -f /etc/sudoers.d/erp`):
```
erp ALL=(root) NOPASSWD: /usr/sbin/nginx -t, /usr/sbin/nginx -s reload
```
Then set `USE_SUDO=true`. pm2 runs as `erp`, so it needs no sudo. If you'd rather not grant this, keep
`APPLY_ENABLED=false` and run the commands shown on the Server page yourself.

### Start the console
```bash
cd /opt/school-erp
sudo -u erp pm2 start platform/src/server.js --name erp-platform
sudo -u erp pm2 save
sudo env PATH=$PATH pm2 startup systemd -u erp --hp /opt/school-erp   # start on boot
```
The console is served at `console.erp.example.in` once the first Apply writes the nginx config. Until then, use an
SSH tunnel: `ssh -L 4000:127.0.0.1:4000 you@server` and open http://localhost:4000.

---

## 2. Adding a school

1. **Schools → + Add School.** Enter the name, a short code (`dps2`), the subdomain (defaults to the code),
   the plan, and whether it starts as a trial or paid.
2. The console picks a free port, creates `/var/erp/schools/<code>/{data,uploads,backups}`, writes
   `backend.env` (random `JWT_SECRET`, licence key, paths), creates the database, and shows the **first
   administrator's username and temporary password once**. Send these to the school; the password must be
   changed at first sign-in.
3. **Server → Apply.** This writes the nginx and pm2 files and runs:
   ```
   pm2 startOrReload /opt/school-erp/ecosystem.config.js --update-env
   pm2 save
   nginx -t
   nginx -s reload
   ```
4. The school opens `https://<subdomain>.erp.example.in` and signs in.

For biometric attendance (eSSL ADMS), point the device at `<subdomain>.erp.example.in`, port 80. `/iclock` is kept
on plain HTTP because most devices can't use HTTPS; everything else redirects to HTTPS.

SMS, email and payment-gateway settings for a school go at the end of its
`/var/erp/schools/<code>/backend.env`. Apply again afterwards (`--update-env` picks up the change).

### Day-to-day
- **Record payment / renew** extends the expiry by N months (from the current expiry if renewed early, from today
  if late) and logs the payment. The school sees the change within seconds.
- **Suspend** makes a school read-only straight away; **Resume** reverses it.
- **Plan / student limit / expiry** can be changed on the school's page. Editing a plan updates every school on it.
- **Licence file** downloads a signed licence for a school that runs on its own server. On that server, set
  `LICENSE_FILE=/path/licence-<code>.jwt` and `LICENSE_PUBLIC_KEY_FILE=/path/licence-public.pem` (copy the public key from
  `platform/data/licence-public.pem`).
- **Archive** (asks you to type the school code) stops the school's backend, moves its folder to
  `/var/erp/schools/_archive/<code>-<date>/` and removes it from nginx. Nothing is deleted, so you can export it or
  restore it later.

The dashboard lists every school with its status, student count (read live from each backend), expiries in the
next 30 days, annual recurring revenue (sum of active schools' plan prices) and payments received this financial
year (from 1 April).

---

## 3. Backups

- Each school backend saves a copy of its own database to `/var/erp/schools/<code>/backups/` every day and keeps the
  last 14. Off-site (S3-compatible) copies can be turned on per school with the `S3_*` settings in its `backend.env`.
- Back up the console too: `platform/data/` holds the schools list, payments and the **licence signing key**.
  If you lose the key, every school has to be given a new licence.
- A simple nightly off-server copy of everything:
  ```bash
  # crontab -e (as root)
  30 2 * * * tar czf /root/erp-$(date +\%F).tgz /var/erp/schools /opt/school-erp/platform/data && \
             rclone copy /root/erp-$(date +\%F).tgz remote:erp-backups && find /root -name 'erp-*.tgz' -mtime +7 -delete
  ```
- **Restoring one school:** `pm2 stop erp-school-<code>`, copy a backup over `data/school.sqlite`, then
  `pm2 start erp-school-<code>`. Other schools are not affected.

---

## 4. Upgrading every school

All schools run the same code, so one upgrade covers them all:

```bash
cd /opt/school-erp
sudo -u erp git pull
sudo -u erp npm --prefix backend ci --omit=dev
sudo -u erp npm --prefix platform install --omit=dev
sudo -u erp npm --prefix frontend ci && sudo -u erp npm --prefix frontend run build
sudo -u erp pm2 reload all
```

Each backend updates its own database tables when it starts. Upgrade outside school hours, and run
`tar czf /root/pre-upgrade.tgz /var/erp/schools` first so you can roll back.

---

## 5. Plans and pricing

Three plans are created to start with; set your own prices and limits on the **Plans** page:

| Plan | Areas | Student limit |
|---|---|---|
| Basic | Students, attendance, academics, homework/notices, communication, fees, front office, administration | 500 |
| Standard | Basic + HR, payroll, library, transport | 1,500 |
| Premium | Everything (also hostel, inventory) | Unlimited |

- Price per year is for your records and the dashboard totals. The console doesn't collect payments; record them
  with **Record payment / renew** (bank transfer, UPI, cheque…).
- The student limit counts **active** students, so leavers and TC-issued students don't count against it.
  You can override it for one school on its page.
- An area left out of a plan is hidden in the school's menu and refused by its backend. Staff can still see their
  own payslips, leave and notices.
- In practice, Indian school ERP pricing ranges from about ₹15–₹60 per student per year, or a flat yearly fee per
  school. A 30-day trial followed by a yearly licence that you renew is the most common arrangement.

---

## Reference

### Console settings (`platform/.env`)
| Variable | Purpose |
|---|---|
| `PORT` | Console port (default 4000) |
| `JWT_SECRET` | Signs owner sessions (required, 16+ characters) |
| `BASE_DOMAIN` | Schools are `<subdomain>.BASE_DOMAIN`; the console is `console.BASE_DOMAIN` (`CONSOLE_HOST` overrides it) |
| `PUBLIC_URL` | Address school backends use to reach the console (default `http://127.0.0.1:PORT`) |
| `SCHOOLS_DIR`, `BACKEND_DIR`, `FRONTEND_DIR` | Where school folders go, and where the code lives |
| `FRONTEND_PORT`, `PORT_RANGE_START` | Shared frontend port; first port given to a school |
| `ECOSYSTEM_PATH`, `NGINX_CONF_PATH` | Where the generated files are written |
| `SSL_MODE`, `CERT_NAME` | `wildcard` (uses `/etc/letsencrypt/live/CERT_NAME/`) or `none` |
| `APPLY_ENABLED`, `USE_SUDO` | Actually run the Apply commands; prefix them with `sudo -n` |
| `DATA_DIR` | Console database and licence keys (default `platform/data`) |

### Licence settings in a school's `backend.env` (written by the console)
| Variable | Purpose |
|---|---|
| `LICENSE_SERVER_URL`, `LICENSE_KEY` | Fetch the licence from the console |
| `LICENSE_FILE` | Use a downloaded licence file instead (own-server installs) |
| `LICENSE_PUBLIC_KEY_FILE` / `LICENSE_PUBLIC_KEY` | Console's public key; when set, unsigned or altered licences are refused |
| `LICENSE_CACHE_FILE` | Last good licence (default `licence-cache.json` next to the database) |

### Security notes
- Owner passwords are bcrypt-hashed. Sign-in is limited to 10 failures per 15 minutes per IP and email.
- School codes and subdomains are checked strictly (`[a-z][a-z0-9]{1,19}` and `[a-z0-9-]`, reserved names refused)
  before they are written into any file. Apply runs a fixed list of commands with arguments passed directly, never
  through a shell, and never includes anything typed into the console.
- `backend.env` and `ecosystem.config.js` contain secrets, so they're created readable by their owner only.
  The Server page shows the pm2 file with secrets hidden.
- Licences are RS256-signed; an edited cached licence is refused and the school goes read-only.
- The Razorpay webhook (`/api/payments/webhook`) still works while a school is read-only, so payments parents have
  already made are always recorded. It checks Razorpay's own signature.
