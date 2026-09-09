const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const { createApp } = require("../src/app");
const { applySchema, loadSchema } = require("../src/database");
const { hashPassword } = require("../src/password");

test("sessions, drawing ownership, persistence, validation, and conflicting updates", async () => {
  const db = new Database(":memory:");
  db.pragma("foreign_keys=ON");
  applySchema(db, loadSchema());
  const insert = db.prepare(
    "INSERT INTO User(name,email,role,password) VALUES (?,?,?,?)",
  );
  insert.run(
    "Alice",
    "alice@test.com",
    "user",
    hashPassword("correct-password"),
  );
  insert.run("Bob", "bob@test.com", "user", hashPassword("other-password"));
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
    assert.equal((await request("/api/drawings")).status, 401);
    assert.equal(
      (
        await request("/api/auth/login", "POST", {
          email: "alice@test.com",
          password: "bad",
        })
      ).status,
      401,
    );
    const login = await request("/api/auth/login", "POST", {
      email: "ALICE@test.com",
      password: "correct-password",
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie").split(";")[0];
    assert.match(login.headers.get("set-cookie"), /HttpOnly/);
    assert.match(login.headers.get("set-cookie"), /SameSite=Strict/);
    assert.equal((await login.json()).data.password, undefined);
    assert.equal(
      (await (await request("/api/auth/me", "GET", undefined, cookie)).json())
        .data.name,
      "Alice",
    );
    const doc = {
      name: "Architecture",
      category: "Architecture",
      elements: [
        {
          id: "n1",
          kind: "card",
          x: 10,
          y: 20,
          w: 200,
          h: 90,
          text: "Router",
          detail: "Routes requests",
          fill: "#ffffff",
          stroke: "#7392b8",
          fontSize: 18,
        },
      ],
    };
    const created = await request("/api/drawings", "POST", doc, cookie);
    assert.equal(created.status, 201);
    const d = (await created.json()).data;
    const list = (
      await (await request("/api/drawings", "GET", undefined, cookie)).json()
    ).data;
    assert.equal(list.length, 1);
    assert.deepEqual(list[0].elements, doc.elements);
    const updated = await request(
      `/api/drawings/${d.id}`,
      "PUT",
      { ...d, name: "Renamed" },
      cookie,
    );
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).data.revision, 2);
    assert.equal(
      (await request(`/api/drawings/${d.id}`, "PUT", d, cookie)).status,
      409,
    );
    assert.equal(
      (
        await request(
          "/api/drawings",
          "POST",
          {
            ...doc,
            elements: [
              { ...doc.elements[0], fill: "url(https://bad.invalid)" },
            ],
          },
          cookie,
        )
      ).status,
      400,
    );
    const bobLogin = await request("/api/auth/login", "POST", {
      email: "bob@test.com",
      password: "other-password",
    });
    const bobCookie = bobLogin.headers.get("set-cookie").split(";")[0];
    assert.deepEqual(
      (
        await (
          await request("/api/drawings", "GET", undefined, bobCookie)
        ).json()
      ).data,
      [],
    );
    assert.equal(
      (
        await request(
          `/api/drawings/${d.id}`,
          "PUT",
          { ...d, revision: 2 },
          bobCookie,
        )
      ).status,
      404,
    );
    const cross = await fetch(base + "/api/drawings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie,
        Origin: "https://other.invalid",
      },
      body: JSON.stringify(doc),
    });
    assert.equal(cross.status, 403);
    await request("/api/auth/logout", "POST", undefined, cookie);
    assert.equal(
      (await request("/api/drawings", "GET", undefined, cookie)).status,
      401,
    );
    const again = await request("/api/auth/login", "POST", {
      email: "alice@test.com",
      password: "correct-password",
    });
    const againCookie = again.headers.get("set-cookie").split(";")[0];
    assert.equal(
      (
        await (
          await request("/api/drawings", "GET", undefined, againCookie)
        ).json()
      ).data[0].name,
      "Renamed",
    );
    db.prepare("UPDATE Session SET expiresAt=0").run();
    assert.equal(
      (await request("/api/drawings", "GET", undefined, againCookie)).status,
      401,
    );
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    db.close();
  }
});
