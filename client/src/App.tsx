import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { LoginPage } from "./auth/LoginPage";
import { ReauthenticationDialog } from "./auth/ReauthenticationDialog";
import { ApiError, api, messageForError } from "./api";
import { Brand } from "./components/Brand";
import { EditorPage } from "./editor/EditorPage";
import { CreateDrawingDialog } from "./library/CreateDrawingDialog";
import { DrawingLibrary } from "./library/DrawingLibrary";
import type { SaveIssue, Screen, Template, User } from "./app/types";
import {
  makeExample,
  type Drawing,
  type Element,
  type Kind,
} from "./diagram";
export default function App() {
  const [screen, setScreen] = useState<Screen>("login");
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(true);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState("");
  const [saveIssue, setSaveIssue] = useState<SaveIssue | null>(null);
  const [reauthOpen, setReauthOpen] = useState(false);
  const [reauthBusy, setReauthBusy] = useState(false);
  const [reauthError, setReauthError] = useState("");
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
  const [template, setTemplate] = useState<Template>("blank");
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
  const createRequest = useRef<Promise<void> | null>(null);
  const createIdempotencyKey = useRef<string | null>(null);
  const drawing = drawings.find((d) => d.id === current);
  const element = drawing?.elements.find((e) => e.id === selected);
  async function loadWorkspace(
    u: User,
    target: Screen = "library",
    isActive: () => boolean = () => true,
  ) {
    const data = await api<Drawing[]>("/drawings");
    if (!isActive()) return;
    const local = target === "editor" ? new Map(pending.current) : new Map();
    const serverIds = new Set(data.map((d) => d.id));
    const merged = [
      ...data.map((d) => local.get(d.id) || d),
      ...[...local.values()].filter((d) => !serverIds.has(d.id)),
    ];
    revisions.current = new Map(data.map((d) => [d.id, d.revision]));
    setDrawings(merged);
    setUser(u);
    setScreen(target);
  }
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const u = await api<User>("/auth/me");
        if (active) await loadWorkspace(u, "library", () => active);
      } catch (e) {
        if (active && !(e instanceof ApiError && e.status === 401)) {
          setError(messageForError(e));
        }
      } finally {
        if (active) {
          setInitializing(false);
          setBusy(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  function saveIssueFor(error: unknown): SaveIssue {
    if (error instanceof ApiError) {
      if (error.kind === "unauthorized")
        return {
          kind: "session",
          message: "Your session ended. Your unsaved draft is still open.",
        };
      if (error.kind === "conflict")
        return {
          kind: "conflict",
          message:
            "This drawing changed elsewhere. Your local draft is still open; export it or reload the saved copy.",
        };
      if (error.kind === "network")
        return { kind: "network", message: error.message };
    }
    return { kind: "error", message: messageForError(error) };
  }
  async function flush(): Promise<boolean> {
    if (saving.current) return saving.current;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (!pending.current.size) {
      setStatus("All changes saved");
      return true;
    }
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
          if (pending.current.get(id) === d) {
            pending.current.delete(id);
            setDrawings((ds) =>
              ds.map((n) =>
                n.id === id
                  ? {
                      ...n,
                      name: saved.name,
                      category: saved.category,
                      elements: saved.elements,
                      updated: saved.updated,
                      revision: saved.revision,
                    }
                  : n,
              ),
            );
          }
        } catch (e) {
          setStatus("Changes not saved");
          setSaveIssue(saveIssueFor(e));
          return false;
        }
      }
      setSaveIssue(null);
      setStatus("All changes saved");
      return true;
    };
    const request = work();
    saving.current = request;
    try {
      return await request;
    } finally {
      if (saving.current === request) saving.current = null;
    }
  }
  function commit(d: Drawing) {
    setDrawings((ds) => ds.map((n) => (n.id === d.id ? d : n)));
    pending.current.set(d.id, d);
    setStatus("Unsaved changes");
    if (saveIssue?.kind === "network" || saveIssue?.kind === "error") {
      setSaveIssue(null);
    }
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
  useEffect(() => {
    const retryPendingSave = () => {
      if (pending.current.size) void flush();
    };
    window.addEventListener("online", retryPendingSave);
    return () => window.removeEventListener("online", retryPendingSave);
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
    setSaveIssue(null);
    setError("");
    setZoom(
      Math.max(25, Math.min(85, Math.floor((window.innerWidth - 510) / 14))),
    );
  }
  function openCreate(
    startingPoint: Template = "blank",
    name = "Untitled drawing",
  ) {
    createIdempotencyKey.current = null;
    setTemplate(startingPoint);
    setNewName(name);
    setError("");
    setModal(true);
  }
  function closeCreate() {
    if (busy) return;
    createIdempotencyKey.current = null;
    setModal(false);
  }
  async function create() {
    if (createRequest.current) return createRequest.current;
    const request = (async () => {
      setBusy(true);
      setError("");
      const idempotencyKey =
        createIdempotencyKey.current || crypto.randomUUID();
      createIdempotencyKey.current = idempotencyKey;
      try {
        const d = await api<Drawing>(
          "/drawings",
          "POST",
          {
            name: newName.trim() || "Untitled drawing",
            category: template === "blank" ? "Diagram" : "Architecture",
            elements: template === "blank" ? [] : makeExample(),
          },
          { "Idempotency-Key": idempotencyKey },
        );
        createIdempotencyKey.current = null;
        revisions.current.set(d.id, d.revision);
        setDrawings((ds) => [d, ...ds]);
        open(d);
        setModal(false);
      } catch (e) {
        setError(messageForError(e));
      } finally {
        setBusy(false);
      }
    })();
    createRequest.current = request;
    try {
      await request;
    } finally {
      if (createRequest.current === request) createRequest.current = null;
    }
  }
  async function goToLibrary() {
    if (screen === "editor" && !(await flush())) return;
    setScreen("library");
    setSelected(null);
    setTool("select");
    setSaveIssue(null);
  }
  async function reloadSavedCopy() {
    if (!drawing) return;
    const id = drawing.id;
    const draftAtStart = pending.current.get(id);
    setBusy(true);
    setError("");
    try {
      const saved = await api<Drawing>(`/drawings/${id}`);
      if (pending.current.get(id) !== draftAtStart) {
        setError("The local draft changed while the saved copy was loading.");
        return;
      }
      pending.current.delete(id);
      if (!pending.current.size && timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      revisions.current.set(id, saved.revision);
      setDrawings((ds) => ds.map((d) => (d.id === id ? saved : d)));
      setHistory([]);
      setFuture([]);
      setSelected(null);
      setSaveIssue(null);
      setStatus("All changes saved");
    } catch (e) {
      if (e instanceof ApiError && e.kind === "unauthorized") {
        setSaveIssue(saveIssueFor(e));
      } else {
        setError(messageForError(e));
      }
    } finally {
      setBusy(false);
    }
  }
  function startReauthentication() {
    setEmail(user?.email || email);
    setReauthError("");
    setReauthOpen(true);
  }
  function closeReauthentication() {
    if (reauthBusy) return;
    setReauthOpen(false);
  }
  async function reauthenticate() {
    if (reauthBusy) return;
    setReauthBusy(true);
    setReauthError("");
    try {
      const u = await api<User>("/auth/login", "POST", { email, password });
      await loadWorkspace(u, "editor");
      setPassword("");
      setReauthOpen(false);
      setSaveIssue(null);
      setError("");
      setStatus(pending.current.size ? "Unsaved changes" : "All changes saved");
      if (pending.current.size) void flush();
    } catch (e) {
      setReauthError(messageForError(e));
    } finally {
      setReauthBusy(false);
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
      setCurrent("");
      setSelected(null);
      setSaveIssue(null);
      setReauthOpen(false);
      pending.current.clear();
      revisions.current.clear();
    } catch (e) {
      setError(messageForError(e));
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
  function fitZoom() {
    return Math.max(
      25,
      Math.min(85, Math.floor((window.innerWidth - 510) / 14)),
    );
  }
  function duplicate() {
    if (!drawing || !element) return;
    const copy = {
      ...element,
      id: crypto.randomUUID(),
      x: element.x + 24,
      y: element.y + 24,
    };
    replace([...drawing.elements, copy]);
    setSelected(copy.id);
  }
  function sendToBack() {
    if (!drawing || !element) return;
    replace([
      element,
      ...drawing.elements.filter((candidate) => candidate.id !== element.id),
    ]);
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
  if (initializing)
    return (
      <main className="session-loading">
        <Brand />
        <p role="status">Restoring your workspace…</p>
      </main>
    );
  if (screen === "login")
    return (
      <LoginPage
        email={email}
        password={password}
        busy={busy}
        error={error}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
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
            setError(messageForError(err));
          } finally {
            setBusy(false);
          }
        }}
      />
    );
  return (
    <div className="app">
      <header className="topbar">
        <Brand />
        <div className="breadcrumb">
          <span>/</span>
          <button
            onClick={() => {
              void goToLibrary();
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
      {(saveIssue || (error && !modal)) && !reauthOpen && (
        <div className="error-bar" role="alert">
          <span>{saveIssue?.message || error}</span>
          {saveIssue?.kind === "session" && (
            <button onClick={startReauthentication}>Sign in again</button>
          )}
          {saveIssue?.kind === "conflict" && (
            <>
              <button onClick={() => download("svg")}>Export draft</button>
              <button disabled={busy} onClick={() => void reloadSavedCopy()}>
                Reload saved copy
              </button>
            </>
          )}
          {saveIssue &&
            (saveIssue.kind === "network" || saveIssue.kind === "error") && (
              <button
                onClick={() => {
                  setSaveIssue(null);
                  void flush();
                }}
              >
                Retry saving
              </button>
            )}
          <button
            aria-label="Dismiss error"
            onClick={() => {
              setError("");
              setSaveIssue(null);
            }}
          >
            ×
          </button>
        </div>
      )}
      {screen === "library" && user ? (
        <DrawingLibrary
          user={user}
          drawings={drawings}
          filter={filter}
          search={search}
          onFilterChange={setFilter}
          onSearchChange={setSearch}
          onOpen={open}
          onCreate={() => openCreate()}
          onUseArchitectureTemplate={() =>
            openCreate("architecture", "AI harness architecture")
          }
        />
      ) : (
        drawing && (
          <EditorPage
            drawing={drawing}
            element={element}
            selected={selected}
            tool={tool}
            grid={grid}
            zoom={zoom}
            status={status}
            canUndo={history.length > 0}
            canRedo={future.length > 0}
            svgRef={svg}
            onBack={() => void goToLibrary()}
            onUndo={undo}
            onRedo={redo}
            onToolChange={setTool}
            onGridChange={setGrid}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onZoomOut={() => setZoom((value) => Math.max(25, value - 10))}
            onFitZoom={() => setZoom(fitZoom())}
            onZoomIn={() => setZoom((value) => Math.min(150, value + 10))}
            onUpdate={update}
            onDuplicate={duplicate}
            onSendToBack={sendToBack}
            onRemove={remove}
            onSelect={setSelected}
          />
        )
      )}
      <CreateDrawingDialog
        open={modal}
        busy={busy}
        error={error}
        name={newName}
        template={template}
        onNameChange={setNewName}
        onTemplateChange={setTemplate}
        onClose={closeCreate}
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      />
      <ReauthenticationDialog
        open={reauthOpen}
        busy={reauthBusy}
        error={reauthError}
        email={email}
        password={password}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onClose={closeReauthentication}
        onSubmit={(e) => {
          e.preventDefault();
          void reauthenticate();
        }}
      />
    </div>
  );
}
