import type { Drawing, Element, IconName, Kind } from "../diagram";

export const DOCUMENT_SCHEMA_VERSION = 1 as const;
export const DOCUMENT_APP = "ArchInt" as const;

export type ExportEnvelope = {
  app: typeof DOCUMENT_APP;
  schemaVersion: typeof DOCUMENT_SCHEMA_VERSION;
  exportedAt: string;
  page: {
    width: number;
    height: number;
    background: string;
  };
  drawing: {
    name: string;
    category: Drawing["category"];
  };
  elements: Element[];
};

export type ImportedDocument = Pick<ExportEnvelope["drawing"], "name" | "category"> & {
  elements: Element[];
};

const kinds: Kind[] = ["card", "container", "text", "ellipse", "arrow", "pen", "icon"];
const iconNames: IconName[] = [
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
const colorPattern = /^#[a-f0-9]{6}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finite(value: unknown, limit = 100000): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= limit;
}

function validAnchor(value: unknown, ids: Set<string>, selfId: string): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.elementId === "string" &&
    value.elementId.length <= 100 &&
    value.elementId !== selfId &&
    ids.has(value.elementId) &&
    ["top", "right", "bottom", "left"].includes(String(value.side)) &&
    finite(value.offset, 1) &&
    value.offset >= 0 &&
    value.offset <= 1
  );
}

function validPoints(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length <= 20000 &&
    value.every(
      (point) =>
        Array.isArray(point) &&
        point.length === 2 &&
        point.every((coordinate) => finite(coordinate)),
    )
  );
}

function validWaypoints(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length <= 100 &&
    value.every(
      (point) =>
        isRecord(point) &&
        finite(point.x) &&
        finite(point.y),
    )
  );
}

function validElement(value: unknown, ids: Set<string>): value is Element {
  if (!isRecord(value)) return false;
  const id = value.id;
  const kind = value.kind;
  if (
    typeof id !== "string" ||
    id.length === 0 ||
    id.length > 100 ||
    !kinds.includes(kind as Kind) ||
    !finite(value.x) ||
    !finite(value.y) ||
    !finite(value.w) ||
    !finite(value.h) ||
    !finite(value.fontSize) ||
    Number(value.fontSize) < 8 ||
    Number(value.fontSize) > 80 ||
    (kind !== "arrow" && (Number(value.w) < 0 || Number(value.h) < 0)) ||
    typeof value.text !== "string" ||
    value.text.length > 10000 ||
    typeof value.detail !== "string" ||
    value.detail.length > 10000 ||
    typeof value.fill !== "string" ||
    !colorPattern.test(value.fill) ||
    typeof value.stroke !== "string" ||
    !colorPattern.test(value.stroke)
  )
    return false;
  if (value.rotation !== undefined && (!finite(value.rotation, 3600) || typeof value.rotation !== "number")) return false;
  if (value.groupId !== undefined && (typeof value.groupId !== "string" || value.groupId.length > 100)) return false;
  if (value.parentId !== undefined && (typeof value.parentId !== "string" || value.parentId.length > 100)) return false;
  if (value.locked !== undefined && typeof value.locked !== "boolean") return false;
  if (value.hidden !== undefined && typeof value.hidden !== "boolean") return false;
  if (
    value.strokeWidth !== undefined &&
    (typeof value.strokeWidth !== "number" || !Number.isFinite(value.strokeWidth) || value.strokeWidth <= 0 || value.strokeWidth > 100)
  )
    return false;
  if (value.fontWeight !== undefined && ![400, 500, 600, 700].includes(Number(value.fontWeight))) return false;
  if (
    value.lineHeight !== undefined &&
    (typeof value.lineHeight !== "number" || !Number.isFinite(value.lineHeight) || value.lineHeight < 1 || value.lineHeight > 3)
  )
    return false;
  if (value.textAlign !== undefined && !["left", "center", "right"].includes(String(value.textAlign))) return false;
  if (value.wrap !== undefined && typeof value.wrap !== "boolean") return false;
  if (value.overflow !== undefined && !["visible", "hidden"].includes(String(value.overflow))) return false;
  if (value.points !== undefined && (kind !== "pen" || !validPoints(value.points))) return false;
  if (value.sourceAnchor !== undefined && !validAnchor(value.sourceAnchor, ids, id)) return false;
  if (value.targetAnchor !== undefined && !validAnchor(value.targetAnchor, ids, id)) return false;
  if (value.route !== undefined && !["straight", "orthogonal"].includes(String(value.route))) return false;
  if (value.arrowhead !== undefined && !["none", "open", "triangle", "circle"].includes(String(value.arrowhead))) return false;
  if (value.waypoints !== undefined && (kind !== "arrow" || !validWaypoints(value.waypoints))) return false;
  if (value.iconName !== undefined && !iconNames.includes(value.iconName as IconName)) return false;
  return true;
}

export function serializeDocument(
  drawing: Pick<Drawing, "name" | "category" | "elements">,
  background = "#ffffff",
): string {
  const envelope: ExportEnvelope = {
    app: DOCUMENT_APP,
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    page: { width: 1400, height: 900, background },
    drawing: { name: drawing.name, category: drawing.category },
    elements: drawing.elements,
  };
  return JSON.stringify(envelope, null, 2);
}

export function parseDocumentJson(text: string): ImportedDocument {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("The selected file is not valid JSON.");
  }
  if (!isRecord(value) || value.app !== DOCUMENT_APP || value.schemaVersion !== DOCUMENT_SCHEMA_VERSION) {
    throw new Error(`Unsupported document format. Expected ${DOCUMENT_APP} schema version ${DOCUMENT_SCHEMA_VERSION}.`);
  }
  const page = value.page;
  if (
    !isRecord(page) ||
    !finite(page.width, 10000) ||
    !finite(page.height, 10000) ||
    page.width <= 0 ||
    page.height <= 0 ||
    typeof page.background !== "string" ||
    !colorPattern.test(page.background)
  ) {
    throw new Error("The document page settings are invalid.");
  }
  const drawing = value.drawing;
  if (
    !isRecord(drawing) ||
    typeof drawing.name !== "string" ||
    drawing.name.length > 100 ||
    !["Architecture", "Diagram"].includes(String(drawing.category))
  ) {
    throw new Error("The document drawing metadata is invalid.");
  }
  const elements = value.elements;
  if (!Array.isArray(elements) || elements.length > 2000) {
    throw new Error("The document contains too many elements.");
  }
  const ids = new Set<string>();
  for (const element of elements) {
    if (!isRecord(element) || typeof element.id !== "string" || ids.has(element.id)) {
      throw new Error("The document contains duplicate or invalid element IDs.");
    }
    ids.add(element.id);
  }
  if (!elements.every((element) => validElement(element, ids))) {
    throw new Error("The document contains unsupported or unsafe element data.");
  }
  if (
    !elements.every(
      (element) =>
        element.parentId === undefined ||
        (element.parentId !== element.id && ids.has(element.parentId)),
    )
  ) {
    throw new Error("The document contains an invalid parent reference.");
  }
  return {
    name: drawing.name,
    category: drawing.category as Drawing["category"],
    elements: elements as Element[],
  };
}
