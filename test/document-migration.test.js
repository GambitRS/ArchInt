const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const test = require("node:test");

const { applySchema, loadSchema } = require("../src/database");
const { migrateStoredDocuments } = require("../src/document-migration");

test("stored legacy drawings are backed up before an atomic document migration", async () => {
  const db = new Database(":memory:");
  applySchema(db, loadSchema());
  db.prepare('INSERT INTO "User" ("name", "email", "role", "password") VALUES (?, ?, ?, ?)').run(
    "Owner",
    "owner@example.com",
    "user",
    "hash",
  );
  db.prepare(
    'INSERT INTO "Drawing" ("id", "userId", "name", "category", "document", "updatedAt", "revision") VALUES (?, ?, ?, ?, ?, ?, 1)',
  ).run(
    "drawing-1",
    1,
    "Legacy",
    "Diagram",
    JSON.stringify([
      {
        id: "card-1",
        kind: "card",
        x: 10,
        y: 20,
        w: 200,
        h: 80,
        text: "Legacy card",
        detail: "",
        fill: "#ffffff",
        stroke: "#7392b8",
        fontSize: 16,
      },
    ]),
    new Date().toISOString(),
  );

  let backedUp = 0;
  try {
    const result = await migrateStoredDocuments(db, {
      backupPath: "backup.db",
      backupDatabase: async (_database, path) => {
        backedUp += 1;
        return path;
      },
    });
    assert.deepEqual(result, { migrated: 1, backupPath: "backup.db" });
    assert.equal(backedUp, 1);
    const document = JSON.parse(db.prepare('SELECT "document" FROM "Drawing" WHERE "id"=?').get("drawing-1").document);
    assert.equal(document.app, "ArchInt");
    assert.equal(document.format, "archint-archimate");
    assert.equal(document.schemaVersion, 2);
    assert.equal(document.views.length, 1);
    assert.equal(document.views[0].annotations["card-1"].element.text, "Legacy card");
  } finally {
    db.close();
  }
});
