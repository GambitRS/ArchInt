const path = require("node:path");
const { createDatabase } = require("./database");
const { seedDefaultUser } = require("./seed");
const { backupDatabase } = require("./backup");
const { legacyRows, migrateStoredDocuments } = require("./document-migration");

async function syncDatabase() {
  const databasePath = path.resolve(
    process.env.ARCHINT_DATABASE_PATH || path.join(__dirname, "..", "data", "app.db"),
  );
  const db = createDatabase({ databasePath });
  try {
    let migration = { migrated: 0, backupPath: null };
    if (legacyRows(db).length) {
      const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
      migration = await migrateStoredDocuments(db, {
        backupPath: path.join(
          path.dirname(databasePath),
          `app-before-archimate-migration-${stamp}.backup.db`,
        ),
        backupDatabase,
      });
    }
    const seeded = seedDefaultUser(db);
    console.log(
      `SQLite database created/synchronized successfully.${
        seeded ? " Created default admin user." : ""
      }${
        migration.migrated
          ? ` Migrated ${migration.migrated} drawing document(s).`
          : ""
      }`,
    );
    return migration;
  } finally {
    db.close();
  }
}

void syncDatabase().catch((error) => {
  console.error(`SQLite database synchronization failed: ${error.message}`);
  process.exitCode = 1;
});

module.exports = { syncDatabase };
