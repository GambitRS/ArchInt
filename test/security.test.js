const assert = require("node:assert/strict");
const test = require("node:test");
const Database = require("better-sqlite3");
const { createApp } = require("../src/app");
const { applySchema, loadSchema } = require("../src/database");
const { hashPassword } = require("../src/password");

test("admin access, password changes, recovery, and security headers", async () => {
  const db = new Database(":memory:");
  db.pragma("foreign_keys=ON");
  applySchema(db, loadSchema());
  const insert = db.prepare(
    "INSERT INTO User(name,email,role,password) VALUES (?,?,?,?)",
  );
  insert.run("Admin", "admin@example.com", "admin", hashPassword("admin-password"));
  insert.run("Member", "member@example.com", "user", hashPassword("member-password"));

  const server = createApp(db).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, method = "GET", body, cookie) =>
    fetch(base + path, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(cookie ? { cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

  try {
    const headers = await request("/api");
    assert.equal(headers.headers.get("x-content-type-options"), "nosniff");
    assert.equal(headers.headers.get("x-frame-options"), "DENY");
    assert.equal(headers.headers.get("x-powered-by"), null);
    assert.match(headers.headers.get("content-security-policy"), /script-src 'self'/);

    assert.equal((await request("/api/users")).status, 401);
    const memberLogin = await request("/api/auth/login", "POST", {
      email: "member@example.com",
      password: "member-password",
    });
    const memberCookie = memberLogin.headers.get("set-cookie").split(";")[0];
    assert.equal((await request("/api/users", "GET", undefined, memberCookie)).status, 403);
    assert.equal(
      (
        await request(
          "/api/users",
          "POST",
          {
            name: "Escalated",
            email: "escalated@example.com",
            password: "a-strong-password",
            role: "admin",
          },
          memberCookie,
        )
      ).status,
      403,
    );

    const adminLogin = await request("/api/auth/login", "POST", {
      email: "admin@example.com",
      password: "admin-password",
    });
    const adminCookie = adminLogin.headers.get("set-cookie").split(";")[0];
    assert.equal((await request("/api/users", "GET", undefined, adminCookie)).status, 200);
    assert.equal(
      (
        await request(
          "/api/users",
          "POST",
          {
            name: "New user",
            email: "new@example.com",
            password: "short",
          },
          adminCookie,
        )
      ).status,
      400,
    );
    const created = await request(
      "/api/users",
      "POST",
      {
        name: "New user",
        email: "new@example.com",
        password: "new-user-password",
      },
      adminCookie,
    );
    assert.equal(created.status, 201);
    assert.equal((await created.json()).data.role, "user");

    const changed = await request(
      "/api/auth/password",
      "POST",
      { currentPassword: "admin-password", newPassword: "rotated-admin-password" },
      adminCookie,
    );
    assert.equal(changed.status, 200);
    assert.equal((await request("/api/auth/me", "GET", undefined, adminCookie)).status, 401);
    const rotatedLogin = await request("/api/auth/login", "POST", {
      email: "admin@example.com",
      password: "rotated-admin-password",
    });
    assert.equal(rotatedLogin.status, 200);

    const recoveryRequest = await request("/api/auth/recovery/request", "POST", {
      email: "member@example.com",
    });
    const recovery = (await recoveryRequest.json()).data;
    assert.equal(recovery.accepted, true);
    assert.match(recovery.token, /^[0-9a-f]{64}$/);
    const reset = await request("/api/auth/recovery/reset", "POST", {
      token: recovery.token,
      newPassword: "recovered-member-password",
    });
    assert.equal(reset.status, 200);
    assert.equal((await request("/api/auth/me", "GET", undefined, memberCookie)).status, 401);
    assert.equal(
      (
        await request("/api/auth/login", "POST", {
          email: "member@example.com",
          password: "recovered-member-password",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await request("/api/auth/recovery/reset", "POST", {
          token: recovery.token,
          newPassword: "another-member-password",
        })
      ).status,
      400,
    );
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    db.close();
  }
});
