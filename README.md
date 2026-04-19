# MGN Urban Estate — School ERP System

A School ERP web application inspired by the EduSecure-style portal
(`www.edusecure.org/mgnurbanestate/login/login.aspx`), rebuilt with a modern
**Next.js 14** frontend and a **Node.js / Express** REST API backend.

> Note: the original reference site requires authentication and could not be
> scraped, so the exact pixel-level look is not duplicated. The login screen is
> modeled on the typical EduSecure portal (school header, side banner, role
> selector, User ID / Password form, footer) and the rest of the ERP provides
> the standard modules expected in such systems.

---

## Features

**Roles:** Admin, Teacher, Student, Parent (UI ready, login wired).

**Modules**

- Role-based **Login** (JWT auth)
- **Dashboard** — totals, attendance snapshot, fees, announcements
- **Students** — list, search, add (admin)
- **Teachers / Staff** — list, add (admin)
- **Attendance** — mark per class per date (admin/teacher), view by student
- **Fees** — per-student records, mark paid, receipts
- **Time Table** — per-class weekly view
- **Announcements / Circulars** — post, list, audience targeting

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

## License

For educational / internal use. Not affiliated with EduSecure or MGN.
