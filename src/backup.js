const fs = require("node:fs");
const path = require("node:path");

async function backupDatabase(db, destinationPath) {
  const destination = path.resolve(destinationPath);
  if (fs.existsSync(destination)) {
    throw new Error(`Backup target already exists: ${destination}`);
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  await db.backup(destination);
  try {
    fs.chmodSync(destination, 0o600);
  } catch {
    // Windows does not expose POSIX file modes; the data directory remains local.
  }
  return destination;
}

module.exports = { backupDatabase };
