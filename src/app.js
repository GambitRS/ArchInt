const path = require("node:path");
const express = require("express");
const { hashPassword } = require("./password");
const { mountWorkspace } = require("./workspace");
const USER_ROLES = new Set(["admin", "user"]);
const PUBLIC_DIRECTORY = path.resolve(__dirname, "..", "public");

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

function parseUserId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) {
    const error = new Error("User id must be a positive integer");
    error.status = 400;
    throw error;
  }
  return id;
}

function validateUserInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    const error = new Error("Request body must be a JSON object");
    error.status = 400;
    throw error;
  }

  const { name, email, password } = body;
  const role = body.role === undefined ? "user" : body.role;
  if ([name, email, password].some((value) => typeof value !== "string" || value.trim() === "")) {
    const error = new Error("name, email, and password are required strings");
    error.status = 400;
    throw error;
  }
  if (typeof role !== "string" || !USER_ROLES.has(role)) {
    const error = new Error("role must be either 'admin' or 'user'");
    error.status = 400;
    throw error;
  }

  return {
    name: name.trim(),
    email: email.trim().toLowerCase(),
    password,
    role,
  };
}

function createApp(db) {
  const app = express();

  app.use(express.json({ limit: '5mb' }));
  mountWorkspace(app, db);
  app.use(express.static(PUBLIC_DIRECTORY));

  app.get("/", (_request, response) => {
    response.json({ message: "Hello, world!", api: "/api" });
  });

  app.get("/api", (_request, response) => {
    response.json({
      name: "hello-world-api",
      status: "ok",
      endpoints: {
        users: "/api/users",
      },
    });
  });

  app.get("/api/users", (_request, response) => {
    const users = db
      .prepare('SELECT "id", "name", "email", "role" FROM "User" ORDER BY "id"')
      .all()
      .map(publicUser);

    response.json({ data: users });
  });

  app.get("/api/users/:id", (request, response) => {
    const id = parseUserId(request.params.id);
    const user = db
      .prepare('SELECT "id", "name", "email", "role" FROM "User" WHERE "id" = ?')
      .get(id);

    if (!user) {
      return response.status(404).json({ error: "User not found" });
    }

    return response.json({ data: publicUser(user) });
  });

  app.post("/api/users", (request, response) => {
    const input = validateUserInput(request.body);

    try {
      const result = db
        .prepare(
          'INSERT INTO "User" ("name", "email", "role", "password") VALUES (?, ?, ?, ?)',
        )
        .run(input.name, input.email, input.role, hashPassword(input.password));

      const user = db
        .prepare('SELECT "id", "name", "email", "role" FROM "User" WHERE "id" = ?')
        .get(result.lastInsertRowid);

      return response.status(201).json({ data: publicUser(user) });
    } catch (error) {
      if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
        return response.status(409).json({ error: "A user with that email already exists" });
      }
      throw error;
    }
  });

  app.use((error, _request, response, _next) => {
    if (error.type === "entity.parse.failed") {
      return response.status(400).json({ error: "Request body must contain valid JSON" });
    }

    const status = Number.isInteger(error.status) ? error.status : 500;
    return response.status(status).json({
      error: status === 500 ? "Internal server error" : error.message,
    });
  });

  return app;
}

module.exports = {
  createApp,
  hashPassword,
};
