const { createApp } = require("./app");
const { createDatabase } = require("./database");
const { seedDefaultUser } = require("./seed");

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

assertProductionConfig();
const port = Number(process.env.PORT) || 3000;
const db = createDatabase();
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
