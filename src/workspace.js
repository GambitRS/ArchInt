const crypto = require("node:crypto");
const { promisify } = require("node:util");
const { hashPassword, validPassword, verifyPassword } = require("./password");
const {
  canonicalDocumentForDrawing,
  ensureCanonicalDocument,
  flattenDocument,
  validateLegacyElements,
} = require("../shared/archimate-model");
const scrypt = promisify(crypto.scrypt);
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const lifetime = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_DRAWING_NAME = "Untitled drawing";
const MAX_IDEMPOTENCY_KEY_LENGTH = 200;
const ANCHOR_SIDES = ["top", "right", "bottom", "left"];
const ICON_NAMES = [
  "computer",
  "person",
  "cloud",
  "model",
  "database",
  "shield",
  "folder",
  "terminal",
  "globe",
  "microphone",
];

function normalizeDrawingName(value) {
  const name = typeof value === "string" ? value.trim() : "";
  return name || DEFAULT_DRAWING_NAME;
}

const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
});

function validDocument(d) {
  if (
    !d ||
    typeof d.name !== "string" ||
    d.name.length > 100 ||
    !["Architecture", "Diagram"].includes(d.category)
  )
    return false;
  if (Array.isArray(d.elements) && validateLegacyElements(d.elements).length) return false;
  try {
    return canonicalDocumentForDrawing(d).errors.length === 0;
  } catch {
    return false;
  }
}

