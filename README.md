# Hospital Staff Scheduling & Burnout Risk Detector

DBMS Level 3 mini project, PES University.
Thanishq Raam · PES1UG24CS502

A web app for hospital shift scheduling that enforces rest and workload rules inside the database,
computes a weekly burnout risk score for every staff member, and lets the scheduler search staff
check-in notes **by meaning** using vector embeddings.

## Tech stack

| Layer | Technology | Why |
|---|---|---|
| Relational DB | PostgreSQL 16 | Scheduling data is structured and integrity-critical (keys, constraints, triggers, transactions) |
| Vector DB | pgvector (inside PostgreSQL) | Check-in notes are free text; embeddings allow semantic search next to the relational data |
| Embeddings | all-MiniLM-L6-v2 (384 dimensions), run locally with `@huggingface/transformers` | Free, offline, no API key |
| Web app | Next.js (App Router) + Route Handlers | Pages render on the server; Route Handlers form the backend API |
| Auth | bcrypt hashes (pgcrypto), signed HttpOnly session cookie (`jose`) | Passwords never stored or compared in plain text |

## Features

**Admin (scheduler)**
- Burnout watch: weekly scores with risk levels, department summary, high-risk history (view)
- Roster: board per day, assign, cancel, swap (transaction), open new shifts
- Leave requests: approve or reject (approval auto-cancels shifts via trigger)
- Overtime: log extra hours (trigger recalculates the burnout score)
- Check-in notes: semantic search with department filter, delete

**Staff**
- My week: own burnout trend and recent shifts
- Leave: request leave, see own requests
- Check-in notes: write, edit (re-embedded), delete own notes

## Database design

Tables: `department`, `staff`, `shift`, `shift_assignment`, `leave_request`, `overtime_log`,
`burnout_score`, `checkin_note` (with `embedding vector(384)`), `app_user`.
ER diagram: `docs/er_diagram.png`.

| File | What it contains |
|---|---|
| `db/schema.sql` | CREATE TABLE with PK, FK, CHECK, UNIQUE, NOT NULL; indexes incl. HNSW vector index |
| `db/ddl_demo.sql` | ALTER and DROP examples |
| `db/seed.sql` | Sample data: 4 departments, 20 staff, 28 days of shifts |
| `db/queries.sql` | DML, joins, GROUP BY / HAVING, nested and correlated subqueries, recursive CTE |
| `db/advanced.sql` | Function `calculate_burnout_score` (with CTE), procedures `upsert_burnout`, `refresh_burnout_scores`, `swap_shift` (transaction), 3 triggers, view `high_risk_staff` |
| `db/tests.sql` | 11 test cases for constraints, triggers and transactions |
| `db/vector_queries.sql` | pgvector similarity queries and index usage (EXPLAIN) |
| `db/security.sql` | Roles `app_admin`, `app_staff`, `hospital_app`; GRANT/REVOKE; Row Level Security; `authenticate()` login function; demo users |
| `db/security_tests.sql` | 11 role-based access tests |

### Advanced features

- **Triggers:** `validate_assignment` (blocks double booking, under 11 h rest, approved leave, weekly hour cap),
  `cancel_on_leave` (approved leave cancels shifts), `overtime_rescore` (overtime recalculates burnout)
- **Function / procedures:** burnout score calculation, weekly refresh, atomic shift swap
- **CTEs:** gaps-and-islands CTE inside the function; recursive CTE for working-day streaks
- **Transactions:** `swap_shift` is all-or-nothing; every web request runs in its own transaction
- **View:** `high_risk_staff`
- **Indexes:** B-tree on dates and foreign keys, HNSW on the embedding column

### Vector search

- **Embedded:** the text of each staff check-in note
- **Model:** all-MiniLM-L6-v2, mean-pooled and normalized, 384 dimensions
- **Storage:** `checkin_note.embedding vector(384)` with an HNSW index (`vector_cosine_ops`)
- **Metric:** cosine distance (`<=>`); similarity = 1 − distance
- **Retrieval:** query text is embedded, then the top results are ordered by distance, optionally filtered by department
- **Read / Update / Delete:** search (admin), edit note and re-embed (staff), delete note and vector (staff or admin)

### Role-based access in the database

The website logs in as `hospital_app`, which can only call `authenticate()`. Every query runs inside
a transaction that switches to `app_admin` or `app_staff` and sets `app.staff_id`, so
**Row Level Security** limits staff to their own rows even if the app code had a bug.

## Setup and run (Windows)

Requirements: Docker Desktop, Node.js 20+, Git.

```
git clone https://github.com/thanishqraam17/hospital-staff-scheduler.git
cd hospital-staff-scheduler

:: 1. Database (PostgreSQL 16 + pgvector)
docker run -d --name hospital-db -e POSTGRES_PASSWORD=<your password> -e POSTGRES_DB=hospital_scheduler -p 5432:5432 -v hospital_pgdata:/var/lib/postgresql/data pgvector/pgvector:pg16

:: 2. Load the SQL files in this order
for %f in (schema seed advanced security) do docker cp db\%f.sql hospital-db:/%f.sql
for %f in (schema seed advanced security) do docker exec hospital-db psql -U postgres -d hospital_scheduler -f /%f.sql

:: 3. Web app
cd web
copy .env.example .env.local
:: edit .env.local and set SESSION_SECRET to any long random string
npm install
node --env-file=.env.local scripts/embed-notes.mjs
npm run dev
```

Open http://localhost:3000

| Username | Password | Role |
|---|---|---|
| admin | admin123 | Admin |
| ananya, rahul, karthik, … (any staff first name) | staff123 | Staff |

Optional checks:
```
docker exec hospital-db psql -U postgres -d hospital_scheduler -f /tests.sql
docker exec hospital-db psql -U postgres -d hospital_scheduler -f /security_tests.sql
node --env-file=.env.local scripts/vector-demo.mjs
```

## Project structure

```
db/        SQL: schema, seed, queries, advanced features, security, tests
docs/      ER diagram and saved query outputs
web/
  app/           pages (login, admin/*, staff/*) and api/* Route Handlers
  components/    shared UI pieces
  lib/           db.mjs (pool + withRole), session.js, api.js, embed.mjs
  scripts/       embed-notes.mjs, vector-demo.mjs
```
