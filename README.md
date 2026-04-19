# MGN Jalandhar — School ERP System

A full-featured School ERP web application inspired by the EduSecure portal
(`edusecure.org/mgnjalandhar`), rebuilt with a modern **Next.js 14** frontend
and a **Node.js / Express** REST API backend.

> Note: the reference site requires authentication; the exact pixel layout is
> not duplicated. This build implements the canonical EduSecure module set
> (login → dashboard → full ERP).

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
npm run seed
```

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

- Change `JWT_SECRET` and do not commit `.env`.
- Swap SQLite for Postgres/MySQL by replacing `backend/src/config/db.js`.
- Put the backend behind HTTPS; `helmet` and rate-limit are already wired.
- Build the frontend with `npm run build && npm run start`.

## Extended API summary (in addition to base)

```
/enquiries, /visitors, /complaints, /postal, /calls        — Front Office
/exams, /exam-schedule, /marks                              — Examinations
/books, /book-issues, /book-issues/:id/return               — Library
/vehicles, /routes, /student-transport                      — Transport
/hostels, /hostel-rooms, /hostel-allotments                 — Hostel
/inventory/items, /inventory/movements                      — Inventory
/leaves, /payroll                                           — HR
/homework                                                   — Academics
/communications                                             — SMS/Email log
/documents                                                  — Downloads
/users, /users/:id/active, /users/:id/reset-password        — User mgmt
/settings                                                   — School config
/reports/summary                                            — KPI rollup
```

## License

For educational / internal use. Not affiliated with EduSecure or MGN.
