const path = require("node:path");
const { createDatabase } = require("./database");
const { backupDatabase } = require("./backup");

const sourcePath = path.resolve(
  process.env.ARCHINT_DATABASE_PATH || path.join(__dirname, "..", "data", "app.db"),
);
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
const destinationPath = path.resolve(
  process.argv[2] || path.join(path.dirname(sourcePath), `app-${stamp}.backup.db`),
);
const db = createDatabase({ databasePath: sourcePath });

backupDatabase(db, destinationPath)
  .then((destination) => {
    console.log(`SQLite backup created at ${destination}`);
  })
  .catch((error) => {
    console.error(`SQLite backup failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => db.close());
