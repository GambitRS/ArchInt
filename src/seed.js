const { hashPassword } = require("./password");

function seedDefaultUser(db, options = {}) {
  const environment = options.environment ?? process.env.NODE_ENV;
  if (environment === "production") return false;

  const seed = db.transaction(() => {
    const result = db.prepare('SELECT COUNT(*) AS count FROM "User"').get();
    if (Number(result.count) > 0) {
      const existingDefaultAdmin = db
        .prepare('SELECT "id", "role" FROM "User" WHERE "name" = ? AND "email" = ?')
        .get("admin", "admin@test.com");

      if (existingDefaultAdmin && existingDefaultAdmin.role !== "admin") {
        db.prepare('UPDATE "User" SET "role" = ? WHERE "id" = ?').run(
          "admin",
          existingDefaultAdmin.id,
        );
      }
      return false;
    }

    db.prepare('INSERT INTO "User" ("name", "email", "role", "password") VALUES (?, ?, ?, ?)').run(
      "admin",
      "admin@test.com",
      "admin",
      hashPassword("admin"),
    );
    return true;
  });

  return seed();
}

module.exports = {
  seedDefaultUser,
};
