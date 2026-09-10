const assert = require("node:assert/strict");
const test = require("node:test");
const Database = require("better-sqlite3");

const { createApp } = require("../src/app");
const { applySchema, loadSchema } = require("../src/database");
const { hashPassword } = require("../src/password");
const model = require("../shared/archimate-model");

test("canonical persistence keeps inactive views and repeated model occurrences", async () => {
  const db = new Database(":memory:");
  applySchema(db, loadSchema());
  db.prepare("INSERT INTO User(name,email,role,password) VALUES (?,?,?,?)").run(
    "Alice",
    "alice@example.com",
    "user",
    hashPassword("password"),
  );
  const server = createApp(db).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, method = "GET", body, cookie) => fetch(base + path, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  try {
    const login = await request("/api/auth/login", "POST", { email: "alice@example.com", password: "password" });
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const document = model.migrateLegacyDocument([
      {
        id: "actor-occurrence",
        kind: "card",
        x: 40,
        y: 50,
        w: 200,
        h: 90,
        text: "Customer",
        detail: "The customer role",
        fill: "#eff5ef",
        stroke: "#72a17c",
        fontSize: 16,
        archimateType: "BusinessActor",
        modelElementId: "customer-model",
      },
    ], { name: "Multi-view model" });
    const secondView = model.createView("Context", { width: 1800, height: 1100 });
    document.views.push(secondView);
    secondView.nodes["customer-context"] = {
      ...document.views[0].nodes["node-actor-occurrence"],
      id: "customer-context",
      x: 600,
      y: 260,
    };
    secondView.order.push("customer-context");
    document.activeViewId = secondView.id;
    const body = { name: "Multi-view model", category: "Architecture", document, elements: model.flattenDocument(document) };
    const created = await request("/api/drawings", "POST", body, cookie);
    assert.equal(created.status, 201);
    const saved = (await created.json()).data;
    assert.equal(saved.viewSummaries.length, 2);
    assert.equal(saved.document.views[1].nodes["customer-context"].x, 600);

    const activeChanged = {
      ...saved,
      elements: [{ ...saved.elements[0], x: 720 }],
    };
    const updated = await request(`/api/drawings/${saved.id}`, "PUT", activeChanged, cookie);
    assert.equal(updated.status, 200);
    const updatedData = (await updated.json()).data;
    assert.equal(updatedData.document.views.length, 2);
    assert.equal(updatedData.document.views[0].nodes["node-actor-occurrence"].x, 40);
    assert.equal(updatedData.document.views[1].nodes["customer-context"].x, 720);
    assert.equal(model.validateCanonicalDocument(updatedData.document).length, 0);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    db.close();
  }
});
