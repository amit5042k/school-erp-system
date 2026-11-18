# School ERP System

A full-featured School ERP web application built with a modern
**Next.js 14** frontend and a **Node.js / Express** REST API backend.

---


**Setup guide & user manual (PDF):** [docs/School-ERP-Setup-Guide-and-User-Manual.pdf](docs/School-ERP-Setup-Guide-and-User-Manual.pdf): installing on a VPS, every setting, SMS/WhatsApp, Razorpay, eSSL, the Android app, backups, the multi-school console, and how to use every module, role by role.
## Modules

**Roles:** Admin, Teacher, Student, Parent.

- **Auth & Dashboard** — JWT login, role-aware dashboard, summary widgets.
- **Admissions** — Enquiries (open/contacted/converted/closed), follow-ups.
- **Students** — list, search, create, class assignment.
- **Teachers / HR** — teacher directory, staff leaves (approve/reject), payroll.
- **Academics** — Attendance, Time Table, Homework / Assignments, Exams,
  Exam Schedule, Marks Entry per exam / class / subject.
- **Fees** — per-student fee rows, mark paid, receipt generation.
- **Front Office** — Visitor book, Complaints, Postal (dispatch / receive),
  Phone Call Log.
- **Library** — Books catalog, Issue / Return with stock tracking.
- **Transport** — Vehicles, Routes, Student-to-Route assignment.
- **Hostel** — Hostels, Rooms, Allotments.
- **Inventory** — Items (with reorder level), Purchase / Issue / Adjust
  movements.
- **Communication** — Announcements, SMS / Email / Push log, Documents &
  downloads.
- **Administration** — Users & Roles (create/disable/reset password), School
  Settings (name, academic year, contact, logo), Reports summary.

**Stack**

- Frontend: Next.js 14 (App Router, TypeScript, Tailwind CSS)
- Backend: Node.js, Express, JWT, bcryptjs, Zod, Helmet, express-rate-limit
- Database: SQLite via `better-sqlite3` (zero-config, file-based)

---

## Project layout

```
school-erp-system/
├── backend/               Node.js + Express REST API
│   ├── src/
│   │   ├── config/db.js
│   │   ├── controllers/
│   │   ├── middleware/auth.js
│   │   ├── routes/index.js
│   │   ├── utils/seed.js
│   │   └── server.js
│   └── data/              SQLite file lives here (git-ignored)
├── frontend/              Next.js 14 app
│   └── src/
│       ├── app/           Pages (login, dashboard, students, …)
│       ├── components/    Shell (sidebar/header)
│       ├── lib/api.ts     Fetch helper + token storage
│       └── styles/globals.css
└── package.json           Workspace root (runs both)
```

---

## Quick start

### 1. Install

```bash
npm run install:all
```

### 2. Configure environment

```bash
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local
```

Edit `backend/.env` and change `JWT_SECRET` for anything other than local dev.

### 3. Seed demo data

```bash
cd backend && npm run seed:dev   # local development: wipes and reloads demo data
```

For a real school, start empty instead (no demo data) and create the first Super Admin:

```bash
cd backend && npm run init -- --school "Your School Name" --password 'a-temporary-password'
```

`npm run seed` (without `:dev`) refuses to run on a database that already has users, because seeding
erases all data. On a fresh database it loads the demo data and makes every account choose a new
password at first sign-in. Never seed a live school's database.

Demo accounts created:

| Role    | Username     | Password     |
| ------- | ------------ | ------------ |
| Admin   | `admin`      | `admin123`   |
| Teacher | `ritu`       | `teacher123` |
| Student | `ADM2025001` | `student123` |

### 4. Run both apps

```bash
npm run dev
```

- Frontend → http://localhost:3000
- Backend → http://localhost:5000/api/health

---

## API summary (prefix `/api`)

