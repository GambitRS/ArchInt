const assert = require("node:assert/strict");
const test = require("node:test");
const Database = require("better-sqlite3");

const { applySchema, loadSchema } = require("../src/database");
const { seedDefaultUser } = require("../src/seed");

test("seeds the default admin user only when User is empty", () => {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  applySchema(db, loadSchema());

  assert.equal(seedDefaultUser(db), true);
  const admin = db
    .prepare('SELECT "name", "email", "role", "password" FROM "User"')
    .get();

  assert.deepEqual(
    { name: admin.name, email: admin.email, role: admin.role },
    { name: "admin", email: "admin@test.com", role: "admin" },
  );
  assert.notEqual(admin.password, "admin");
  assert.match(admin.password, /^[0-9a-f]{32}:[0-9a-f]{128}$/);
  assert.equal(seedDefaultUser(db), false);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM "User"').get().count, 1);

  db.close();
});

test("keeps the development admin role when the column is added to an existing database", () => {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  applySchema(db, loadSchema());
  db.prepare(
    'INSERT INTO "User" ("name", "email", "role", "password") VALUES (?, ?, ?, ?)',
  ).run("admin", "admin@test.com", "user", "existing-hash");

  assert.equal(seedDefaultUser(db), false);
  assert.equal(
    db.prepare('SELECT "role" FROM "User" WHERE "email" = ?').get("admin@test.com").role,
    "admin",
  );

  db.close();
});
