const { createDatabase } = require("./database");
const { seedDefaultUser } = require("./seed");

let db;

try {
  db = createDatabase();
  const seeded = seedDefaultUser(db);
  console.log(
    `SQLite database created/synchronized successfully.${
      seeded ? " Created default admin user." : ""
    }`,
  );
} catch (error) {
  console.error(`SQLite database synchronization failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (db) db.close();
}