| Method | Path                               | Auth     | Description                       |
| ------ | ---------------------------------- | -------- | --------------------------------- |
| POST   | `/auth/login`                      | —        | Login, returns JWT                |
| GET    | `/auth/me`                         | any      | Current user                      |
| POST   | `/auth/change-password`            | any      | Change own password               |
| GET    | `/dashboard`                       | any      | Role-specific dashboard summary   |
| GET    | `/students`                        | any      | List students                     |
| POST   | `/students`                        | admin    | Create student                    |
| GET    | `/teachers`                        | any      | List teachers                     |
| POST   | `/teachers`                        | admin    | Create teacher                    |
| GET    | `/classes`                         | any      | List classes                      |
| GET    | `/attendance?date=YYYY-MM-DD`      | any      | Attendance roster for date        |
| POST   | `/attendance/bulk`                 | admin/teacher | Mark attendance for date     |
| GET    | `/fees`                            | admin    | All fee records                   |
| GET    | `/fees/student/:id`                | any      | Fees for one student              |
| POST   | `/fees/:id/pay`                    | admin    | Mark fee paid (records receipt)   |
| GET    | `/timetable/class/:id`             | any      | Class timetable                   |
| GET    | `/announcements`                   | any      | List announcements                |
| POST   | `/announcements`                   | admin/teacher | Post announcement            |

---

## One-click Node.js hosting (Hostinger "Deploy from GitHub", Render, Railway…)

Hosts that run one Node app on one port use the combined `server.js` at the repository root: the website and the
API share one address and port.

| Setting | Value |
| --- | --- |
| Build command | `npm run build` |
| Start command / entry file | `npm start` (or entry file `server.js`) |
| Node.js | 20 or 22 |

Nothing else is required. On first start the server creates the database and a Super Admin `admin`; set
`ADMIN_PASSWORD` (and `SCHOOL_NAME`) in the host's environment variables, or read the one-time password in the
application log. Data (database, uploads, backups and the sign-in secret) is kept in `~/school-erp-data`, outside the
deploy folders, so redeploys keep it; set `ERP_DATA_DIR` (or `DB_PATH`, `UPLOAD_DIR`, `BACKUP_DIR`) to move it.
Optional settings (SMS, email, WhatsApp, Razorpay, S3 backups) go in the host's environment variables, using the
names in `backend/.env.example`.

## Updates never reset your data

Deploying a new version, or adding and removing features, changes the code only:

- The database, uploaded files, backups and the sign-in secret live outside the code (`~/school-erp-data` with
  `npm start`; `backend/data` and `backend/uploads` on a VPS install), so a new deploy folder starts with the same data.
  Relative paths in `backend/.env` always resolve inside `backend/`, whichever folder the server is started from.
- On start, the server only creates missing tables and adds missing columns. Students, staff, fees, logins, passwords,
  roles, settings and editable lists are never rewritten. Default list entries are added once per list; a list you
  emptied stays empty. The first Super Admin is created only when there are no logins at all.
- Whenever the server starts with different code than last time, it first copies the database to
  `backups/pre-update-<date>-<time>.sqlite` (newest 10 kept), on top of the daily backups.
- Demo data is only ever loaded by `npm run seed:dev`, which you run by hand on a development machine.

## Production notes

- Set a strong `JWT_SECRET` (`openssl rand -hex 32`); the backend refuses to start without one. Never commit `.env`.
- Set `NEXT_PUBLIC_API_BASE` (e.g. `https://api.yourdomain.com/api`) **before** `npm run build` — it is baked into the frontend.
- Keep `backend/data/` (database + daily backups) and `backend/uploads/` (uploaded files) on persistent storage, and copy a backup off the server regularly (Backups page in the admin menu, or `npm run backup`).
- To restore: stop the backend, replace `backend/data/school.sqlite` with a backup file, start it again.
- SMS and email are optional; configure `SMS_API_URL` / `SMTP_*` in `backend/.env` (see `.env.example`). Until then messages are logged as "not configured".
- Sign-in is rate-limited on failed attempts (10 per account and 100 per network per 15 minutes).
- Put the backend behind HTTPS; `helmet` and rate limiting are already wired.

## Licensing (selling the ERP to schools)

Every school install needs a licence from you, tied to the school's **registered email**.

**Your licence server.** On your own install (e.g. nextgenos.in) set the environment variable `LICENSE_ISSUER=true`
(Hostinger: Websites › your site › Node.js › Environment variables) and redeploy. That install is never limited and gets
a **Licences** page (Super Admin only, via Licence › Licences) where you add a licence per school: registered email,
school name, web address (optional; then the licence only works there), plan name and modules, maximum students,
valid-until date, and Active / Trial / Suspended. The signing key is created once and kept in your database, so keep
your backups: without it no school's licence can be verified.

