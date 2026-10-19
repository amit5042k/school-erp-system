# School ERP System

A full-featured School ERP web application built with a modern
**Next.js 14** frontend and a **Node.js / Express** REST API backend.

---

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

## Production notes

- Set a strong `JWT_SECRET` (`openssl rand -hex 32`); the backend refuses to start without one. Never commit `.env`.
- Set `NEXT_PUBLIC_API_BASE` (e.g. `https://api.yourdomain.com/api`) **before** `npm run build` — it is baked into the frontend.
- Keep `backend/data/` (database + daily backups) and `backend/uploads/` (uploaded files) on persistent storage, and copy a backup off the server regularly (Backups page in the admin menu, or `npm run backup`).
- To restore: stop the backend, replace `backend/data/school.sqlite` with a backup file, start it again.
- SMS and email are optional; configure `SMS_API_URL` / `SMTP_*` in `backend/.env` (see `.env.example`). Until then messages are logged as "not configured".
- Sign-in is rate-limited on failed attempts (10 per account and 100 per network per 15 minutes).
- Put the backend behind HTTPS; `helmet` and rate limiting are already wired.

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
