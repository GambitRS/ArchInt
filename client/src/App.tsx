import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, PointerEvent } from "react";
import { LoginPage } from "./auth/LoginPage";
import { ReauthenticationDialog } from "./auth/ReauthenticationDialog";
import { ApiError, api, messageForError } from "./api";
import { Brand } from "./components/Brand";
import { EditorPage } from "./editor/EditorPage";
import { ImportSummaryDialog } from "./editor/ImportSummaryDialog";
import {
  ExportDialog,
  type ExportOptions,
} from "./editor/ExportDialog";
import { documentForDrawing, serializeDocument } from "./editor/document";
import {
  parseArchimateFile,
  serializeArchimateFile,
  type ArchimateFileFormat,
} from "./editor/archimate-file";
import { CreateDrawingDialog } from "./library/CreateDrawingDialog";
import { DrawingLibrary } from "./library/DrawingLibrary";
import { buildPdfFromJpeg } from "./editor/pdf";
import type { SaveIssue, Screen, Template, User } from "./app/types";
import {
  anchorForPoint,
  anchorPoint,
  boundsForElements,
  connectorLabelPoint,
  connectorPoints,
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
import {
  ARCHIMATE_CATALOG,
  applyLegacyElements,
  createView,
  defaultStyle,
  ensureCanonicalDocument,
  flattenDocument,
  isArchimateElementType,
  relationshipAllowed,
  validateDocument,
  type ArchimateDocument,
  type ArchimateElementType,
  type ArchimateRelationshipType,
} from "./model/archimate";
type Tool = Kind | "select" | "eraser";
type Alignment =
  | "left"
  | "center-x"
  | "right"
  | "top"
  | "center-y"
  | "bottom";
type Distribution = "horizontal" | "vertical";
type PendingImport = {
  filename: string;
  document: ArchimateDocument;
  format: ArchimateFileFormat;
  languageVersion?: string;
  warnings: string[];
  errors: string[];
};

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
  const [viewId, setViewId] = useState("");
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
  const [exportOpen, setExportOpen] = useState(false);
  const [importSummary, setImportSummary] = useState<PendingImport | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [recoveryDraft, setRecoveryDraft] = useState<Drawing | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const importIdempotencyKey = useRef<string | null>(null);
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
  const connectorDrag = useRef<{
    id: string;
    handle: "source" | "target" | "waypoint";
    index?: number;
    original: Element[];
  } | null>(null);
  const pending = useRef(new Map<string, Drawing>());
  const revisions = useRef(new Map<string, number>());
  const saving = useRef<Promise<boolean> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recoveryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const createRequest = useRef<Promise<void> | null>(null);
  const createIdempotencyKey = useRef<string | null>(null);
  const drawing = drawings.find((d) => d.id === current);
  const element =
    selectedIds.length === 1
      ? drawing?.elements.find((e) => e.id === selectedIds[0])
      : undefined;
  function canonicalForDrawing(d: Drawing): ArchimateDocument {
    return ensureCanonicalDocument(d.document || d.elements, { name: d.name });
  }

  function drawingWithActiveView(d: Drawing, document = canonicalForDrawing(d), nextViewId?: string): Drawing {
    const active = nextViewId || d.activeViewId || document.activeViewId || document.views[0]?.id;
    if (active && document.views.some((view) => view.id === active)) document.activeViewId = active;
    const activeView = document.views.find((view) => view.id === document.activeViewId) || document.views[0];
    return {
      ...d,
      document,
      activeViewId: activeView.id,
      elements: flattenDocument(document, activeView.id),
      viewSummaries: document.views.map((view) => ({
        id: view.id,
        name: view.name,
        width: view.width,
        height: view.height,
      })),
    };
  }

  async function loadWorkspace(
    u: User,
    target: Screen = "library",
    isActive: () => boolean = () => true,
  ) {
    const data = (await api<Drawing[]>("/drawings")).map((candidate) =>
      drawingWithActiveView(candidate),
    );
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
  function recoveryKey(userId: number, drawingId: string) {
    return `archint:recovery:${userId}:${drawingId}`;
  }
  function writeRecoveryDraft(d: Drawing) {
    if (!user) return;
    try {
      localStorage.setItem(
        recoveryKey(user.id, d.id),
        JSON.stringify({
          version: 1,
          savedAt: new Date().toISOString(),
          drawing: d,
        }),
      );
    } catch {
      // Recovery is best-effort when storage is unavailable or full.
    }
  }
  function clearRecoveryDraft(drawingId: string, userId = user?.id) {
    if (userId === undefined) return;
    try {
      localStorage.removeItem(recoveryKey(userId, drawingId));
    } catch {
      // Ignore storage failures; saving the server copy remains authoritative.
    }
  }
  function readRecoveryDraft(d: Drawing): Drawing | null {
    if (!user) return null;
    try {
      const raw = localStorage.getItem(recoveryKey(user.id, d.id));
      if (!raw) return null;
      const value = JSON.parse(raw) as {
        version?: unknown;
        drawing?: unknown;
      };
      if (value.version !== 1 || !value.drawing || typeof value.drawing !== "object") {
        return null;
      }
      const candidate = value.drawing as Drawing;
      if (
        candidate.id !== d.id ||
        typeof candidate.name !== "string" ||
        typeof candidate.category !== "string" ||
        typeof candidate.updated !== "string" ||
        !Array.isArray(candidate.elements)
      ) {
        return null;
      }
      const document = ensureCanonicalDocument(candidate.document || candidate.elements, { name: candidate.name });
      if (!validateDocument(document).valid) return null;
      return drawingWithActiveView({ ...candidate, document }, document, candidate.activeViewId || document.activeViewId);
    } catch {
      return null;
    }
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
            clearRecoveryDraft(id);
            setDrawings((ds) =>
              ds.map((n) =>
                n.id === id
                      ? {
                      ...n,
                      name: saved.name,
                      category: saved.category,
                      document: saved.document,
                      elements: saved.elements,
                      activeViewId: saved.activeViewId,
                      viewSummaries: saved.viewSummaries,
                      updated: saved.updated,
                      revision: saved.revision,
                    }
                  : n,
              ),
            );
          }
        } catch (e) {
          if (screen === "editor" && user) {
            writeRecoveryDraft(d);
            if (current === id) setRecoveryDraft(d);
          }
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
    let document = canonicalForDrawing(d);
    const active = d.activeViewId || viewId || document.activeViewId;
    if (active && document.views.some((view) => view.id === active)) {
      document.activeViewId = active;
    }
    const before = flattenDocument(document, document.activeViewId);
    if (JSON.stringify(before) !== JSON.stringify(d.elements)) {
      document = applyLegacyElements(document, d.elements, document.activeViewId);
      document.activeViewId = active;
    }
    const next = drawingWithActiveView(
      { ...d, document, activeViewId: document.activeViewId },
      document,
      document.activeViewId,
    );
    setDrawings((ds) => ds.map((n) => (n.id === next.id ? next : n)));
    pending.current.set(next.id, next);
    setStatus("Unsaved changes");
    if (saveIssue?.kind === "network" || saveIssue?.kind === "error") {
      setSaveIssue(null);
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 700);
    if (user && screen === "editor") {
      if (recoveryTimer.current) clearTimeout(recoveryTimer.current);
      recoveryTimer.current = setTimeout(() => {
        const latest = pending.current.get(next.id);
        if (latest) writeRecoveryDraft(latest);
      }, 800);
    }
  }
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => {
      if (
        pending.current.size ||
        drag.current ||
        resize.current ||
        rotate.current ||
        marquee.current ||
        eraser.current ||
        connectorDrag.current
      ) {
        if (drawing && user) writeRecoveryDraft(drawing);
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, [drawing, screen, user]);
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
    const removed = new Set(ids);
    replace(
      drawing.elements.filter(
        (candidate) =>
          !removed.has(candidate.id) &&
          !(
            candidate.kind === "arrow" &&
            (removed.has(candidate.sourceAnchor?.elementId || "") ||
              removed.has(candidate.targetAnchor?.elementId || ""))
          ),
      ),
    );
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
    const modelMap = new Map(
      [
        ...new Set(
          source
            .filter((candidate) => candidate.archimateType && candidate.modelElementId)
            .map((candidate) => candidate.modelElementId!),
        ),
      ].map((modelId) => [modelId, `model-${crypto.randomUUID()}`]),
    );
    const relationshipMap = new Map(
      [
        ...new Set(
          source
            .filter((candidate) => candidate.relationshipType && candidate.relationshipId)
            .map((candidate) => candidate.relationshipId!),
        ),
      ].map((relationshipId) => [relationshipId, `relationship-${crypto.randomUUID()}`]),
    );
    const remapAnchor = (anchor: Element["sourceAnchor"]) => {
      if (!anchor) return undefined;
      const elementId = idMap.get(anchor.elementId);
      return elementId ? { ...anchor, elementId } : undefined;
    };
    const pasted = source.map((candidate) => ({
      ...structuredClone(candidate),
      id: idMap.get(candidate.id)!,
      x: candidate.x + 24,
      y: candidate.y + 24,
      groupId: candidate.groupId ? groupMap.get(candidate.groupId) : undefined,
      parentId: candidate.parentId ? idMap.get(candidate.parentId) : undefined,
      sourceAnchor: remapAnchor(candidate.sourceAnchor),
      targetAnchor: remapAnchor(candidate.targetAnchor),
      modelElementId: candidate.modelElementId
        ? modelMap.get(candidate.modelElementId) || `model-${crypto.randomUUID()}`
        : undefined,
      relationshipId: candidate.relationshipId
        ? relationshipMap.get(candidate.relationshipId) || `relationship-${crypto.randomUUID()}`
        : undefined,
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
        exportOpen ||
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
    const document = canonicalForDrawing(d);
    const active = d.activeViewId || document.activeViewId || document.views[0].id;
    const normalized = drawingWithActiveView({ ...d, document }, document, active);
    setDrawings((ds) => ds.map((candidate) => (candidate.id === d.id ? normalized : candidate)));
    setViewId(active);
    const candidate = readRecoveryDraft(d);
    setRecoveryDraft(
      candidate && Date.parse(candidate.updated) > Date.parse(d.updated)
        ? candidate
        : null,
    );
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
      const saved = drawingWithActiveView(await api<Drawing>(`/drawings/${id}`));
      if (pending.current.get(id) !== draftAtStart) {
        setError("The local draft changed while the saved copy was loading.");
        return;
      }
      pending.current.delete(id);
      clearRecoveryDraft(id);
      if (!pending.current.size && timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      revisions.current.set(id, saved.revision);
      setDrawings((ds) => ds.map((d) => (d.id === id ? saved : d)));
      setViewId(saved.activeViewId || "");
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
      setViewId("");
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
  function anchorElementAtPoint(
    elements: Element[],
    x: number,
    y: number,
    excludeId?: string,
  ): Element | undefined {
    return [...elements]
      .reverse()
      .find((candidate) => {
        if (
          candidate.id === excludeId ||
          candidate.hidden ||
          candidate.kind === "arrow" ||
          candidate.kind === "pen"
        )
          return false;
        const bounds = elementBounds(candidate, elements);
        return (
          x >= bounds.x &&
          x <= bounds.x + bounds.w &&
          y >= bounds.y &&
          y <= bounds.y + bounds.h
        );
      });
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
    const connectorHandleValue = svgTarget
      .closest("[data-connector-handle]")
      ?.getAttribute("data-connector-handle");
    const rawTarget = svgTarget.closest("[data-element]")?.getAttribute("data-element");
    const anchorTarget = svgTarget
      .closest("[data-anchor-element]")
      ?.getAttribute("data-anchor-element");
    const target = anchorTarget || rawTarget;
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    finishTextEdit();
    setGuides([]);
    setSelectionBox(null);
    if (tool === "select" && connectorHandleValue && rawTarget) {
      const connector = drawing.elements.find((candidate) => candidate.id === rawTarget);
      if (
        connector?.kind === "arrow" &&
        !hasLockedAncestor(drawing.elements, connector.id)
      ) {
        const waypointMatch = connectorHandleValue.match(/^waypoint:(\d+)$/);
        connectorDrag.current = {
          id: connector.id,
          handle: waypointMatch
            ? "waypoint"
            : connectorHandleValue === "source"
              ? "source"
              : "target",
          index: waypointMatch ? Number(waypointMatch[1]) : undefined,
          original: structuredClone(drawing.elements),
        };
        setSelectedIds([connector.id]);
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      return;
    }
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
    const sourceElement =
      tool === "arrow"
        ? target
          ? drawing.elements.find(
              (candidate) =>
                candidate.id === target && !["arrow", "pen"].includes(candidate.kind),
            )
          : anchorElementAtPoint(drawing.elements, p.x, p.y)
        : undefined;
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
                ? ""
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
      sourceAnchor: sourceElement ? anchorForPoint(sourceElement, p.x, p.y) : undefined,
      route: tool === "arrow" ? "straight" : undefined,
      waypoints: tool === "arrow" ? [] : undefined,
      arrowhead: tool === "arrow" ? "triangle" : undefined,
      iconName: tool === "icon" ? "model" : undefined,
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
    if (connectorDrag.current) {
      const connectorState = connectorDrag.current;
      const base = connectorState.original.find(
        (candidate) => candidate.id === connectorState.id,
      );
      if (!base) return;
      const hovered = anchorElementAtPoint(
        drawing.elements,
        p.x,
        p.y,
        connectorState.id,
      );
      const elements = drawing.elements.map((candidate) => {
        if (candidate.id !== connectorState.id) return candidate;
        if (connectorState.handle === "waypoint") {
          if (
            connectorState.index === undefined ||
            connectorState.index >= (candidate.waypoints || []).length
          )
            return candidate;
          const waypoints = [...(candidate.waypoints || [])];
          waypoints[connectorState.index] = { x: p.x, y: p.y };
          return { ...candidate, waypoints };
        }
        const source = candidate.sourceAnchor
          ? drawing.elements.find(
              (item) => item.id === candidate.sourceAnchor?.elementId,
            )
          : undefined;
        const target = candidate.targetAnchor
          ? drawing.elements.find(
              (item) => item.id === candidate.targetAnchor?.elementId,
            )
          : undefined;
        const start = source
          ? anchorPoint(source, candidate.sourceAnchor!.side, candidate.sourceAnchor!.offset)
          : { x: candidate.x, y: candidate.y };
        const end = target
          ? anchorPoint(target, candidate.targetAnchor!.side, candidate.targetAnchor!.offset)
          : { x: candidate.x + candidate.w, y: candidate.y + candidate.h };
        if (connectorState.handle === "source") {
          if (hovered) {
            const anchor = anchorForPoint(hovered, p.x, p.y);
            const point = anchorPoint(hovered, anchor.side, anchor.offset);
            return {
              ...candidate,
              sourceAnchor: anchor,
              x: point.x,
              y: point.y,
              w: end.x - point.x,
              h: end.y - point.y,
            };
          }
          return {
            ...candidate,
            sourceAnchor: undefined,
            x: p.x,
            y: p.y,
            w: end.x - p.x,
            h: end.y - p.y,
          };
        }
        if (hovered) {
          const anchor = anchorForPoint(hovered, p.x, p.y);
          const point = anchorPoint(hovered, anchor.side, anchor.offset);
          return {
            ...candidate,
            targetAnchor: anchor,
            x: start.x,
            y: start.y,
            w: point.x - start.x,
            h: point.y - start.y,
          };
        }
        return {
          ...candidate,
          targetAnchor: undefined,
          x: start.x,
          y: start.y,
          w: p.x - start.x,
          h: p.y - start.y,
        };
      });
      setDrawings((ds) =>
        ds.map((candidate) => (candidate.id === current ? { ...candidate, elements } : candidate)),
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
      if (tool === "arrow") {
        const source = base.sourceAnchor
          ? d.original.find((candidate) => candidate.id === base.sourceAnchor?.elementId)
          : undefined;
        const start = source
          ? anchorPoint(source, base.sourceAnchor!.side, base.sourceAnchor!.offset)
          : { x: base.x, y: base.y };
        return {
          ...n,
          x: start.x,
          y: start.y,
          w: p.x - start.x,
          h: p.y - start.y,
          targetAnchor: undefined,
        };
      }
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
        .filter((candidate) => intersects(elementBounds(candidate, drawing.elements), box))
        .flatMap((candidate) => groupMembers(drawing.elements, candidate.id));
      const next = start.additive
        ? [...new Set([...start.originalIds, ...picked])]
        : [...new Set(picked)];
      setSelectedIds(next);
      marquee.current = null;
      setSelectionBox(null);
      return;
    }
    if (connectorDrag.current && drawing) {
      setHistory((h) => [...h.slice(-49), connectorDrag.current!.original]);
      setFuture([]);
      commit({ ...drawing, updated: new Date().toISOString() });
      connectorDrag.current = null;
      setGuides([]);
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
    const activeDrag = drag.current;
    let finalElements = drawing.elements;
    if (tool === "arrow") {
      const connector = finalElements.find((candidate) => candidate.id === activeDrag.id);
      const end = e
        ? point(e)
        : { x: activeDrag.x + (connector?.w || 0), y: activeDrag.y + (connector?.h || 0) };
      const hovered = anchorElementAtPoint(
        finalElements,
        end.x,
        end.y,
        activeDrag.id,
      );
      if (connector) {
        const source = connector.sourceAnchor
          ? finalElements.find(
              (candidate) => candidate.id === connector.sourceAnchor?.elementId,
            )
          : undefined;
        const start = source
          ? anchorPoint(source, connector.sourceAnchor!.side, connector.sourceAnchor!.offset)
          : { x: connector.x, y: connector.y };
        finalElements = finalElements.map((candidate) => {
          if (candidate.id !== connector.id) return candidate;
          if (!hovered) {
            return {
              ...candidate,
              targetAnchor: undefined,
              x: start.x,
              y: start.y,
              w: end.x - start.x,
              h: end.y - start.y,
            };
          }
          const anchor = anchorForPoint(hovered, end.x, end.y);
          const targetPoint = anchorPoint(hovered, anchor.side, anchor.offset);
          return {
            ...candidate,
            targetAnchor: anchor,
            x: start.x,
            y: start.y,
            w: targetPoint.x - start.x,
            h: targetPoint.y - start.y,
          };
        });
      }
    }
    if (tool === "select") {
      setHistory((h) => [...h.slice(-49), activeDrag.original]);
      setFuture([]);
    }
    commit({ ...drawing, elements: finalElements, updated: new Date().toISOString() });
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
  function addWaypoint() {
    if (!drawing || selectedIds.length !== 1 || element?.kind !== "arrow") return;
    const point = connectorLabelPoint(connectorPoints(element, drawing.elements));
    replace(
      drawing.elements.map((candidate) =>
        candidate.id === element.id
          ? { ...candidate, waypoints: [...(candidate.waypoints || []), point] }
          : candidate,
      ),
    );
  }
  function addSemanticElement(type: ArchimateElementType) {
    if (!drawing || !isArchimateElementType(type)) return;
    const definition = ARCHIMATE_CATALOG.elements.find((candidate) => candidate.id === type);
    if (!definition) return;
    const style = defaultStyle(type);
    const index = drawing.elements.filter((candidate) => candidate.archimateType).length;
    const kind: Kind = ["Event", "AndJunction", "OrJunction"].includes(type)
      ? "ellipse"
      : ["Grouping", "Location", "Product", "Plateau"].includes(type)
        ? "container"
        : "card";
    const semantic: Element = {
      id: `occurrence-${crypto.randomUUID()}`,
      kind,
      x: 100 + (index % 4) * 250,
      y: 120 + Math.floor(index / 4) * 130,
      w: kind === "ellipse" ? 150 : 210,
      h: kind === "ellipse" ? 100 : 86,
      text: definition.name,
      detail: "",
      fill: style.fill || "#edf3fc",
      stroke: style.stroke || "#7392b8",
      fontSize: style.fontSize || 16,
      strokeWidth: style.strokeWidth,
      fontWeight: style.fontWeight,
      lineHeight: style.lineHeight,
      textAlign: style.textAlign,
      wrap: style.wrap,
      overflow: style.overflow,
      archimateType: type,
      modelElementId: `model-${crypto.randomUUID()}`,
    };
    replace([...drawing.elements, semantic]);
    setSelectedIds([semantic.id]);
  }
  function placeExistingModel(modelId: string) {
    if (!drawing || !drawing.document) return;
    const model = drawing.document.model.elements[modelId];
    if (!model || !isArchimateElementType(model.type)) return;
    const style = defaultStyle(model.type);
    const index = drawing.elements.length;
    const occurrence: Element = {
      id: `occurrence-${crypto.randomUUID()}`,
      kind: "card",
      x: 120 + (index % 4) * 250,
      y: 120 + Math.floor(index / 4) * 130,
      w: 210,
      h: 86,
      text: model.name,
      detail: model.documentation,
      fill: style.fill || "#edf3fc",
      stroke: style.stroke || "#7392b8",
      fontSize: style.fontSize || 16,
      archimateType: model.type,
      modelElementId: model.id,
    };
    replace([...drawing.elements, occurrence]);
    setSelectedIds([occurrence.id]);
  }
  function assignElementType(type: ArchimateElementType) {
    if (!drawing || !selectedIds.length || !isArchimateElementType(type)) return;
    const selected = new Set(selectedIds);
    const next = drawing.elements.map((candidate) => {
      if (!selected.has(candidate.id) || candidate.kind === "arrow" || candidate.kind === "pen") return candidate;
      const style = defaultStyle(type);
      return {
        ...candidate,
        kind: candidate.kind === "icon" ? "card" : candidate.kind,
        archimateType: type,
        modelElementId: candidate.modelElementId || `model-${crypto.randomUUID()}`,
        fill: candidate.fill || style.fill || "#edf3fc",
        stroke: candidate.stroke || style.stroke || "#7392b8",
      };
    });
    replace(next);
  }
  function assignRelationshipType(type: ArchimateRelationshipType) {
    if (!drawing || !selectedIds.length) return;
    const selected = new Set(selectedIds);
    const candidate = drawing.elements.find((item) => selected.has(item.id) && item.kind === "arrow");
    if (!candidate) return;
    const source = drawing.elements.find((item) => item.id === candidate.sourceAnchor?.elementId);
    const target = drawing.elements.find((item) => item.id === candidate.targetAnchor?.elementId);
    if (!source?.archimateType || !target?.archimateType || !relationshipAllowed(source.archimateType, type, target.archimateType)) {
      setError("That relationship is not valid for the selected endpoints. Type both endpoint elements first.");
      return;
    }
    replace(
      drawing.elements.map((item) =>
        item.id === candidate.id
          ? {
              ...item,
              relationshipType: type,
              relationshipId: item.relationshipId || `relationship-${crypto.randomUUID()}`,
            }
          : item,
      ),
    );
    setError("");
  }
  function selectView(nextViewId: string) {
    if (!drawing || !drawing.document || !drawing.document.views.some((view) => view.id === nextViewId)) return;
    finishTextEdit();
    const document = structuredClone(drawing.document);
    document.activeViewId = nextViewId;
    setViewId(nextViewId);
    const next = drawingWithActiveView({ ...drawing, document, activeViewId: nextViewId }, document, nextViewId);
    commit(next);
    setSelectedIds([]);
    setHistory([]);
    setFuture([]);
  }
  function createViewCommand() {
    if (!drawing || !drawing.document) return;
    const name = window.prompt("Name this view", `View ${drawing.document.views.length + 1}`)?.trim();
    if (!name) return;
    const document = structuredClone(drawing.document);
    const view = createView(name, {
      width: document.page.width,
      height: document.page.height,
      background: document.page.background,
    });
    document.views.push(view);
    document.activeViewId = view.id;
    setViewId(view.id);
    commit(drawingWithActiveView({ ...drawing, document, activeViewId: view.id }, document, view.id));
    setSelectedIds([]);
    setHistory([]);
    setFuture([]);
  }
  function renameViewCommand() {
    if (!drawing?.document) return;
    const view = drawing.document.views.find((candidate) => candidate.id === (drawing.activeViewId || viewId));
    if (!view) return;
    const name = window.prompt("Rename view", view.name)?.trim();
    if (!name || name === view.name) return;
    const document = structuredClone(drawing.document);
    const target = document.views.find((candidate) => candidate.id === view.id);
    if (target) target.name = name.slice(0, 100);
    commit({ ...drawing, document, activeViewId: view.id, elements: flattenDocument(document, view.id) });
  }
  function removeViewCommand() {
    if (!drawing?.document || drawing.document.views.length <= 1) return;
    const active = drawing.activeViewId || viewId || drawing.document.activeViewId;
    const target = drawing.document.views.find((candidate) => candidate.id === active);
    if (!target || !window.confirm(`Remove the “${target.name}” view? Model elements will remain available.`)) return;
    const document = structuredClone(drawing.document);
    document.views = document.views.filter((candidate) => candidate.id !== target.id);
    const next = document.views[0];
    document.activeViewId = next.id;
    setViewId(next.id);
    commit(drawingWithActiveView({ ...drawing, document, activeViewId: next.id }, document, next.id));
    setSelectedIds([]);
    setHistory([]);
    setFuture([]);
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
  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function blobFromDataUrl(dataUrl: string, type: string): Blob {
    const comma = dataUrl.indexOf(",");
    if (comma < 0) throw new Error("The raster export is missing image data.");
    const binary = atob(dataUrl.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new Blob([bytes], { type });
  }
  async function exportDrawing(options: ExportOptions) {
    if (!drawing) return;
    const baseName = drawing.name.replace(/[^a-z0-9 _-]/gi, "").trim() || "drawing";
    if (options.format === "json") {
      downloadBlob(
        new Blob([serializeDocument(drawing)], { type: "application/json" }),
        `${baseName}.json`,
      );
      setExportOpen(false);
      return;
    }
    if (options.format === "archimate" || options.format === "exchange") {
      const document = documentForDrawing(drawing);
      const exported = serializeArchimateFile(document, {
        format: options.format === "archimate" ? "native" : "open-group-exchange",
        category: drawing.category,
        languageVersion: "3.2",
      });
      if (exported.errors.length) {
        setError(`File export rejected: ${exported.errors.join("; ")}`);
        return;
      }
      if (exported.warnings.length && !window.confirm(`This is an interoperability snapshot.\n\n${exported.warnings.join("\n\n")}\n\nContinue with the download?`)) return;
      downloadBlob(
        new Blob([exported.content], { type: options.format === "archimate" ? "application/vnd.archint.archimate+json" : "application/xml;charset=utf-8" }),
        `${baseName}${exported.extension}`,
      );
      setExportOpen(false);
      return;
    }
    if (!svg.current) return;

    const activeView = drawing.document?.views.find((view) => view.id === (drawing.activeViewId || drawing.document?.activeViewId)) || drawing.document?.views[0];
    const page = { x: 0, y: 0, w: activeView?.width || 1400, h: activeView?.height || 900 };
    const selectedBounds =
      options.bounds === "selection"
        ? boundsForElements(drawing.elements, selectedIds)
        : null;
    const raw = selectedBounds || page;
    const margin = selectedBounds ? 24 : 0;
    const x = Math.max(page.x, raw.x - margin);
    const y = Math.max(page.y, raw.y - margin);
    const right = Math.min(page.x + page.w, raw.x + raw.w + margin);
    const bottom = Math.min(page.y + page.h, raw.y + raw.h + margin);
    const crop = {
      x,
      y,
      w: Math.max(1, right - x),
      h: Math.max(1, bottom - y),
    };
    const pixelWidth = Math.max(1, Math.round(crop.w * options.scale));
    const pixelHeight = Math.max(1, Math.round(crop.h * options.scale));
    if (pixelWidth * pixelHeight > 32_000_000) {
      setError("This export is too large. Choose a smaller scale or selection.");
      return;
    }

    const clone = svg.current.cloneNode(true) as SVGSVGElement;
    clone
      .querySelectorAll(
        "[data-selection],[data-anchor-handle],[data-connector-handle],[data-rotate-handle],[data-resize-handle]",
      )
      .forEach((node) => node.remove());
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("viewBox", `${crop.x} ${crop.y} ${crop.w} ${crop.h}`);
    clone.setAttribute("width", String(pixelWidth));
    clone.setAttribute("height", String(pixelHeight));
    const whiteBackground =
      options.format === "pdf" || options.background === "white";
    const background = clone.querySelector("[data-page-background]");
    if (background instanceof SVGElement) {
      if (whiteBackground) background.setAttribute("fill", "#ffffff");
      else background.remove();
    }
    clone.style.cssText = `background:${whiteBackground ? "white" : "transparent"};font-family:Arial,sans-serif`;
    const serialized = new XMLSerializer().serializeToString(clone);
    if (options.format === "svg") {
      downloadBlob(
        new Blob([serialized], { type: "image/svg+xml;charset=utf-8" }),
        `${baseName}.svg`,
      );
      setExportOpen(false);
      return;
    }

    const url = URL.createObjectURL(new Blob([serialized], { type: "image/svg+xml" }));
    try {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("The drawing could not be rasterized."));
        image.src = url;
      });
      const canvas = document.createElement("canvas");
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("The browser could not create an export canvas.");
      if (whiteBackground) {
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, pixelWidth, pixelHeight);
      }
      context.drawImage(image, 0, 0, pixelWidth, pixelHeight);
      if (options.format === "pdf") {
        downloadBlob(
          buildPdfFromJpeg(
            canvas.toDataURL("image/jpeg", 0.92),
            pixelWidth,
            pixelHeight,
          ),
          `${baseName}.pdf`,
        );
      } else {
        downloadBlob(
          blobFromDataUrl(canvas.toDataURL("image/png"), "image/png"),
          `${baseName}.png`,
        );
      }
      setExportOpen(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not export drawing.");
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    try {
      const imported = parseArchimateFile(await file.text(), file.name);
      setImportSummary({
        filename: file.name,
        document: imported.document,
        format: imported.format,
        languageVersion: imported.languageVersion,
        warnings: imported.warnings,
        errors: imported.errors,
      });
      setError("");
    } catch (error) {
      setImportSummary({
        filename: file.name,
        document: ensureCanonicalDocument([], { name: file.name }),
        format: "unknown",
        warnings: [],
        errors: [error instanceof Error ? error.message : "invalid document"],
      });
    }
  }
  async function confirmImport() {
    if (!importSummary || importSummary.errors.length || importBusy) return;
    setImportBusy(true);
    setError("");
    const idempotencyKey = importIdempotencyKey.current || crypto.randomUUID();
    importIdempotencyKey.current = idempotencyKey;
    try {
      const document = ensureCanonicalDocument(importSummary.document);
      const imported = await api<Drawing>(
        "/drawings",
        "POST",
        {
          name: document.model.name || importSummary.filename.replace(/\.[^.]+$/, ""),
          category: "Architecture",
          document,
          elements: flattenDocument(document),
        },
        { "Idempotency-Key": idempotencyKey },
      );
      importIdempotencyKey.current = null;
      const normalized = drawingWithActiveView(imported);
      revisions.current.set(normalized.id, normalized.revision);
      setDrawings((items) => [normalized, ...items.filter((item) => item.id !== normalized.id)]);
      setImportSummary(null);
      open(normalized);
    } catch (error) {
      setError(`Import could not be saved: ${messageForError(error)}`);
    } finally {
      setImportBusy(false);
    }
  }
  function restoreRecovery() {
    if (!drawing || !recoveryDraft || recoveryDraft.id !== drawing.id) return;
    setHistory((h) => [...h.slice(-49), structuredClone(drawing.elements)]);
    setFuture([]);
    setSelectedIds([]);
    setRecoveryDraft(null);
    const document = ensureCanonicalDocument(recoveryDraft.document || recoveryDraft.elements, { name: recoveryDraft.name });
    const restored = drawingWithActiveView({
      ...drawing,
      name: recoveryDraft.name,
      category: recoveryDraft.category,
      document,
      activeViewId: recoveryDraft.activeViewId || document.activeViewId,
      elements: flattenDocument(document, recoveryDraft.activeViewId || document.activeViewId),
      updated: new Date().toISOString(),
    }, document, recoveryDraft.activeViewId || document.activeViewId);
    setViewId(restored.activeViewId || "");
    commit(restored);
  }
  function discardRecovery() {
    if (!drawing) return;
    clearRecoveryDraft(drawing.id);
    setRecoveryDraft(null);
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
      <div
        className="app-content"
        inert={modal || reauthOpen || exportOpen || Boolean(importSummary) || undefined}
        aria-hidden={modal || reauthOpen || exportOpen || Boolean(importSummary) || undefined}
      >
      <header className="topbar">
        <Brand />
        <div className="breadcrumb">
          <span>/</span>
          <button
            type="button"
            aria-current={screen === "library" ? "page" : undefined}
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
              <button
                type="button"
                className="export-png"
                onClick={() => setExportOpen(true)}
              >
                Export ↗
              </button>
              <button type="button" onClick={() => importInput.current?.click()}>
                Open ArchiMate file
              </button>
            </>
          )}
          <input
            ref={importInput}
            type="file"
            accept=".archimate,.xml,.json,application/json,application/xml,text/xml"
            hidden
            onChange={(event) => void importFile(event)}
          />
          <button
            type="button"
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
              <button onClick={() => setExportOpen(true)}>Export draft</button>
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
      {recoveryDraft && screen === "editor" && drawing && (
        <div className="recovery-bar" role="status">
          <span>Unsaved changes from an interrupted session were found.</span>
          <button onClick={restoreRecovery}>Restore draft</button>
          <button onClick={discardRecovery}>Discard</button>
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
          onImport={() => importInput.current?.click()}
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
            showAnchors={tool === "arrow"}
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
            onAddWaypoint={addWaypoint}
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
            viewId={viewId || drawing.activeViewId || drawing.document?.activeViewId || ""}
            viewSummaries={
              drawing.viewSummaries ||
              drawing.document?.views.map((view) => ({
                id: view.id,
                name: view.name,
                width: view.width,
                height: view.height,
              })) || []
            }
            onViewChange={selectView}
            onCreateView={createViewCommand}
            onRenameView={renameViewCommand}
            onRemoveView={removeViewCommand}
            onAddSemantic={addSemanticElement}
            onPlaceModelElement={placeExistingModel}
            onAssignElementType={assignElementType}
            onAssignRelationshipType={assignRelationshipType}
          />
        )
      )}
      </div>
      <ExportDialog
        open={exportOpen}
        hasSelection={selectedIds.length > 0}
        onClose={() => setExportOpen(false)}
        onExport={(options) => void exportDrawing(options)}
      />
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
      <ImportSummaryDialog
        open={Boolean(importSummary)}
        filename={importSummary?.filename || ""}
        format={importSummary?.format || "unknown"}
        languageVersion={importSummary?.languageVersion}
        warnings={importSummary?.warnings || []}
        errors={importSummary?.errors || []}
        onClose={() => {
          if (!importBusy) {
            importIdempotencyKey.current = null;
            setImportSummary(null);
          }
        }}
        onConfirm={() => void confirmImport()}
      />
    </div>
  );
}
