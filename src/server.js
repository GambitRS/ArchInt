const path = require("node:path");
const { createApp } = require("./app");
const { createDatabase } = require("./database");
const { seedDefaultUser } = require("./seed");
const { backupDatabase } = require("./backup");
const { legacyRows, migrateStoredDocuments } = require("./document-migration");

function assertProductionConfig() {
  if (process.env.NODE_ENV !== "production") return;
  const origin = process.env.APP_ORIGIN;
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    throw new Error("APP_ORIGIN must be set to an HTTPS origin in production.");
  }
  if (parsed.protocol !== "https:" || parsed.origin !== origin) {
    throw new Error("APP_ORIGIN must be set to an HTTPS origin in production.");
  }
}

async function start() {
  assertProductionConfig();
  const port = Number(process.env.PORT) || 3000;
  const databasePath = path.resolve(
    process.env.ARCHINT_DATABASE_PATH || path.join(__dirname, "..", "data", "app.db"),
  );
  const db = createDatabase({ databasePath });
  try {
    const rows = legacyRows(db);
    if (rows.length) {
      const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
      const backupPath = path.join(
        path.dirname(databasePath),
        `app-before-archimate-migration-${stamp}.backup.db`,
      );
      const result = await migrateStoredDocuments(db, {
        backupPath,
        backupDatabase,
      });
      console.log(`Migrated ${result.migrated} drawing document(s) after backing up to ${result.backupPath}.`);
    }
    if (seedDefaultUser(db)) {
      console.log("Created default admin user for the empty database.");
    }
    const app = createApp(db);
    const server = app.listen(port, () => {
      console.log(`Hello World API listening on http://localhost:${port}/api`);
    });

    function shutdown() {
      server.close(() => {
        db.close();
        process.exit(0);
      });
    }

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    return { app, db, server };
  } catch (error) {
    db.close();
    throw error;
  }
}

void start().catch((error) => {
  console.error(`ArchInt server failed to start: ${error.message}`);
  process.exitCode = 1;
});

module.exports = { assertProductionConfig, start };
