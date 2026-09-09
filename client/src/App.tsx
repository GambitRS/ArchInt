import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import {
  Diagram,
  makeExample,
  type Drawing,
  type Element,
  type Kind,
} from "./diagram";

type User = { id: number; name: string; email: string };
async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Something went wrong. Please try again.");
  return data.data;
}
const symbols: Record<string, string> = {
  select: "↖",
  card: "▭",
  container: "▣",
  text: "T",
  ellipse: "○",
  arrow: "↗",
  pen: "〰",
  icon: "◇",
};
function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        A<span>↗</span>
      </span>
      <strong>
        ArchInt<span className="brand-dot">.</span>
      </strong>
    </div>
  );
}
export default function App() {
  const [screen, setScreen] = useState<"login" | "library" | "editor">("login");
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [current, setCurrent] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [tool, setTool] = useState<Kind | "select">("select");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All drawings");
  const [zoom, setZoom] = useState(65);
  const [grid, setGrid] = useState(true);
  const [status, setStatus] = useState("All changes saved");
  const [history, setHistory] = useState<Element[][]>([]);
  const [future, setFuture] = useState<Element[][]>([]);
  const [modal, setModal] = useState(false);
  const [newName, setNewName] = useState("Untitled drawing");
  const [template, setTemplate] = useState("blank");
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{
    id: string;
    x: number;
    y: number;
    original: Element[];
  } | null>(null);
  const pending = useRef(new Map<string, Drawing>());
  const revisions = useRef(new Map<string, number>());
  const saving = useRef<Promise<boolean> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drawing = drawings.find((d) => d.id === current);
  const element = drawing?.elements.find((e) => e.id === selected);
  async function loadWorkspace(u: User) {
    const data = await api<Drawing[]>("/drawings");
    revisions.current = new Map(data.map((d) => [d.id, d.revision]));
    setDrawings(data);
    setUser(u);
    setScreen("library");
  }
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const u = await api<User>("/auth/me");
        if (active) await loadWorkspace(u);
      } catch {
        /* Login is the default when no session is present. */
      } finally {
        if (active) setBusy(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  async function flush(): Promise<boolean> {
    if (saving.current) return saving.current;
    if (timer.current) clearTimeout(timer.current);
    const work = async () => {
      while (pending.current.size) {
        const [id, d] = pending.current.entries().next().value!;
        setStatus("Saving…");
        try {
          const saved = await api<Drawing>(`/drawings/${id}`, "PUT", {
            ...d,
            name: d.name.trim() || "Untitled drawing",
            revision: revisions.current.get(id),
          });
          revisions.current.set(id, saved.revision);
          if (pending.current.get(id) === d) pending.current.delete(id);
        } catch (e) {
          setStatus("Changes not saved");
          setError((e as Error).message);
          return false;
        }
      }
      setStatus("All changes saved");
      return true;
    };
    saving.current = work();
    const result = await saving.current;
    saving.current = null;
    return result;
  }
  function commit(d: Drawing) {
    setDrawings((ds) => ds.map((n) => (n.id === d.id ? d : n)));
    pending.current.set(d.id, d);
    setStatus("Unsaved changes");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 700);
  }
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => {
      if (pending.current.size || drag.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, []);
  function replace(elements: Element[], remember = true) {
    if (!drawing) return;
    if (remember) {
      setHistory((h) => [...h.slice(-49), structuredClone(drawing.elements)]);
      setFuture([]);
    }
    commit({ ...drawing, elements, updated: new Date().toISOString() });
  }
  const update = (patch: Partial<Element>) =>
    replace(
      drawing!.elements.map((e) =>
        e.id === selected ? { ...e, ...patch } : e,
      ),
    );
  const undo = () => {
    if (!drawing || !history.length) return;
    setFuture((f) => [...f, drawing.elements]);
    replace(history[history.length - 1], false);
    setHistory((h) => h.slice(0, -1));
    setSelected(null);
  };
  const redo = () => {
    if (!drawing || !future.length) return;
    setHistory((h) => [...h, drawing.elements]);
    replace(future[future.length - 1], false);
    setFuture((f) => f.slice(0, -1));
  };
  const remove = () => {
    replace(drawing!.elements.filter((e) => e.id !== selected));
    setSelected(null);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        screen !== "editor" ||
        modal ||
        (e.target instanceof HTMLElement &&
          /INPUT|TEXTAREA|SELECT/.test(e.target.tagName))
      )
        return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if (e.key === "Delete" && selected) remove();
      else if (e.key === "Escape") {
        setSelected(null);
        setTool("select");
      } else if (!e.ctrlKey && !e.metaKey) {
        const shortcuts: Record<string, Kind | "select"> = {
          v: "select",
          r: "card",
          t: "text",
          o: "ellipse",
          a: "arrow",
          p: "pen",
        };
        if (shortcuts[e.key]) setTool(shortcuts[e.key]);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  function open(d: Drawing) {
    setCurrent(d.id);
    setScreen("editor");
    setSelected(null);
    setHistory([]);
    setFuture([]);
    setTool("select");
    setZoom(
      Math.max(25, Math.min(85, Math.floor((window.innerWidth - 510) / 14))),
    );
  }
  async function create() {
    setBusy(true);
    setError("");
    try {
      const d = await api<Drawing>("/drawings", "POST", {
        name: newName.trim() || "Untitled drawing",
        category: template === "blank" ? "Diagram" : "Architecture",
        elements: template === "blank" ? [] : makeExample(),
      });
      revisions.current.set(d.id, d.revision);
      setDrawings((ds) => [d, ...ds]);
      open(d);
      setModal(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    if (!(await flush())) return;
    try {
      await api("/auth/logout", "POST");
      setUser(null);
      setPassword("");
      setDrawings([]);
      setScreen("login");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function point(e: PointerEvent<SVGSVGElement>) {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(
      e.currentTarget.getScreenCTM()!.inverse(),
    );
    return { x: p.x, y: p.y };
  }
  function down(e: PointerEvent<SVGSVGElement>) {
    if (e.button !== 0 || !drawing) return;
    const p = point(e);
    const target = (e.target as SVGElement)
      .closest("[data-element]")
      ?.getAttribute("data-element");
    if (tool === "select") {
      setSelected(target || null);
      if (target) {
        drag.current = {
          id: target,
          ...p,
          original: structuredClone(drawing.elements),
        };
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      return;
    }
    const n: Element = {
      id: crypto.randomUUID(),
      kind: tool,
      x: p.x,
      y: p.y,
      w:
        tool === "arrow"
          ? 150
          : tool === "container"
            ? 320
            : tool === "icon"
              ? 70
              : 200,
      h: tool === "arrow" ? 0 : tool === "container" ? 220 : 90,
      text:
        tool === "text"
          ? "Add your text"
          : tool === "card"
            ? "New component"
            : tool === "container"
              ? "System boundary"
              : tool === "icon"
                ? "◇"
                : "",
      detail: "",
      fill: tool === "container" ? "#f1f5f2" : "#eef3ff",
      stroke: "#7392b8",
      fontSize: 18,
      points: tool === "pen" ? [[0, 0]] : undefined,
    };
    replace([...drawing.elements, n]);
    setSelected(n.id);
    if (tool === "pen" || tool === "arrow") {
      drag.current = { id: n.id, ...p, original: [...drawing.elements, n] };
      e.currentTarget.setPointerCapture(e.pointerId);
    } else setTool("select");
  }
  function move(e: PointerEvent<SVGSVGElement>) {
    if (!drag.current || !drawing) return;
    const p = point(e),
      d = drag.current,
      base = d.original.find((n) => n.id === d.id)!;
    const elements = drawing.elements.map((n) =>
      n.id !== d.id
        ? n
        : tool === "pen"
          ? {
              ...n,
              points: [
                ...(n.points || []),
                [p.x - base.x, p.y - base.y] as [number, number],
              ],
            }
          : tool === "arrow"
            ? { ...n, w: p.x - base.x, h: p.y - base.y }
            : { ...n, x: base.x + p.x - d.x, y: base.y + p.y - d.y },
    );
    setDrawings((ds) =>
      ds.map((n) => (n.id === current ? { ...n, elements } : n)),
    );
  }
  function up() {
    if (!drag.current || !drawing) return;
    if (tool === "select") {
      setHistory((h) => [...h.slice(-49), drag.current!.original]);
      setFuture([]);
    }
    commit({ ...drawing, updated: new Date().toISOString() });
    drag.current = null;
    setTool("select");
  }
  function download(format: "svg" | "png" = "svg") {
    if (!svg.current || !drawing) return;
    const clone = svg.current.cloneNode(true) as SVGSVGElement;
    clone.querySelectorAll("[data-selection]").forEach((n) => n.remove());
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", "1400");
    clone.setAttribute("height", "900");
    clone.style.cssText = "background:white;font-family:Arial,sans-serif";
    const url = URL.createObjectURL(
      new Blob([new XMLSerializer().serializeToString(clone)], {
        type: "image/svg+xml",
      }),
    );
    const a = document.createElement("a");
    a.download = `${drawing.name.replace(/[^a-z0-9 _-]/gi, "") || "drawing"}.${format}`;
    if (format === "svg") {
      a.href = url;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } else {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 2800;
        canvas.height = 1800;
        const context = canvas.getContext("2d");
        if (!context) {
          setError("Could not export PNG. Please try SVG.");
          URL.revokeObjectURL(url);
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        a.href = canvas.toDataURL("image/png");
        a.click();
        URL.revokeObjectURL(url);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        setError("Could not export PNG. Please try SVG.");
      };
      image.src = url;
    }
  }
  const visible = drawings.filter(
    (d) =>
      (filter === "All drawings" || d.category === filter) &&
      d.name.toLowerCase().includes(search.toLowerCase()),
  );
  const dialog = modal && (
    <div className="modal-backdrop" onClick={() => !busy && setModal(false)}>
      <form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !busy) setModal(false);
          if (e.key === "Tab") {
            const items = Array.from(
              e.currentTarget.querySelectorAll<HTMLElement>(
                "button:not(:disabled),input",
              ),
            );
            const first = items[0],
              last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <div className="row between">
          <span className="eyebrow">A NEW IDEA STARTS HERE</span>
          <button
            type="button"
            disabled={busy}
            aria-label="Close"
            onClick={() => setModal(false)}
          >
            ×
          </button>
        </div>
        <h2 id="new-title">Create a drawing</h2>
        <label>
          Drawing name
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={100}
          />
        </label>
        <p>Choose your starting point</p>
        <div className="template-options">
          {["blank", "architecture"].map((t) => (
            <button
              type="button"
              className={template === t ? "chosen" : ""}
              onClick={() => setTemplate(t)}
              key={t}
            >
              <span>{t === "blank" ? "+" : "▧"}</span>
              {t === "blank" ? "Blank canvas" : "Architecture template"}
            </button>
          ))}
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary wide" disabled={busy}>
          {busy ? "Creating…" : "Create drawing ↗"}
        </button>
      </form>
    </div>
  );
  if (screen === "login")
    return (
      <main className="login">
        <section className="login-form">
          <Brand />
          <form
            className="login-content"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                await loadWorkspace(
                  await api<User>("/auth/login", "POST", { email, password }),
                );
                setPassword("");
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <span className="eyebrow">YOUR IDEAS. CONNECTED.</span>
            <h1>
              Make the complex
              <br />
              look simple.
            </h1>
            <p>
              A space to map systems, connect ideas,
              <br />
              and bring your next big picture to life.
            </p>
            <h2>Welcome back</h2>
            <label>
              Email address
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                placeholder="you@company.com"
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                placeholder="Enter your password"
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button className="primary wide" disabled={busy}>
              {busy ? "Connecting…" : "Sign in to your workspace"}
              <span>↗</span>
            </button>
            <div className="demo-note">
              <span>◉</span> Your drawings, saved in your workspace.
            </div>
          </form>
          <small>ArchInt / A little clarity goes a long way.</small>
        </section>
        <section className="login-art">
          <div className="art-label">
            <span className="status-dot" /> FROM FIRST THOUGHT TO FULL PICTURE
          </div>
          <div className="art-paper">
            <Diagram elements={makeExample()} />
          </div>
          <div className="art-caption">
            <span>01 / THE BIG PICTURE</span>
            <h2>
              Everything connects.
              <br />
              Give it a place.
            </h2>
            <p>Architecture diagrams, workflows, and ideas worth sharing.</p>
          </div>
          <div className="art-corner">↗</div>
        </section>
      </main>
    );
  return (
    <div className="app">
      <header className="topbar">
        <Brand />
        <div className="breadcrumb">
          <span>/</span>
          <button
            onClick={() => {
              void flush();
              setScreen("library");
            }}
          >
            Workspace
          </button>
          {screen === "editor" && drawing && (
            <>
              <span>/</span>
              <input
                aria-label="Drawing title"
                maxLength={100}
                value={drawing.name}
                onChange={(e) =>
                  commit({
                    ...drawing,
                    name: e.target.value,
                    updated: new Date().toISOString(),
                  })
                }
              />
            </>
          )}
        </div>
        <div className="top-actions">
          {screen === "editor" && (
            <>
              <span className="save-status" role="status">
                <i className="status-dot" />
                {status}
              </span>
              <button className="export-png" onClick={() => download("png")}>
                PNG ↓
              </button>
              <button className="primary" onClick={() => download("svg")}>
                Export SVG ↗
              </button>
            </>
          )}
          <button
            className="avatar"
            title={`Sign out ${user?.name}`}
            onClick={() => void logout()}
          >
            {user?.name.charAt(0).toUpperCase()}
          </button>
        </div>
      </header>
      {error && !modal && (
        <div className="error-bar" role="alert">
          {error}
          <button
            onClick={() => {
              setError("");
              void flush();
            }}
          >
            Retry saving
          </button>
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}
      {screen === "library" ? (
        <div className="library-layout">
          <aside className="library-nav">
            <div className="workspace-label">
              <span className="workspace-icon">
                {user?.name.charAt(0).toUpperCase()}
              </span>
              <div>
                <strong>{user?.name}’s workspace</strong>
                <small>Personal workspace</small>
              </div>
            </div>
            <div className="nav-section">WORKSPACE</div>
            {["All drawings", "Architecture", "Diagram"].map((f, i) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={filter === f ? "nav-item active" : "nav-item"}
              >
                <span>{["▦", "▧", "◇"][i]}</span>
                {f}
                <small>
                  {
                    drawings.filter(
                      (d) => f === "All drawings" || d.category === f,
                    ).length
                  }
                </small>
              </button>
            ))}
            <div className="nav-bottom">
              <div className="small-mark">✳</div>
              <strong>Room for your next idea.</strong>
              <p>
                Start with a blank page.
                <br />
                See where it takes you.
              </p>
              <button
                onClick={() => {
                  setTemplate("blank");
                  setModal(true);
                }}
              >
                Create a drawing ↗
              </button>
            </div>
          </aside>
          <main className="library-main">
            <div className="row between">
              <div>
                <div className="eyebrow">YOUR WORKSPACE</div>
                <h1>
                  A place for the big picture<span>.</span>
                </h1>
                <p className="muted">
                  Pick up where you left off, or start with a new idea.
                </p>
              </div>
              <button className="primary" onClick={() => setModal(true)}>
                ＋ New drawing
              </button>
            </div>
            <section className="start-banner">
              <div>
                <span className="eyebrow">
                  LESS BLANK PAGE. MORE POSSIBILITY.
                </span>
                <h2>Your next diagram starts here.</h2>
                <p>
                  Build a clear picture with shapes, connections, and a little
                  structure.
                </p>
                <button
                  onClick={() => {
                    setTemplate("architecture");
                    setNewName("AI harness architecture");
                    setModal(true);
                  }}
                >
                  Use architecture template <span>↗</span>
                </button>
              </div>
              <div className="banner-diagram">
                <span>Idea</span>
                <i>⟶</i>
                <span className="green">Structure</span>
                <i>⟶</i>
                <span>Clarity</span>
                <small>CONNECT THE DOTS</small>
              </div>
            </section>
            <div className="row between library-toolbar">
              <div className="row">
                <h2>{filter}</h2>
                <span className="count">{visible.length}</span>
              </div>
              <input
                className="search"
                aria-label="Search drawings"
                placeholder="⌕  Search your drawings…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="drawing-grid">
              {visible.map((d) => (
                <button
                  className="drawing-card"
                  key={d.id}
                  onClick={() => open(d)}
                >
                  <div className="thumbnail">
                    {d.elements.length ? (
                      <Diagram elements={d.elements} />
                    ) : (
                      <span className="blank-preview">
                        ＋<small>A fresh perspective</small>
                      </span>
                    )}
                    <span className="open-drawing">Open drawing ↗</span>
                  </div>
                  <div className="drawing-info">
                    <div className="row between">
                      <strong>{d.name || "Untitled drawing"}</strong>
                      <span>↗</span>
                    </div>
                    <div className="row between">
                      <small>{d.category}</small>
                      <small>
                        {new Date(d.updated).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </small>
                    </div>
                  </div>
                </button>
              ))}
              {!search && (
                <button
                  className="new-card"
                  onClick={() => {
                    setTemplate("blank");
                    setNewName("Untitled drawing");
                    setModal(true);
                  }}
                >
                  <span>＋</span>
                  <strong>Start from scratch</strong>
                  <small>An open canvas. Endless possibilities.</small>
                </button>
              )}
            </div>
            {!drawings.length && !search && (
              <p className="empty">
                Your workspace is ready. Create your first drawing or try the
                architecture template above.
              </p>
            )}
            {search && !visible.length && (
              <div className="empty">No drawings found. Try another name.</div>
            )}
            <footer className="library-footer">
              <span>Made for thoughts that don’t fit in a text box.</span>
              <span>YOUR IDEAS. CONNECTED.</span>
            </footer>
          </main>
        </div>
      ) : (
        drawing && (
          <>
            <div className="editor-toolbar">
              <button
                onClick={() => {
                  void flush();
                  setScreen("library");
                }}
              >
                ← All drawings
              </button>
              <div className="row">
                <span className="document-tag">{drawing.category}</span>
                <span className="muted">
                  {drawing.elements.length} elements
                </span>
              </div>
              <div className="row">
                <button
                  onClick={undo}
                  disabled={!history.length}
                  title="Undo (Ctrl+Z)"
                >
                  ↶ Undo
                </button>
                <button
                  onClick={redo}
                  disabled={!future.length}
                  title="Redo (Ctrl+Shift+Z)"
                >
                  ↷ Redo
                </button>
              </div>
            </div>
            <main className="editor-layout">
              <aside className="tools-panel">
                <div className="eyebrow">CREATE</div>
                <div className="tools">
                  {(
                    [
                      "select",
                      "card",
                      "container",
                      "text",
                      "ellipse",
                      "arrow",
                      "pen",
                      "icon",
                    ] as const
                  ).map((t) => (
                    <button
                      aria-pressed={tool === t}
                      key={t}
                      className={tool === t ? "tool active" : "tool"}
                      onClick={() => setTool(t)}
                    >
                      <span>{symbols[t]}</span>
                      <small>
                        {
                          {
                            select: "Select",
                            card: "Card",
                            container: "Container",
                            text: "Text",
                            ellipse: "Ellipse",
                            arrow: "Arrow",
                            pen: "Freehand",
                            icon: "Icon",
                          }[t]
                        }
                      </small>
                    </button>
                  ))}
                </div>
                <div className="panel-section">
                  <span className="eyebrow">QUICK GUIDE</span>
                  <p>Choose a tool, then click the canvas to add it.</p>
                  <p>
                    Drag arrows and freehand strokes. Select any element to move
                    or style it.
                  </p>
                </div>
                <div className="tool-bottom">
                  <span>⌘</span>
                  <p>
                    <kbd>V</kbd> Select <kbd>R</kbd> Card
                    <br />
                    <kbd>T</kbd> Text <kbd>A</kbd> Arrow
                  </p>
                </div>
              </aside>
              <section className={"canvas-workspace" + (grid ? " dotted" : "")}>
                <div className="canvas-label">
                  PAGE 01 <span>/</span> {drawing.name}
                </div>
                <div className="canvas-scroll">
                  <div
                    className="paper"
                    style={{
                      width: (1400 * zoom) / 100,
                      height: (900 * zoom) / 100,
                    }}
                  >
                    <Diagram
                      svgRef={svg}
                      elements={drawing.elements}
                      selected={selected}
                      onPointerDown={down}
                      onPointerMove={move}
                      onPointerUp={up}
                    />
                  </div>
                </div>
                <div className="canvas-bottom">
                  <span>
                    {tool === "select"
                      ? "Select an element to start editing"
                      : `Click the canvas to add ${tool === "pen" ? "a freehand stroke" : `a ${tool}`}`}
                  </span>
                  <div className="zoom-control">
                    <button
                      aria-label="Zoom out"
                      onClick={() => setZoom((z) => Math.max(25, z - 10))}
                    >
                      −
                    </button>
                    <button
                      onClick={() =>
                        setZoom(
                          Math.max(
                            25,
                            Math.min(
                              85,
                              Math.floor((window.innerWidth - 510) / 14),
                            ),
                          ),
                        )
                      }
                      title="Fit page"
                    >
                      {zoom}%
                    </button>
                    <button
                      aria-label="Zoom in"
                      onClick={() => setZoom((z) => Math.min(150, z + 10))}
                    >
                      ＋
                    </button>
                  </div>
                </div>
              </section>
              <aside className="properties">
                <div className="row between">
                  <h3>{element ? "Element" : "Canvas"}</h3>
                  <span className="muted">☷</span>
                </div>
                {element ? (
                  <>
                    <div className="selected-type">
                      {symbols[element.kind]} <strong>{element.kind}</strong>
                      <span className="status-dot" />
                    </div>
                    <label>
                      Label
                      <textarea
                        value={element.text}
                        onChange={(e) => update({ text: e.target.value })}
                      />
                    </label>
                    {element.kind === "card" && (
                      <label>
                        Description
                        <textarea
                          value={element.detail}
                          onChange={(e) => update({ detail: e.target.value })}
                        />
                      </label>
                    )}
                    <div className="property-grid">
                      {(["x", "y", "w", "h"] as const).map((k) => (
                        <label key={k}>
                          {
                            {
                              x: "X position",
                              y: "Y position",
                              w: "Width",
                              h: "Height",
                            }[k]
                          }
                          <input
                            type="number"
                            value={Math.round(element[k])}
                            onChange={(e) =>
                              update({
                                [k]:
                                  ["w", "h"].includes(k) &&
                                  element.kind !== "arrow"
                                    ? Math.max(20, Number(e.target.value))
                                    : Number(e.target.value),
                              })
                            }
                          />
                        </label>
                      ))}
                    </div>
                    <div className="panel-section">
                      <span className="eyebrow">APPEARANCE</span>
                      <label className="color-row">
                        Fill
                        <input
                          aria-label="Fill color"
                          type="color"
                          value={element.fill}
                          onChange={(e) => update({ fill: e.target.value })}
                        />
                      </label>
                      <label className="color-row">
                        Stroke
                        <input
                          aria-label="Stroke color"
                          type="color"
                          value={element.stroke}
                          onChange={(e) => update({ stroke: e.target.value })}
                        />
                      </label>
                      <label>
                        Text size
                        <input
                          type="number"
                          min="8"
                          max="80"
                          value={element.fontSize}
                          onChange={(e) =>
                            update({
                              fontSize: Math.max(
                                8,
                                Math.min(80, Number(e.target.value)),
                              ),
                            })
                          }
                        />
                      </label>
                    </div>
                    <button
                      className="secondary wide"
                      onClick={() => {
                        const copy = {
                          ...element,
                          id: crypto.randomUUID(),
                          x: element.x + 24,
                          y: element.y + 24,
                        };
                        replace([...drawing.elements, copy]);
                        setSelected(copy.id);
                      }}
                    >
                      Duplicate element
                    </button>
                    <button
                      className="secondary wide"
                      onClick={() =>
                        replace([
                          element,
                          ...drawing.elements.filter(
                            (e) => e.id !== element.id,
                          ),
                        ])
                      }
                    >
                      Send to back
                    </button>
                    <button className="delete wide" onClick={remove}>
                      Delete element
                    </button>
                  </>
                ) : (
                  <>
                    <label>
                      Page size
                      <div className="static-input">Landscape · 1400 × 900</div>
                    </label>
                    <label className="color-row">
                      Show dot grid
                      <input
                        type="checkbox"
                        checked={grid}
                        onChange={(e) => setGrid(e.target.checked)}
                      />
                    </label>
                    <div className="panel-section">
                      <span className="eyebrow">DOCUMENT PALETTE</span>
                      <div className="palette">
                        {[
                          "#203c33",
                          "#7392b8",
                          "#c9bcf1",
                          "#e6c87c",
                          "#e9f0ed",
                        ].map((c) => (
                          <span key={c} style={{ background: c }} />
                        ))}
                      </div>
                    </div>
                    <div className="inspector-note">
                      <span>↖</span>
                      <h3>A little more detail.</h3>
                      <p>
                        Select an element to edit its text, color, size, and
                        position.
                      </p>
                    </div>
                  </>
                )}
                <div className="layers">
                  <span className="eyebrow">
                    LAYERS <span>{drawing.elements.length}</span>
                  </span>
                  <div className="layer-list">
                    {[...drawing.elements].reverse().map((e) => (
                      <button
                        key={e.id}
                        className={e.id === selected ? "active" : ""}
                        onClick={() => setSelected(e.id)}
                      >
                        <span>{symbols[e.kind]}</span>
                        {e.text || e.kind}
                      </button>
                    ))}
                  </div>
                </div>
              </aside>
            </main>
            <footer className="editor-footer">
              <span>
                <i className="status-dot" /> Personal workspace · Autosave on
              </span>
              <span>
                Built for the big picture <span className="brand-dot">✳</span>
              </span>
            </footer>
          </>
        )
      )}
      {dialog}
    </div>
  );
}
