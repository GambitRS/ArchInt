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
  boundsForElements,
  eraseAtPoint,
  elementBounds,
  intersects,
  isResizeHandle,
  rotateElement,
  resizeElement,
  snapTranslation,
  translateElement,
  type Bounds,
  type ResizeHandle,
  type SnapGuide,
} from "./editor/geometry";
import {
  makeExample,
  type Drawing,
  type Element,
  type Kind,
} from "./diagram";
type Tool = Kind | "select" | "eraser";
type Alignment =
  | "left"
  | "center-x"
  | "right"
  | "top"
  | "center-y"
  | "bottom";
type Distribution = "horizontal" | "vertical";

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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tool, setTool] = useState<Tool>("select");
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
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  const [selectionBox, setSelectionBox] = useState<Bounds | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{
    id: string;
    x: number;
    y: number;
    original: Element[];
    ids?: string[];
    bounds?: Bounds | null;
  } | null>(null);
  const resize = useRef<{
    id: string;
    handle: ResizeHandle;
    x: number;
    y: number;
    original: Element[];
    preserveAspect: boolean;
  } | null>(null);
  const rotate = useRef<{
    id: string;
    centerX: number;
    centerY: number;
    startAngle: number;
    original: Element[];
  } | null>(null);
  const marquee = useRef<{
    x: number;
    y: number;
    additive: boolean;
    originalIds: string[];
  } | null>(null);
  const eraser = useRef<{ original: Element[] } | null>(null);
  const editBaseline = useRef<{ drawingId: string; elements: Element[] } | null>(
    null,
  );
  const copyBuffer = useRef<Element[]>([]);
  const spacePressed = useRef(false);
  const pan = useRef<{
    x: number;
    y: number;
    scrollLeft: number;
    scrollTop: number;
    scroll: HTMLElement;
  } | null>(null);
  const pending = useRef(new Map<string, Drawing>());
  const revisions = useRef(new Map<string, number>());
  const saving = useRef<Promise<boolean> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const createRequest = useRef<Promise<void> | null>(null);
  const createIdempotencyKey = useRef<string | null>(null);
  const drawing = drawings.find((d) => d.id === current);
  const element =
    selectedIds.length === 1
      ? drawing?.elements.find((e) => e.id === selectedIds[0])
      : undefined;
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
      if (
        pending.current.size ||
        drag.current ||
        resize.current ||
        rotate.current ||
        marquee.current ||
        eraser.current
      ) {
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
  function groupMembers(elements: Element[], id: string): string[] {
    const element = elements.find((candidate) => candidate.id === id);
    return element?.groupId
      ? elements
          .filter((candidate) => candidate.groupId === element.groupId)
          .map((candidate) => candidate.id)
      : [id];
  }
  function moveIdsForSelection(elements: Element[], ids: string[]): string[] {
    const result = new Set(ids);
    let changed = true;
    while (changed) {
      changed = false;
      for (const candidate of elements) {
        const groupSelected =
          candidate.groupId &&
          [...result].some(
            (id) => elements.find((element) => element.id === id)?.groupId === candidate.groupId,
          );
        const parentSelected = candidate.parentId && result.has(candidate.parentId);
        if ((groupSelected || parentSelected) && !result.has(candidate.id)) {
          result.add(candidate.id);
          changed = true;
        }
      }
    }
    return [...result];
  }
  function selectionUnits(elements: Element[], ids: string[]): string[][] {
    const selectedSet = new Set(ids);
    const assigned = new Set<string>();
    const units: string[][] = [];
    for (const id of ids) {
      if (assigned.has(id)) continue;
      const candidate = elements.find((element) => element.id === id);
      if (!candidate) continue;
      let parent = candidate.parentId;
      let hasSelectedParent = false;
      const visited = new Set<string>();
      while (parent && !visited.has(parent)) {
        if (selectedSet.has(parent)) {
          hasSelectedParent = true;
          break;
        }
        visited.add(parent);
        parent = elements.find((element) => element.id === parent)?.parentId;
      }
      if (hasSelectedParent) continue;
      const unit = moveIdsForSelection(elements, [id]);
      units.push(unit);
      unit.forEach((unitId) => assigned.add(unitId));
    }
    return units;
  }
  function hasLockedAncestor(elements: Element[], id: string): boolean {
    let candidate = elements.find((element) => element.id === id);
    const visited = new Set<string>();
    while (candidate && !visited.has(candidate.id)) {
      if (candidate.locked) return true;
      visited.add(candidate.id);
      candidate = candidate.parentId
        ? elements.find((element) => element.id === candidate!.parentId)
        : undefined;
    }
    return false;
  }
  function canMove(elements: Element[], ids: string[]): boolean {
    return ids.every((id) => !hasLockedAncestor(elements, id));
  }
  function selectTarget(id: string | null, additive = false) {
    if (!id || !drawing) {
      if (!additive) setSelectedIds([]);
      return;
    }
    const targetIds = groupMembers(drawing.elements, id);
    setSelectedIds((currentIds) => {
      if (!additive) return targetIds;
      const next = new Set(currentIds);
      for (const targetId of targetIds) {
        if (next.has(targetId)) next.delete(targetId);
        else next.add(targetId);
      }
      return [...next];
    });
  }
  function beginTextEdit(id: string) {
    selectTarget(id, false);
    requestAnimationFrame(() => {
      document.querySelector<HTMLTextAreaElement>("[data-primary-label]")?.focus();
    });
  }
  function replace(elements: Element[], remember = true) {
    if (!drawing) return;
    if (remember) {
      setHistory((h) => [...h.slice(-49), structuredClone(drawing.elements)]);
      setFuture([]);
    }
    commit({ ...drawing, elements, updated: new Date().toISOString() });
  }
  function update(patch: Partial<Element>, remember = true) {
    if (!drawing || selectedIds.length !== 1 || !element) return;
    if (hasLockedAncestor(drawing.elements, element.id)) return;
    if (!remember && !editBaseline.current) {
      editBaseline.current = {
        drawingId: drawing.id,
        elements: structuredClone(drawing.elements),
      };
    }
    replace(
      drawing.elements.map((candidate) =>
        candidate.id === element.id ? { ...candidate, ...patch } : candidate,
      ),
      remember,
    );
  }
  function finishTextEdit() {
    const baseline = editBaseline.current;
    if (!baseline || baseline.drawingId !== current) return;
    setHistory((historyState) => [...historyState.slice(-49), baseline.elements]);
    setFuture([]);
    editBaseline.current = null;
  }
  const undo = () => {
    if (!drawing) return;
    const pendingText =
      editBaseline.current?.drawingId === drawing.id ? editBaseline.current : null;
    if (pendingText) {
      setFuture((f) => [...f, drawing.elements]);
      replace(pendingText.elements, false);
      editBaseline.current = null;
      setSelectedIds([]);
      return;
    }
    if (!history.length) return;
    setFuture((f) => [...f, drawing.elements]);
    replace(history[history.length - 1], false);
    setHistory((h) => h.slice(0, -1));
    setSelectedIds([]);
  };
  const redo = () => {
    if (!drawing || !future.length) return;
    finishTextEdit();
    setHistory((h) => [...h, drawing.elements]);
    replace(future[future.length - 1], false);
    setFuture((f) => f.slice(0, -1));
  };
  const remove = () => {
    if (!drawing || !selectedIds.length) return;
    const ids = moveIdsForSelection(drawing.elements, selectedIds);
    if (!canMove(drawing.elements, ids)) return;
    replace(drawing.elements.filter((candidate) => !ids.includes(candidate.id)));
    setSelectedIds([]);
  };
  function groupSelection() {
    if (!drawing || selectedIds.length < 2) return;
    const ids = new Set(selectedIds);
    const groupId = `group-${crypto.randomUUID()}`;
    replace(
      drawing.elements.map((candidate) =>
        ids.has(candidate.id) ? { ...candidate, groupId } : candidate,
      ),
    );
  }
  function ungroupSelection() {
    if (!drawing || !selectedIds.length) return;
    const groupIds = new Set(
      selectedIds
        .map((id) => drawing.elements.find((candidate) => candidate.id === id)?.groupId)
        .filter((id): id is string => Boolean(id)),
    );
    if (!groupIds.size) return;
    replace(
      drawing.elements.map((candidate) =>
        candidate.groupId && groupIds.has(candidate.groupId)
          ? { ...candidate, groupId: undefined }
          : candidate,
      ),
    );
  }
  function toggleLock() {
    if (!drawing || !selectedIds.length) return;
    const ids = new Set(moveIdsForSelection(drawing.elements, selectedIds));
    const shouldLock = [...ids].some(
      (id) => !drawing.elements.find((candidate) => candidate.id === id)?.locked,
    );
    replace(
      drawing.elements.map((candidate) =>
        ids.has(candidate.id) ? { ...candidate, locked: shouldLock } : candidate,
      ),
    );
  }
  function toggleVisibility() {
    if (!drawing || !selectedIds.length) return;
    const ids = new Set(moveIdsForSelection(drawing.elements, selectedIds));
    const shouldHide = [...ids].some(
      (id) => !drawing.elements.find((candidate) => candidate.id === id)?.hidden,
    );
    replace(
      drawing.elements.map((candidate) =>
        ids.has(candidate.id) ? { ...candidate, hidden: shouldHide } : candidate,
      ),
    );
  }
  function toggleLockFor(id: string) {
    if (!drawing) return;
    const target = drawing.elements.find((candidate) => candidate.id === id);
    if (!target) return;
    const ids = new Set(moveIdsForSelection(drawing.elements, [id]));
    replace(
      drawing.elements.map((candidate) =>
        ids.has(candidate.id) ? { ...candidate, locked: !target.locked } : candidate,
      ),
    );
  }
  function toggleVisibilityFor(id: string) {
    if (!drawing) return;
    const target = drawing.elements.find((candidate) => candidate.id === id);
    if (!target) return;
    const ids = new Set(moveIdsForSelection(drawing.elements, [id]));
    replace(
      drawing.elements.map((candidate) =>
        ids.has(candidate.id) ? { ...candidate, hidden: !target.hidden } : candidate,
      ),
    );
  }
  function copySelection() {
    if (!drawing || !selectedIds.length) return;
    const ids = moveIdsForSelection(drawing.elements, selectedIds);
    copyBuffer.current = structuredClone(
      drawing.elements.filter((candidate) => ids.includes(candidate.id)),
    );
  }
  function pasteSelection() {
    if (!drawing || !copyBuffer.current.length) return;
    const source = copyBuffer.current;
    const idMap = new Map(source.map((candidate) => [candidate.id, crypto.randomUUID()]));
    const groupMap = new Map(
      [...new Set(source.map((candidate) => candidate.groupId).filter(Boolean))].map(
        (groupId) => [groupId, `group-${crypto.randomUUID()}`],
      ),
    );
    const pasted = source.map((candidate) => ({
      ...structuredClone(candidate),
      id: idMap.get(candidate.id)!,
      x: candidate.x + 24,
      y: candidate.y + 24,
      groupId: candidate.groupId ? groupMap.get(candidate.groupId) : undefined,
      parentId: candidate.parentId ? idMap.get(candidate.parentId) : undefined,
      locked: false,
      hidden: false,
    }));
    replace([...drawing.elements, ...pasted]);
    setSelectedIds(pasted.map((candidate) => candidate.id));
  }
  function reorderSelection(direction: "front" | "back" | "forward" | "backward") {
    if (!drawing || !selectedIds.length) return;
    const ids = new Set(moveIdsForSelection(drawing.elements, selectedIds));
    let next = [...drawing.elements];
    if (direction === "front") {
      next = [...next.filter((candidate) => !ids.has(candidate.id)), ...next.filter((candidate) => ids.has(candidate.id))];
    } else if (direction === "back") {
      next = [...next.filter((candidate) => ids.has(candidate.id)), ...next.filter((candidate) => !ids.has(candidate.id))];
    } else if (direction === "forward") {
      for (let i = next.length - 2; i >= 0; i--) {
        if (ids.has(next[i].id) && !ids.has(next[i + 1].id)) {
          [next[i], next[i + 1]] = [next[i + 1], next[i]];
        }
      }
    } else {
      for (let i = 1; i < next.length; i++) {
        if (ids.has(next[i].id) && !ids.has(next[i - 1].id)) {
          [next[i], next[i - 1]] = [next[i - 1], next[i]];
        }
      }
    }
    replace(next);
  }
  function alignSelection(alignment: Alignment) {
    if (!drawing || selectedIds.length < 2) return;
    const units = selectionUnits(drawing.elements, selectedIds);
    const ids = units.flat();
    if (!canMove(drawing.elements, ids)) return;
    const target = boundsForElements(drawing.elements, ids);
    if (!target) return;
    replace(
      drawing.elements.map((candidate) => {
        const unit = units.find((unitIds) => unitIds.includes(candidate.id));
        if (!unit) return candidate;
        const bounds = boundsForElements(drawing.elements, unit);
        if (!bounds) return candidate;
        const delta =
          alignment === "left"
            ? target.x - bounds.x
            : alignment === "center-x"
              ? target.x + target.w / 2 - (bounds.x + bounds.w / 2)
              : alignment === "right"
                ? target.x + target.w - (bounds.x + bounds.w)
                : alignment === "top"
                  ? target.y - bounds.y
                  : alignment === "center-y"
                    ? target.y + target.h / 2 - (bounds.y + bounds.h / 2)
                    : target.y + target.h - (bounds.y + bounds.h);
        const vertical = alignment === "top" || alignment === "center-y" || alignment === "bottom";
        return {
          ...candidate,
          x: candidate.x + (vertical ? 0 : delta),
          y: candidate.y + (vertical ? delta : 0),
        };
      }),
    );
  }
  function distributeSelection(distribution: Distribution) {
    if (!drawing || selectedIds.length < 3) return;
    const units = selectionUnits(drawing.elements, selectedIds);
    const ids = units.flat();
    if (!canMove(drawing.elements, ids)) return;
    const sorted = units
      .map((unitIds) => ({ unitIds, bounds: boundsForElements(drawing.elements, unitIds) }))
      .filter((unit): unit is { unitIds: string[]; bounds: Bounds } => Boolean(unit.bounds))
      .sort((a, b) =>
        distribution === "horizontal"
          ? a.bounds.x - b.bounds.x
          : a.bounds.y - b.bounds.y,
      );
    const first = sorted[0]?.bounds;
    const last = sorted[sorted.length - 1]?.bounds;
    if (!first || !last) return;
    const start = distribution === "horizontal" ? first.x : first.y;
    const end = distribution === "horizontal" ? last.x : last.y;
    const step = (end - start) / (sorted.length - 1);
    const positions = new Map(
      sorted.map(({ unitIds }, index) => [
        unitIds,
        start + step * index,
      ]),
    );
    replace(
      drawing.elements.map((candidate) => {
        const unit = sorted.find(({ unitIds }) => unitIds.includes(candidate.id));
        const position = unit ? positions.get(unit.unitIds) : undefined;
        if (position === undefined) return candidate;
        const bounds = unit?.bounds;
        if (!bounds) return candidate;
        return distribution === "horizontal"
          ? { ...candidate, x: candidate.x + position - bounds.x }
          : { ...candidate, y: candidate.y + position - bounds.y };
      }),
    );
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        screen !== "editor" ||
        modal ||
        reauthOpen ||
        (e.target instanceof HTMLElement &&
          /INPUT|TEXTAREA|SELECT/.test(e.target.tagName))
      )
        return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        e.preventDefault();
        copySelection();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        e.preventDefault();
        pasteSelection();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "g") {
        e.preventDefault();
        e.shiftKey ? ungroupSelection() : groupSelection();
      } else if (e.key === "Delete" && selectedIds.length) {
        remove();
      } else if (
        selectedIds.length &&
        drawing &&
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
      ) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const delta = {
          ArrowLeft: [-step, 0],
          ArrowRight: [step, 0],
          ArrowUp: [0, -step],
          ArrowDown: [0, step],
        }[e.key];
        if (delta) {
          const ids = moveIdsForSelection(drawing.elements, selectedIds);
          if (!canMove(drawing.elements, ids)) return;
          replace(
            drawing.elements.map((n) =>
              ids.includes(n.id)
                ? translateElement(n, delta[0], delta[1])
                : n,
            ),
          );
        }
      } else if (e.key === "Escape") {
        setSelectedIds([]);
        setTool("select");
      } else if (!e.ctrlKey && !e.metaKey) {
        const shortcuts: Record<string, Tool> = {
          v: "select",
          r: "card",
          t: "text",
          o: "ellipse",
          a: "arrow",
          p: "pen",
          e: "eraser",
        };
        if (shortcuts[e.key.toLowerCase()]) setTool(shortcuts[e.key.toLowerCase()]);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  useEffect(() => {
    const keyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && screen === "editor") {
        spacePressed.current = true;
        if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
          e.preventDefault();
        }
      }
    };
    const keyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") spacePressed.current = false;
    };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    return () => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
    };
  }, [screen]);
  function open(d: Drawing) {
    setCurrent(d.id);
    setScreen("editor");
    editBaseline.current = null;
    setSelectedIds([]);
    setGuides([]);
    setSelectionBox(null);
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
    editBaseline.current = null;
    setScreen("library");
    setSelectedIds([]);
    setGuides([]);
    setSelectionBox(null);
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
      editBaseline.current = null;
      setSelectedIds([]);
      setGuides([]);
      setSelectionBox(null);
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
      setSelectedIds([]);
      editBaseline.current = null;
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
  function pointerBounds(
    start: { x: number; y: number },
    end: { x: number; y: number },
  ): Bounds {
    return {
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      w: Math.abs(end.x - start.x),
      h: Math.abs(end.y - start.y),
    };
  }
  function down(e: PointerEvent<SVGSVGElement>) {
    if (e.button !== 0 || !drawing) return;
    if (spacePressed.current) {
      const scroll = e.currentTarget.closest<HTMLElement>(".canvas-scroll");
      if (scroll) {
        pan.current = {
          x: e.clientX,
          y: e.clientY,
          scrollLeft: scroll.scrollLeft,
          scrollTop: scroll.scrollTop,
          scroll,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      return;
    }
    const p = point(e);
    const svgTarget = e.target as SVGElement;
    const handleValue = (e.target as SVGElement)
      .closest("[data-resize-handle]")
      ?.getAttribute("data-resize-handle");
    const handle = isResizeHandle(handleValue) ? handleValue : null;
    const rotateTarget = svgTarget
      .closest("[data-rotate-handle]")
      ?.getAttribute("data-rotate-handle");
    const target = svgTarget.closest("[data-element]")?.getAttribute("data-element");
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    finishTextEdit();
    setGuides([]);
    setSelectionBox(null);
    if (tool === "eraser") {
      eraser.current = { original: structuredClone(drawing.elements) };
      e.currentTarget.setPointerCapture(e.pointerId);
      const erased = eraseAtPoint(drawing.elements, p.x, p.y);
      if (erased.length !== drawing.elements.length) {
        setDrawings((ds) =>
          ds.map((candidate) =>
            candidate.id === current ? { ...candidate, elements: erased } : candidate,
          ),
        );
      }
      return;
    }
    if (tool === "select") {
      const base = target && drawing.elements.find((n) => n.id === target);
      if (
        rotateTarget &&
        base &&
        !["arrow", "pen"].includes(base.kind) &&
        !hasLockedAncestor(drawing.elements, base.id)
      ) {
        rotate.current = {
          id: base.id,
          centerX: base.x + base.w / 2,
          centerY: base.y + base.h / 2,
          startAngle: Math.atan2(p.y - (base.y + base.h / 2), p.x - (base.x + base.w / 2)),
          original: structuredClone(drawing.elements),
        };
        setSelectedIds([base.id]);
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
      if (
        handle &&
        base &&
        !["arrow", "pen"].includes(base.kind) &&
        !hasLockedAncestor(drawing.elements, base.id)
      ) {
        setSelectedIds([base.id]);
        resize.current = {
          id: base.id,
          handle,
          x: p.x,
          y: p.y,
          original: structuredClone(drawing.elements),
          preserveAspect: e.shiftKey,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
      if (target) {
        const targetIds = groupMembers(drawing.elements, target);
        const wasSelected = selectedIds.includes(target);
        const intendedSelection = additive
          ? (() => {
              const next = new Set(selectedIds);
              for (const id of targetIds) {
                if (next.has(id)) next.delete(id);
                else next.add(id);
              }
              return [...next];
            })()
          : targetIds;
        setSelectedIds(intendedSelection);
        if (additive && wasSelected) return;
        const ids = moveIdsForSelection(drawing.elements, intendedSelection);
        if (!canMove(drawing.elements, ids)) return;
        drag.current = {
          id: target,
          ...p,
          original: structuredClone(drawing.elements),
          ids,
          bounds: boundsForElements(drawing.elements, ids),
        };
        e.currentTarget.setPointerCapture(e.pointerId);
      } else {
        if (!additive) setSelectedIds([]);
        marquee.current = {
          x: p.x,
          y: p.y,
          additive,
          originalIds: selectedIds,
        };
        setSelectionBox({ x: p.x, y: p.y, w: 0, h: 0 });
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
      rotation: 0,
      strokeWidth: tool === "pen" ? 3 : tool === "arrow" ? 2.5 : 1.5,
      fontWeight: tool === "text" ? 400 : 600,
      lineHeight: 1.35,
      textAlign: "left",
      wrap: true,
      overflow: tool === "text" ? "visible" : "hidden",
      points: tool === "pen" ? [[0, 0]] : undefined,
      parentId:
        tool === "card" || tool === "text" || tool === "ellipse" || tool === "icon"
          ? [...drawing.elements]
              .reverse()
              .find(
                (candidate) =>
                  candidate.kind === "container" &&
                  !candidate.hidden &&
                  p.x >= candidate.x &&
                  p.x <= candidate.x + candidate.w &&
                  p.y >= candidate.y &&
                  p.y <= candidate.y + candidate.h,
              )?.id
          : undefined,
    };
    replace([...drawing.elements, n]);
    setSelectedIds([n.id]);
    if (tool === "pen" || tool === "arrow") {
      drag.current = {
        id: n.id,
        ...p,
        original: [...drawing.elements, n],
        ids: [n.id],
        bounds: boundsForElements([...drawing.elements, n], [n.id]),
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    } else setTool("select");
  }
  function move(e: PointerEvent<SVGSVGElement>) {
    if (!drawing) return;
    if (pan.current) {
      pan.current.scroll.scrollLeft = pan.current.scrollLeft - (e.clientX - pan.current.x);
      pan.current.scroll.scrollTop = pan.current.scrollTop - (e.clientY - pan.current.y);
      return;
    }
    const p = point(e);
    if (eraser.current) {
      const erased = eraseAtPoint(drawing.elements, p.x, p.y);
      setDrawings((ds) =>
        ds.map((candidate) =>
          candidate.id === current ? { ...candidate, elements: erased } : candidate,
        ),
      );
      return;
    }
    if (marquee.current) {
      setSelectionBox(pointerBounds(marquee.current, p));
      return;
    }
    if (rotate.current) {
      const r = rotate.current;
      const base = r.original.find((n) => n.id === r.id);
      if (!base) return;
      let degrees =
        ((Math.atan2(p.y - r.centerY, p.x - r.centerX) - r.startAngle) * 180) /
        Math.PI;
      if (e.shiftKey) {
        degrees = Math.round(degrees / 15) * 15;
      }
      const elements = drawing.elements.map((n) =>
        n.id === r.id ? rotateElement(base, degrees) : n,
      );
      setDrawings((ds) =>
        ds.map((candidate) =>
          candidate.id === current ? { ...candidate, elements } : candidate,
        ),
      );
      return;
    }
    if (resize.current) {
      const r = resize.current;
      const base = r.original.find((n) => n.id === r.id);
      if (!base) return;
      const elements = drawing.elements.map((n) =>
        n.id === r.id
          ? resizeElement(
              base,
              r.handle,
              p.x - r.x,
              p.y - r.y,
              24,
              e.shiftKey || r.preserveAspect,
            )
          : n,
      );
      setDrawings((ds) =>
        ds.map((n) => (n.id === current ? { ...n, elements } : n)),
      );
      return;
    }
    if (!drag.current) return;
    const d = drag.current;
    const base = d.original.find((n) => n.id === d.id)!;
    let nextX = p.x - d.x;
    let nextY = p.y - d.y;
    if (tool === "select") {
      const snapped = snapTranslation(d.original, d.ids || [d.id], nextX, nextY);
      nextX = snapped.deltaX;
      nextY = snapped.deltaY;
      setGuides(snapped.guides);
    }
    const originalById = new Map(d.original.map((candidate) => [candidate.id, candidate]));
    const movingIds = d.ids || [d.id];
    const elements = drawing.elements.map((n) => {
      const original = originalById.get(n.id);
      if (!original || !movingIds.includes(n.id)) return n;
      if (tool === "pen") {
        return {
          ...n,
          points: [
            ...(n.points || []),
            [p.x - base.x, p.y - base.y] as [number, number],
          ],
        };
      }
      if (tool === "arrow") return { ...n, w: p.x - base.x, h: p.y - base.y };
      return translateElement(original, nextX, nextY);
    });
    setDrawings((ds) =>
      ds.map((n) => (n.id === current ? { ...n, elements } : n)),
    );
  }
  function up(e?: PointerEvent<SVGSVGElement>) {
    if (pan.current) {
      pan.current = null;
      return;
    }
    if (eraser.current && drawing) {
      if (eraser.current.original.length !== drawing.elements.length) {
        setHistory((h) => [...h.slice(-49), eraser.current!.original]);
        setFuture([]);
        commit({ ...drawing, updated: new Date().toISOString() });
      }
      eraser.current = null;
      setTool("select");
      return;
    }
    if (marquee.current && drawing) {
      const start = marquee.current;
      const end = e ? point(e) : start;
      const box = pointerBounds(start, end);
      const picked = drawing.elements
        .filter((candidate) => !candidate.hidden && !candidate.locked)
        .filter((candidate) => intersects(elementBounds(candidate), box))
        .flatMap((candidate) => groupMembers(drawing.elements, candidate.id));
      const next = start.additive
        ? [...new Set([...start.originalIds, ...picked])]
        : [...new Set(picked)];
      setSelectedIds(next);
      marquee.current = null;
      setSelectionBox(null);
      return;
    }
    if (rotate.current && drawing) {
      setHistory((h) => [...h.slice(-49), rotate.current!.original]);
      setFuture([]);
      commit({ ...drawing, updated: new Date().toISOString() });
      rotate.current = null;
      setTool("select");
      return;
    }
    if (resize.current && drawing) {
      setHistory((h) => [...h.slice(-49), resize.current!.original]);
      setFuture([]);
      commit({ ...drawing, updated: new Date().toISOString() });
      resize.current = null;
      setTool("select");
      return;
    }
    if (!drag.current || !drawing) return;
    if (tool === "select") {
      setHistory((h) => [...h.slice(-49), drag.current!.original]);
      setFuture([]);
    }
    commit({ ...drawing, updated: new Date().toISOString() });
    drag.current = null;
    setGuides([]);
    setTool("select");
  }
  function fitZoom() {
    return Math.max(
      25,
      Math.min(85, Math.floor((window.innerWidth - 510) / 14)),
    );
  }
  function duplicate() {
    copySelection();
    pasteSelection();
  }
  function sendToBack() {
    reorderSelection("back");
  }
  function bringToFront() {
    reorderSelection("front");
  }
  function moveForward() {
    reorderSelection("forward");
  }
  function moveBackward() {
    reorderSelection("backward");
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
            selectedIds={selectedIds}
            tool={tool}
            grid={grid}
            zoom={zoom}
            status={status}
            guides={guides}
            selectionBox={selectionBox}
            onTextDoubleClick={beginTextEdit}
            canUndo={history.length > 0 || Boolean(editBaseline.current)}
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
            onFinishTextEdit={finishTextEdit}
            onDuplicate={duplicate}
            onCopy={copySelection}
            onPaste={pasteSelection}
            onGroup={groupSelection}
            onUngroup={ungroupSelection}
            onToggleLock={toggleLock}
            onToggleVisibility={toggleVisibility}
            onToggleLockFor={toggleLockFor}
            onToggleVisibilityFor={toggleVisibilityFor}
            onBringToFront={bringToFront}
            onMoveForward={moveForward}
            onMoveBackward={moveBackward}
            onSendToBack={sendToBack}
            onAlign={alignSelection}
            onDistribute={distributeSelection}
            onRemove={remove}
            onSelect={selectTarget}
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
