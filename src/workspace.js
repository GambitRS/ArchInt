const crypto = require("node:crypto");
const { promisify } = require("node:util");
const scrypt = promisify(crypto.scrypt);
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const lifetime = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_DRAWING_NAME = "Untitled drawing";
const MAX_IDEMPOTENCY_KEY_LENGTH = 200;

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
    !["Architecture", "Diagram"].includes(d.category) ||
    !Array.isArray(d.elements) ||
    d.elements.length > 2000
  )
    return false;
  const ids = new Set();
  const valid = d.elements.every((e) => {
    if (!e || typeof e.id !== "string" || e.id.length > 100 || ids.has(e.id))
      return false;
    ids.add(e.id);
    return (
      ["card", "container", "text", "ellipse", "arrow", "pen", "icon"].includes(
        e.kind,
      ) &&
      ["x", "y", "w", "h", "fontSize"].every(
        (k) => Number.isFinite(e[k]) && Math.abs(e[k]) <= 100000,
      ) &&
      (e.kind === "arrow" || (e.w >= 0 && e.h >= 0)) &&
      e.fontSize >= 8 &&
      e.fontSize <= 80 &&
      ["text", "detail"].every(
        (k) => typeof e[k] === "string" && e[k].length <= 10000,
      ) &&
      ["fill", "stroke"].every(
        (k) => typeof e[k] === "string" && /^#[a-f0-9]{6}$/i.test(e[k]),
      ) &&
      (e.rotation === undefined ||
        (Number.isFinite(e.rotation) && Math.abs(e.rotation) <= 3600)) &&
      (e.groupId === undefined ||
        (typeof e.groupId === "string" && e.groupId.length <= 100)) &&
      (e.parentId === undefined ||
        (typeof e.parentId === "string" && e.parentId.length <= 100)) &&
      (e.locked === undefined || typeof e.locked === "boolean") &&
      (e.hidden === undefined || typeof e.hidden === "boolean") &&
      (e.strokeWidth === undefined ||
        (Number.isFinite(e.strokeWidth) && e.strokeWidth > 0 && e.strokeWidth <= 100)) &&
      (e.fontWeight === undefined || [400, 500, 600, 700].includes(e.fontWeight)) &&
      (e.lineHeight === undefined ||
        (Number.isFinite(e.lineHeight) && e.lineHeight >= 1 && e.lineHeight <= 3)) &&
      (e.textAlign === undefined || ["left", "center", "right"].includes(e.textAlign)) &&
      (e.wrap === undefined || typeof e.wrap === "boolean") &&
      (e.overflow === undefined || ["visible", "hidden"].includes(e.overflow)) &&
      (e.points === undefined ||
        (Array.isArray(e.points) &&
          e.points.length <= 20000 &&
          e.points.every(
            (p) =>
              Array.isArray(p) &&
              p.length === 2 &&
              p.every((n) => Number.isFinite(n) && Math.abs(n) <= 100000),
          )))
    );
  });
  if (!valid) return false;
  return d.elements.every(
    (e) =>
      e.parentId === undefined ||
      (e.parentId !== e.id && ids.has(e.parentId)),
  );
}

function mountWorkspace(app, db) {
  const failures = new Map();
  const cookie = (token) =>
    `archint_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${lifetime / 1000}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
  const tokenOf = (req) =>
    (req.headers.cookie || "")
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("archint_session="))
      ?.slice(16) || "";
  const sessionUser = (req) => {
    const token = tokenOf(req);
    if (!token) return undefined;
    return db
      .prepare(
        "SELECT u.* FROM User u JOIN Session s ON s.userId=u.id WHERE s.tokenHash=? AND s.expiresAt>?",
      )
      .get(hash(token), Date.now());
  };
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
    res.setHeader(
      "Set-Cookie",
      "archint_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
    );
    res.json({ data: true });
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
  const serialize = (row) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    updated: row.updatedAt,
    elements: JSON.parse(row.document),
    revision: row.revision,
  });

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

    const id = crypto.randomUUID();
    db.prepare(
      "INSERT INTO Drawing (id,userId,name,category,document,updatedAt,revision) VALUES (?,?,?,?,?,?,1)",
    ).run(
      id,
      userId,
      normalizeDrawingName(d.name),
      d.category,
      JSON.stringify(d.elements),
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
      JSON.stringify(d.elements),
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
