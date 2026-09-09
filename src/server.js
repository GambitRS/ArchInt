const { createApp } = require("./app");
const { createDatabase } = require("./database");
const { seedDefaultUser } = require("./seed");

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
