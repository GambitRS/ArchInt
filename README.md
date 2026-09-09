# Hello World API

## ArchInt drawing workspace

The frontend now includes sign-in, a per-user drawing library, an editable architecture
template, structured drawing tools, freehand sketching, autosave to SQLite, recovery drafts,
and SVG/PNG/PDF/JSON export.
See [BUILD_PLAN.md](BUILD_PLAN.md) for the UI specification, implemented scope, remaining
features, security work before production, and acceptance criteria.

Build and start using the commands below, then open `http://localhost:3000`.
The existing development account works when it has been seeded; its credentials are listed below.
New authenticated routes are `/api/auth/login`, `/api/auth/me`, `/api/auth/logout`,
`/api/auth/password`, `/api/auth/recovery/request`, `/api/auth/recovery/reset`,
`/api/drawings`, and `/api/drawings/:id`. Drawing creation accepts an `Idempotency-Key`
header so a retried request returns the original drawing instead of creating a duplicate.
The development frontend proxies `/api` to the backend on port 3000.

The legacy user-management endpoints below are administrator-only. They are intended for
controlled account administration, not public sign-up.

A small Node.js backend using Express and SQLite.

## Run

```bash
npm install
npm run build
npm start
```

The React/TypeScript frontend is built into `public/` and is served by the backend at
`http://localhost:3000/`. The API is available at `http://localhost:3000/api`.

For frontend development, run `npm run frontend:dev` in a separate terminal. The
production build command remains `npm run build`.

To create or synchronize the SQLite database without starting the web server, run:

```bash
npm run db:sync
```

This command applies `database/schema.json`, closes the database connection, and exits.

Create a non-overwriting SQLite backup with `npm run db:backup`; pass a destination path after
`--` when needed. The backup command keeps the source database open only for the duration of the
copy and uses restrictive file permissions where the platform supports them.

When the `User` table is empty, a non-production startup or `npm run db:sync` creates this
development admin user once:

- Name: `admin`
- Email: `admin@test.com`
- Password: `admin`

The password is stored as a salted scrypt hash. The seed is skipped in production and as soon
as the `User` table contains any row. Change this development credential before any deployment.

## Endpoints

- `GET /api` — API status and available endpoints
- `GET /api/users` — administrator-only user list
- `GET /api/users/:id` — administrator-only user lookup
- `POST /api/users` — administrator-only user creation; passwords must be at least 12 characters
- `POST /api/auth/password` — change the signed-in user's password and revoke all sessions
- `POST /api/auth/recovery/request` — start a recovery request; development responses include a test token
- `POST /api/auth/recovery/reset` — consume a recovery token and revoke all sessions

Example request:

```bash
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Ada Lovelace","email":"ada@example.com","password":"a-long-development-password"}'
```

The password is stored as a salted scrypt hash and is never returned by the API.

Users have a `role` of either `admin` or `user`. New users default to `user`; only an authenticated
administrator can call the legacy user-management routes. Recovery tokens are never returned in
production responses; production deployments must connect the request route to an approved email
delivery service.

## Database specification

The schema is described in [`database/schema.json`](database/schema.json). On every startup, the application checks the existing database against that specification and adds missing tables, columns, and relations. The initial `User` table contains `id`, `name`, `email`, `role`, and `password`; `PasswordReset` stores only hashed, expiring recovery tokens.

SQLite cannot append a foreign-key constraint directly, so when a relation is missing the affected table is rebuilt inside a transaction. Existing rows, columns, explicit indexes, and triggers are preserved. Extra database objects are not removed, and a required column cannot be added to a populated table unless the specification provides a default value.

The SQLite database file is created at `data/app.db` and is ignored by Git.
