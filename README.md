# Hello World API

A small Node.js backend using Express and SQLite.

## Run

```bash
npm install
npm start
```

The API is available at `http://localhost:3000/api`.

To create or synchronize the SQLite database without starting the web server, run:

```bash
npm run db:sync
```

This command applies `database/schema.json`, closes the database connection, and exits.

When the `User` table is empty, startup and `npm run db:sync` create this development admin user once:

- Name: `admin`
- Email: `admin@test.com`
- Password: `admin`

The password is stored as a salted scrypt hash. The seed is skipped as soon as the `User` table contains any row, and this default credential should be changed before using the application in production.

## Endpoints

- `GET /api` — API status and available endpoints
- `GET /api/users` — list users
- `GET /api/users/:id` — get one user
- `POST /api/users` — create a user

Example request:

```bash
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Ada Lovelace","email":"ada@example.com","password":"secret"}'
```

The password is stored as a salted scrypt hash and is never returned by the API.

Users have a `role` of either `admin` or `user`. New users default to `user`; the development seed user has the `admin` role.

## Database specification

The schema is described in [`database/schema.json`](database/schema.json). On every startup, the application checks the existing database against that specification and adds missing tables, columns, and relations. The initial `User` table contains `id`, `name`, `email`, `role`, and `password`; relations can be added to the top-level `relations` array.

SQLite cannot append a foreign-key constraint directly, so when a relation is missing the affected table is rebuilt inside a transaction. Existing rows, columns, explicit indexes, and triggers are preserved. Extra database objects are not removed, and a required column cannot be added to a populated table unless the specification provides a default value.

The SQLite database file is created at `data/app.db` and is ignored by Git.