**Each school's install** runs a **30-day free trial** from its first start (a banner shows the days left). The school's
Super Admin opens **Licence** in the menu and enters the registered email; the install checks it with your licence
server (`LICENSE_SERVER_URL`, default `https://nextgenos.in`) every 10 minutes and shows the plan, student limit and
expiry. If your server can't be reached, the last licence keeps working for 7 days.

When the trial ends, or a licence expires, is suspended or can't be verified, the school's ERP becomes **read-only**:
everything stays saved and visible, sign-in works, but nothing can be added or changed until the licence is active
again. Modules outside the plan are closed, and students beyond the limit can't be added. Renewing (a later
valid-until date, or Active again) takes effect within 10 minutes, or at once with **Check now** on the school's
Licence page. The Licences page also shows each install's last check, web address and number of students, and checks
from emails that have no licence (schools still on their trial).

## Staff roles and permissions

Staff logins have a role: Principal, Academic Coordinator, IT Head, Office Superintendent, Clerk, Accountant,
Teacher or Non-Teaching Staff (add more on **Roles & Permissions**). Each role has *No access*, *Standard*
(teacher-level) or *Full* (admin-level) for 14 areas. Everyone keeps their own leaves, payslips, timetable and
notices. Only a Super Admin can create or change Super Admin accounts, and nobody can change their own role.
The area map lives in `backend/src/utils/permissions.js` and its mirror `frontend/src/lib/permissions.ts`.

## eSSL biometric devices (ADMS)

Devices with ADMS / "Cloud Server" send punches to `http://<api-domain>/iclock/` in real time.
On the device: Menu › Comm › Cloud Server › server address = API domain (or IP), port 80 or 8081, HTTPS off.
Then approve the device in **Human Resource › Biometric Devices** and map staff on **Map Biometric IDs**
(defaults to Employee No). Most ADMS firmware can't use HTTPS, so let nginx accept plain HTTP for `/iclock/` only
(sample config on the Biometric Devices page).

## Android and iOS apps, and the installable web app

Staff, students and parents can use the **Android app**, the **iOS app** or the website, which also installs as an app
(PWA). All three open the same ERP with the same logins; each person sees their own Home screen.

- `mobile/` is a Capacitor project for both apps. GitHub Actions build them: **Android app** (APK for testing, signed
  APK/AAB for Google Play) and **iOS app** (simulator build to check, signed .ipa for TestFlight/App Store). See
  `mobile/README.md` for Firebase, the Apple push key, signing and store submission.
- Notifications go to the apps (Firebase for Android, Apple Push for iOS: `FCM_*` / `APNS_*` in `backend/.env`), to
  browsers and the installed web app (Web Push, no setup), and always to the in-app Notifications page.
- The website installs from Home (**Install app**) on Android/desktop, or Safari › Share › Add to Home Screen on iPhone.

## How the code is organised

- `backend/src/modules/*.js` — one file per feature area, loaded automatically. Each creates its own tables and
  registers routes, **reports** (`registerReport`, shown at `/report/<key>` with filters, totals, Excel and print)
  and **master lists** (`registerMaster`, edited at `/masters/<type>`).
- `frontend/src/components/ReportView.tsx`, `ModulePage.tsx`, `FileUpload.tsx` — shared report, list/form and upload UI.

## Extended API summary (in addition to base)

```
/enquiries, /visitors, /complaints, /postal, /calls        — Front Office
/exams, /exam-schedule, /marks                              — Examinations
/books, /book-issues, /book-issues/:id/return               — Library
/vehicles, /routes, /student-transport                      — Transport
/hostels, /hostel-rooms, /hostel-allotments                 — Hostel
/inventory/items, /inventory/movements                      — Inventory
/leaves, /payroll                                           — HR
/leaves/balance/:teacherId, /leaves/:id/decision            — HR (leave workflow)
/leave-allowances                                           — HR (allowances)
/homework                                                   — Academics
/communications                                             — SMS/Email log
/documents                                                  — Downloads
/users, /users/:id/active, /users/:id/reset-password        — User mgmt
/settings                                                   — School config
/reports/summary                                            — KPI rollup
```

## License

For educational / internal use.
