const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const Database = require("better-sqlite3");
const { backupDatabase } = require("../src/backup");

test("creates a restorable, non-overwriting SQLite backup", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "archint-backup-"));
  const sourcePath = path.join(directory, "source.db");
  const destinationPath = path.join(directory, "backup.db");
  const db = new Database(sourcePath);
  db.exec("CREATE TABLE sample (value TEXT NOT NULL); INSERT INTO sample VALUES ('kept');");

  try {
    assert.equal(await backupDatabase(db, destinationPath), destinationPath);
    await assert.rejects(
      () => backupDatabase(db, destinationPath),
      /Backup target already exists/,
    );
  } finally {
    db.close();
  }

  const restored = new Database(destinationPath, { readonly: true });
  try {
    assert.equal(restored.prepare("SELECT value FROM sample").get().value, "kept");
  } finally {
    restored.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
