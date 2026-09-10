const { ensureCanonicalDocument, validateCanonicalDocument } = require("../shared/archimate-model");

function legacyRows(db) {
  return db
    .prepare('SELECT "id", "name", "document" FROM "Drawing"')
    .all()
    .filter((row) => {
      try {
        const value = JSON.parse(row.document);
        return !(
          value &&
          value.app === "ArchInt" &&
          value.format === "archint-archimate" &&
          value.schemaVersion === 2
        );
      } catch {
        return true;
      }
    });
}

async function migrateStoredDocuments(db, options = {}) {
  const rows = legacyRows(db);
  if (!rows.length) return { migrated: 0, backupPath: null };

  let backupPath = null;
  if (options.backupPath) {
    if (typeof options.backupDatabase !== "function") {
      throw new Error("A backupDatabase function is required before document migration");
    }
    backupPath = await options.backupDatabase(db, options.backupPath);
  }

  const migrate = db.transaction(() => {
    for (const row of rows) {
      let value;
      try {
        value = JSON.parse(row.document);
      } catch {
        throw new Error(`Drawing ${row.id} contains invalid JSON and cannot be migrated`);
      }
      const document = ensureCanonicalDocument(value, { name: row.name });
      const errors = validateCanonicalDocument(document);
      if (errors.length) {
        throw new Error(`Drawing ${row.id} failed ArchiMate migration validation: ${errors.join("; ")}`);
      }
      db.prepare('UPDATE "Drawing" SET "document" = ? WHERE "id" = ?').run(
        JSON.stringify(document),
        row.id,
      );
    }
  });
  migrate();
  return { migrated: rows.length, backupPath };
}

module.exports = { legacyRows, migrateStoredDocuments };