function mountWorkspace(app, db) {
  const failures = new Map();
  let lastSessionCleanup = 0;
  const cookie = (token) =>
    `archint_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${lifetime / 1000}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
  const clearCookie =
    "archint_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0";
  const tokenOf = (req) =>
    (req.headers.cookie || "")
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("archint_session="))
      ?.slice(16) || "";
  const sessionUser = (req) => {
    const now = Date.now();
    if (now - lastSessionCleanup > 60_000) {
      db.prepare("DELETE FROM Session WHERE expiresAt <= ?").run(now);
      lastSessionCleanup = now;
    }
    const token = tokenOf(req);
    if (!token) return undefined;
    return db
      .prepare(
        "SELECT u.* FROM User u JOIN Session s ON s.userId=u.id WHERE s.tokenHash=? AND s.expiresAt>?",
      )
      .get(hash(token), now);
  };
  app.locals.workspaceSessionUser = sessionUser;
  app.use("/api", (req, res, next) => {
    if (
      ["POST", "PUT", "DELETE", "PATCH"].includes(req.method) &&
      req.headers.origin
    ) {
      let host;
      try {
        host = new URL(req.headers.origin).host;
      } catch {
        return res.status(403).json({ error: "Invalid origin" });
      }
      if (
        host !== req.headers.host &&
        req.headers.origin !== process.env.APP_ORIGIN
      )
        return res.status(403).json({ error: "Cross-origin request rejected" });
    }
    next();
  });
  app.post("/api/auth/login", async (req, res, next) => {
    try {
      const { email, password } = req.body || {};
      if (
        typeof email !== "string" ||
        typeof password !== "string" ||
        email.length > 254 ||
        password.length > 1024
      )
        return res.status(400).json({ error: "Enter your email and password" });
      for (const [key, value] of failures)
        if (value.until < Date.now()) failures.delete(key);
      const attempt = failures.get(req.ip) || {
        count: 0,
        until: Date.now() + 900000,
      };
      if (attempt.count >= 10)
        return res
          .status(429)
          .json({ error: "Too many attempts. Try again in 15 minutes." });
      attempt.count++;
      failures.set(req.ip, attempt);
      const user = db
        .prepare("SELECT * FROM User WHERE email=?")
        .get(email.trim().toLowerCase());
      const [salt, expected] = (
        user?.password || "invalid:" + "0".repeat(128)
      ).split(":");
      const actual = await scrypt(password, salt, 64);
      const valid =
        typeof expected === "string" &&
        /^[a-f0-9]{128}$/i.test(expected) &&
        crypto.timingSafeEqual(actual, Buffer.from(expected, "hex"));
      if (!user || !valid)
        return res
          .status(401)
          .json({ error: "Email or password is incorrect" });
      failures.delete(req.ip);
      db.prepare(
        "DELETE FROM Session WHERE expiresAt <= ? OR tokenHash = ?",
      ).run(Date.now(), hash(tokenOf(req)));
      const token = crypto.randomBytes(32).toString("hex");
      db.prepare(
        "INSERT INTO Session (tokenHash,userId,expiresAt) VALUES (?,?,?)",
      ).run(hash(token), user.id, Date.now() + lifetime);
      res.setHeader("Set-Cookie", cookie(token));
      res.json({ data: publicUser(user) });
    } catch (error) {
      next(error);
    }
  });
  app.get("/api/auth/me", (req, res) => {
    const u = sessionUser(req);
    res.setHeader("Cache-Control", "no-store");
    return u
      ? res.json({ data: publicUser(u) })
      : res.status(401).json({ error: "Please sign in" });
  });
  app.post("/api/auth/logout", (req, res) => {
    db.prepare("DELETE FROM Session WHERE tokenHash=?").run(hash(tokenOf(req)));
    res.setHeader("Set-Cookie", clearCookie);
    res.json({ data: true });
  });
  app.post("/api/auth/password", (req, res) => {
    const user = sessionUser(req);
    if (!user) {
      return res
        .status(401)
        .json({ error: "Your session ended. Please sign in again." });
    }
    const { currentPassword, newPassword } = req.body || {};
    if (
      typeof currentPassword !== "string" ||
      currentPassword.length === 0 ||
      currentPassword.length > 1024 ||
      !validPassword(newPassword)
    ) {
      return res.status(400).json({
        error: "Current password is required and the new password must be between 12 and 1024 characters",
      });
    }
    if (!verifyPassword(currentPassword, user.password)) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }
    db.transaction(() => {
      db.prepare("UPDATE User SET password=? WHERE id=?").run(
        hashPassword(newPassword),
        user.id,
      );
      db.prepare("DELETE FROM Session WHERE userId=?").run(user.id);
    })();
    res.setHeader("Set-Cookie", clearCookie);
    return res.json({ data: { signedOut: true } });
  });
  app.post("/api/auth/recovery/request", (req, res) => {
    const email = req.body?.email;
    if (
      typeof email !== "string" ||
      email.trim().length === 0 ||
      email.trim().length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      return res.status(400).json({ error: "Enter a valid email address" });
    }
    const user = db
      .prepare("SELECT id FROM User WHERE email=?")
      .get(email.trim().toLowerCase());
    const result = { accepted: true };
    if (user) {
      const token = crypto.randomBytes(32).toString("hex");
      db.transaction(() => {
        db.prepare("DELETE FROM PasswordReset WHERE userId=? OR expiresAt <= ?").run(
          user.id,
          Date.now(),
        );
        db.prepare(
          "INSERT INTO PasswordReset (id,userId,tokenHash,expiresAt,usedAt) VALUES (?,?,?,?,NULL)",
        ).run(
          crypto.randomUUID(),
          user.id,
          hash(token),
          Date.now() + 30 * 60 * 1000,
        );
      })();
      if (process.env.NODE_ENV !== "production") result.token = token;
    } else {
      db.prepare("DELETE FROM PasswordReset WHERE expiresAt <= ?").run(Date.now());
    }
    return res.json({ data: result });
  });
  app.post("/api/auth/recovery/reset", (req, res) => {
    const { token, newPassword } = req.body || {};
    if (
      typeof token !== "string" ||
      token.length < 32 ||
      token.length > 256 ||
      !validPassword(newPassword)
    ) {
      return res.status(400).json({ error: "Recovery token or new password is invalid" });
    }
    const reset = db
      .prepare(
        "SELECT * FROM PasswordReset WHERE tokenHash=? AND usedAt IS NULL AND expiresAt > ?",
      )
      .get(hash(token), Date.now());
    if (!reset) {
      return res.status(400).json({ error: "Recovery link is invalid or expired" });
    }
    db.transaction(() => {
      db.prepare("UPDATE User SET password=? WHERE id=?").run(
        hashPassword(newPassword),
        reset.userId,
      );
      db.prepare("UPDATE PasswordReset SET usedAt=? WHERE id=?").run(
        Date.now(),
        reset.id,
      );
      db.prepare("DELETE FROM Session WHERE userId=?").run(reset.userId);
    })();
    return res.json({ data: { signedOut: true } });
  });
  app.use("/api/drawings", (req, res, next) => {
    const user = sessionUser(req);
    if (!user)
      return res
        .status(401)
        .json({ error: "Your session ended. Please sign in again." });
    req.workspaceUser = user;
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  const serialize = (row) => {
    const document = ensureCanonicalDocument(JSON.parse(row.document), { name: row.name });
    const activeView = document.views.find((view) => view.id === document.activeViewId) || document.views[0];
    return {
      id: row.id,
      name: row.name,
      category: row.category,
      updated: row.updatedAt,
      document,
      elements: flattenDocument(document),
      activeViewId: document.activeViewId,
      viewSummaries: document.views.map((view) => ({
        id: view.id,
        name: view.name,
        width: view.width,
        height: view.height,
      })),
      defaultView: activeView?.name || "Main view",
      documentFormat: document.format,
      languageVersion: document.language.version,
      semanticElementCount: Object.keys(document.model.elements).length,
      relationshipCount: Object.keys(document.model.relationships).length,
      revision: row.revision,
    };
  };

  const ownedDrawing = (id, userId) =>
    db.prepare("SELECT * FROM Drawing WHERE id=? AND userId=?").get(id, userId);

  app.get("/api/drawings", (req, res) =>
    res.json({
      data: db
        .prepare("SELECT * FROM Drawing WHERE userId=? ORDER BY updatedAt DESC")
        .all(req.workspaceUser.id)
        .map(serialize),
    }),
  );

  app.get("/api/drawings/:id", (req, res) => {
    const drawing = ownedDrawing(req.params.id, req.workspaceUser.id);
    return drawing
      ? res.json({ data: serialize(drawing) })
      : res.status(404).json({ error: "Drawing not found" });
  });

  const createDrawing = db.transaction((d, userId, idempotencyKey) => {
    const requestId = idempotencyKey
      ? hash(`${userId}:${idempotencyKey}`)
      : null;
    if (requestId) {
      const previous = db
        .prepare(
          "SELECT drawingId FROM DrawingCreation WHERE id=? AND userId=?",
        )
        .get(requestId, userId);
      if (previous) {
        const existing = ownedDrawing(previous.drawingId, userId);
        if (existing) return { row: existing, replayed: true };
      }
    }

    const canonical = canonicalDocumentForDrawing(d).document;
    canonical.model.name = normalizeDrawingName(d.name);
    const id = crypto.randomUUID();
    db.prepare(
      "INSERT INTO Drawing (id,userId,name,category,document,updatedAt,revision) VALUES (?,?,?,?,?,?,1)",
    ).run(
      id,
      userId,
      normalizeDrawingName(d.name),
      d.category,
      JSON.stringify(canonical),
      new Date().toISOString(),
    );
    if (requestId) {
      db.prepare(
        "INSERT INTO DrawingCreation (id,userId,idempotencyKey,drawingId,createdAt) VALUES (?,?,?,?,?)",
      ).run(requestId, userId, idempotencyKey, id, new Date().toISOString());
    }
    return { row: ownedDrawing(id, userId), replayed: false };
  });

  app.post("/api/drawings", (req, res) => {
    const rawIdempotencyKey = req.get("Idempotency-Key");
    const idempotencyKey = rawIdempotencyKey?.trim();
    if (
      rawIdempotencyKey !== undefined &&
      (!idempotencyKey || idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH)
    )
      return res.status(400).json({ error: "Idempotency-Key is invalid" });
    if (!validDocument(req.body))
      return res
        .status(400)
        .json({ error: "Drawing data is invalid or too large" });
    const result = createDrawing(
      req.body,
      req.workspaceUser.id,
      idempotencyKey,
    );
    res
      .status(result.replayed ? 200 : 201)
      .json({ data: serialize(result.row) });
  });
  app.put("/api/drawings/:id", (req, res) => {
    const existing = ownedDrawing(req.params.id, req.workspaceUser.id);
    if (!existing) return res.status(404).json({ error: "Drawing not found" });
    if (!validDocument(req.body))
      return res
        .status(400)
        .json({ error: "Drawing data is invalid or too large" });
    const d = req.body;
    const canonical = canonicalDocumentForDrawing(d).document;
    canonical.model.name = normalizeDrawingName(d.name);
    if (d.revision !== existing.revision)
      return res
        .status(409)
        .json({
          error:
            "This drawing changed in another tab. Export your work, then reopen it before editing.",
        });
    db.prepare(
      "UPDATE Drawing SET name=?,category=?,document=?,updatedAt=?,revision=revision+1 WHERE id=? AND userId=?",
    ).run(
      normalizeDrawingName(d.name),
      d.category,
      JSON.stringify(canonical),
      new Date().toISOString(),
      req.params.id,
      req.workspaceUser.id,
    );
    res.json({
      data: serialize(
        db.prepare("SELECT * FROM Drawing WHERE id=?").get(req.params.id),
      ),
    });
  });
}
module.exports = { mountWorkspace, validDocument };
