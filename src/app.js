const path = require("node:path");
const express = require("express");
const { hashPassword, validPassword } = require("./password");
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
  if (
    typeof name !== "string" ||
    name.trim() === "" ||
    name.trim().length > 100
  ) {
    const error = new Error("name is required and must be at most 100 characters");
    error.status = 400;
    throw error;
  }
  if (
    typeof email !== "string" ||
    email.trim().length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  ) {
    const error = new Error("email must be a valid email address");
    error.status = 400;
    throw error;
  }
  if (!validPassword(password)) {
    const error = new Error("password must be between 12 and 1024 characters");
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

  const production = process.env.NODE_ENV === "production";
  app.disable("x-powered-by");
  app.use((_request, response, next) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self'; form-action 'self'",
    );
    if (production) {
      response.setHeader(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains",
      );
    }
    next();
  });
  app.use((request, response, next) => {
    const started = process.hrtime.bigint();
    response.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
      if (response.statusCode >= 500 || durationMs >= 1000) {
        console.warn(
          JSON.stringify({
            event: "http_request",
            method: request.method,
            path: request.path,
            status: response.statusCode,
            durationMs: Math.round(durationMs),
          }),
        );
      }
    });
    next();
  });
  app.use(express.json({ limit: "5mb", strict: true }));
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

  const requireAdmin = (request, response, next) => {
    const user = app.locals.workspaceSessionUser(request);
    if (!user) return response.status(401).json({ error: "Please sign in" });
    if (user.role !== "admin") {
      return response.status(403).json({ error: "Administrator access required" });
    }
    response.setHeader("Cache-Control", "no-store");
    request.workspaceAdmin = user;
    next();
  };
  app.use("/api/users", requireAdmin);

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
  validateUserInput,
};
