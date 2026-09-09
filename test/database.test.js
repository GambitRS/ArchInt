const assert = require("node:assert/strict");
const test = require("node:test");
const Database = require("better-sqlite3");

const { applySchema } = require("../src/database");

function schema() {
  return {
    version: 1,
    tables: [
      {
        name: "User",
        columns: [
          { name: "id", type: "INTEGER", primaryKey: true, autoIncrement: true },
          { name: "name", type: "TEXT", notNull: true },
          { name: "email", type: "TEXT", notNull: true, unique: true },
          { name: "password", type: "TEXT", notNull: true },
        ],
      },
      {
        name: "Post",
        columns: [
          { name: "id", type: "INTEGER", primaryKey: true, autoIncrement: true },
          { name: "userId", type: "INTEGER", notNull: true },
        ],
      },
    ],
    relations: [
      {
        from: { table: "Post", column: "userId" },
        to: { table: "User", column: "id" },
        onDelete: "CASCADE",
      },
    ],
  };
}

test("adds missing tables, columns, and relations", () => {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec('CREATE TABLE "User" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT NOT NULL)');

  const changes = applySchema(db, schema());

  assert.deepEqual(changes.tables, ["Post"]);
  assert.deepEqual(changes.columns, ["User.email", "User.password"]);
  assert.deepEqual(changes.relations, ["Post.userId -> User.id"]);
  assert.deepEqual(
    db
      .prepare('PRAGMA table_info("User")')
      .all()
      .map((column) => column.name),
    ["id", "name", "email", "password"],
  );

  const foreignKey = db.prepare('PRAGMA foreign_key_list("Post")').get();
  assert.equal(foreignKey.table, "User");
  assert.equal(foreignKey.from, "userId");
  assert.equal(foreignKey.to, "id");
  assert.equal(foreignKey.on_delete, "CASCADE");

  db.prepare('INSERT INTO "User" ("name", "email", "password") VALUES (?, ?, ?)').run(
    "Ada",
    "ada@example.com",
    "hashed-password",
  );
  db.prepare('INSERT INTO "Post" ("userId") VALUES (?)').run(1);
  assert.throws(
    () => db.prepare('INSERT INTO "Post" ("userId") VALUES (?)').run(999),
    /FOREIGN KEY constraint failed/,
  );

  db.close();
});

test("adds a missing relation while preserving existing rows", () => {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(
    'CREATE TABLE "User" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT NOT NULL, "email" TEXT NOT NULL, "password" TEXT NOT NULL);' +
      'CREATE TABLE "Post" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "userId" INTEGER NOT NULL);' +
      'INSERT INTO "User" ("name", "email", "password") VALUES (\'Ada\', \'ada@example.com\', \'hashed-password\');' +
      'INSERT INTO "Post" ("userId") VALUES (1);',
  );

  const changes = applySchema(db, schema());

  assert.deepEqual(changes.tables, []);
  assert.deepEqual(changes.columns, []);
  assert.deepEqual(changes.relations, ["Post.userId -> User.id"]);
  assert.deepEqual(db.prepare('SELECT "userId" FROM "Post"').all(), [{ userId: 1 }]);

  db.close();
});
