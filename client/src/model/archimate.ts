import catalogJson from "../../../shared/archimate-catalog.json";
import type { Element as LegacyElement } from "../diagram";

export const ARCHIMATE_VERSION = "4.0" as const;
export const DOCUMENT_APP = "ArchInt" as const;
export const DOCUMENT_FORMAT = "archint-archimate" as const;
export const DOCUMENT_SCHEMA_VERSION = 2 as const;
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

export const ARCHIMATE_CATALOG = catalogJson;
export type ArchimateElementType =
  | "Role"
  | "Collaboration"
  | "Path"
  | "Service"
  | "Process"
  | "Function"
  | "Event"
  | "Grouping"
  | "Location"
  | "BusinessActor"
  | "BusinessInterface"
  | "BusinessObject"
  | "Product"
  | "ApplicationComponent"
  | "ApplicationInterface"
  | "DataObject"
  | "Node"
  | "Device"
  | "SystemSoftware"
  | "TechnologyInterface"
  | "CommunicationNetwork"
  | "DistributionNetwork"
  | "Equipment"
  | "Facility"
  | "Artifact"
  | "Material"
  | "Resource"
  | "Capability"
  | "ValueStream"
  | "CourseOfAction"
  | "Stakeholder"
  | "Driver"
  | "Assessment"
  | "Goal"
  | "Outcome"
  | "Principle"
  | "Requirement"
  | "Meaning"
  | "Value"
  | "WorkPackage"
  | "Deliverable"
  | "Plateau"
  | "AndJunction"
  | "OrJunction";

export type ArchimateRelationshipType =
  | "Composition"
  | "Aggregation"
  | "Assignment"
  | "Realization"
  | "Serving"
  | "Access"
  | "Influence"
  | "Triggering"
  | "Flow"
  | "Specialization"
  | "Association";

export type Multiplicity = string;
export type PropertyMap = Record<string, string>;

export type ArchimateModelElement = {
  id: string;
  type: ArchimateElementType;
  name: string;
  documentation: string;
  properties: PropertyMap;
  extensions?: Record<string, unknown>;
};

export type ArchimateRelationship = {
  id: string;
  type: ArchimateRelationshipType;
  sourceId: string;
  targetId: string;
  name: string;
  documentation: string;
  properties: PropertyMap;
  sourceMultiplicity?: Multiplicity;
  targetMultiplicity?: Multiplicity;
  accessType?: "read" | "write" | "read-write" | "unspecified";
  influenceStrength?: "+" | "++" | "-" | "--";
  extensions?: Record<string, unknown>;
};

export type ViewNode = {
  id: string;
  elementId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  kind: LegacyElement["kind"];
  label?: string;
  style: Partial<LegacyElement>;
  groupId?: string;
  parentId?: string;
  points?: [number, number][];
};

export type ViewConnection = {
  id: string;
  relationshipId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  source: { nodeId: string; side: LegacyElement["sourceAnchor"] extends infer A ? A extends { side: infer S } ? S : never : never; offset: number } | { x: number; y: number };
  target: { nodeId: string; side: LegacyElement["targetAnchor"] extends infer A ? A extends { side: infer S } ? S : never : never; offset: number } | { x: number; y: number };
  route: "straight" | "orthogonal";
  waypoints: { x: number; y: number }[];
  label: string;
  sourceMultiplicity?: Multiplicity;
  targetMultiplicity?: Multiplicity;
  style: Partial<LegacyElement>;
};

export type ViewAnnotation = {
  id: string;
  type: "legacy-drawing-element";
  element: LegacyElement;
};

export type ArchimateView = {
  id: string;
  name: string;
  documentation: string;
  width: number;
  height: number;
  background: string;
  nodes: Record<string, ViewNode>;
  connections: Record<string, ViewConnection>;
  annotations: Record<string, ViewAnnotation>;
  order: string[];
  settings: Record<string, unknown>;
};

export type ArchimateDocument = {
  app: typeof DOCUMENT_APP;
  format: typeof DOCUMENT_FORMAT;
  schemaVersion: typeof DOCUMENT_SCHEMA_VERSION;
  language: {
    name: "ArchiMate";
    version: typeof ARCHIMATE_VERSION;
    specificationUrl: string;
    authority: string;
  };
  model: {
    id: string;
    name: string;
    documentation: string;
    properties: PropertyMap;
    elements: Record<string, ArchimateModelElement>;
    relationships: Record<string, ArchimateRelationship>;
    organization: unknown[];
  };
  page: { width: number; height: number; background: string };
  views: ArchimateView[];
  activeViewId: string;
  assets: Record<string, unknown>;
  extensions: Record<string, unknown>;
};

export type DocumentValidation = { document: ArchimateDocument; errors: string[]; valid: boolean };

const elementTypes = new Set<ArchimateElementType>(
  ARCHIMATE_CATALOG.elements.map((element) => element.id as ArchimateElementType),
);
const relationshipTypes = new Set<ArchimateRelationshipType>(
  ARCHIMATE_CATALOG.relationships.map((relationship) => relationship.id as ArchimateRelationshipType),
);
const aliases = new Map<string, ArchimateElementType>();
for (const element of ARCHIMATE_CATALOG.elements) {
  aliases.set(element.id, element.id as ArchimateElementType);
  for (const alias of element.legacyAliases || []) aliases.set(alias, element.id as ArchimateElementType);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function newId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finite(value: unknown, limit = 100000): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= limit;
}

function safeText(value: unknown, limit = 10000): value is string {
  return typeof value === "string" && value.length <= limit;
}

function safeColor(value: unknown, fallback = "#ffffff"): string {
  return typeof value === "string" && /^#[a-f0-9]{6}$/i.test(value) ? value : fallback;
}

function typeFor(value: unknown): ArchimateElementType | undefined {
  if (typeof value !== "string") return undefined;
  return aliases.get(value.replace(/^.*:/, ""));
}

function relationshipTypeFor(value: unknown): ArchimateRelationshipType | undefined {
  if (typeof value !== "string") return undefined;
  const short = value.replace(/^.*:/, "").replace(/Relationship$/, "");
  if (relationshipTypes.has(short as ArchimateRelationshipType)) return short as ArchimateRelationshipType;
  if (short === "Serves") return "Serving";
  if (short === "Triggers" || short === "Trigger") return "Triggering";
  return undefined;
}

function styleFor(element: LegacyElement): Partial<LegacyElement> {
  return {
    fill: safeColor(element.fill),
    stroke: safeColor(element.stroke, "#7392b8"),
    strokeWidth: finite(element.strokeWidth, 100) && element.strokeWidth > 0 ? element.strokeWidth : 1.5,
    fontSize: finite(element.fontSize, 80) ? element.fontSize : 16,
    fontWeight: [400, 500, 600, 700].includes(Number(element.fontWeight)) ? Number(element.fontWeight) as 400 | 500 | 600 | 700 : 600,
    lineHeight: finite(element.lineHeight, 3) ? element.lineHeight : 1.35,
    textAlign: element.textAlign || "left",
    wrap: element.wrap !== false,
    overflow: element.overflow || "visible",
    locked: Boolean(element.locked),
    hidden: Boolean(element.hidden),
    iconName: element.iconName,
  };
}

function defaultStyle(type: ArchimateElementType): Partial<LegacyElement> {
  const domain = ARCHIMATE_CATALOG.elements.find((element) => element.id === type)?.domain;
  const fills: Record<string, string> = {
    common: "#edf3fc",
    business: "#eff5ef",
    application: "#f0ecfb",
    technology: "#f4f1e9",
    strategy: "#fdf4dc",
    motivation: "#fff0e8",
    "implementation-migration": "#eaf1f5",
  };
  const strokes: Record<string, string> = {
    common: "#7392b8",
    business: "#72a17c",
    application: "#9885cf",
    technology: "#b79562",
    strategy: "#c28d40",
    motivation: "#cb8063",
    "implementation-migration": "#6791aa",
  };
  return {
    fill: fills[domain || "common"] || "#edf3fc",
    stroke: strokes[domain || "common"] || "#7392b8",
    strokeWidth: 1.5,
    fontSize: 16,
    fontWeight: 600,
    lineHeight: 1.35,
    textAlign: "left",
    wrap: true,
    overflow: "visible",
  };
}

function makeView(name = "Main view", options: Partial<ArchimateView> = {}): ArchimateView {
  const width = finite(options.width, 10000) && options.width > 0 ? options.width : 1400;
  const height = finite(options.height, 10000) && options.height > 0 ? options.height : 900;
  return {
    id: options.id || newId("view"),
    name: name.trim().slice(0, 100) || "Main view",
    documentation: safeText(options.documentation) ? options.documentation : "",
    width,
    height,
    background: safeColor(options.background),
    nodes: {},
    connections: {},
    annotations: {},
    order: [],
    settings: isRecord(options.settings) ? clone(options.settings) : {},
  };
}

export function createDocument(name = "Untitled drawing", options: Partial<ArchimateView> & { documentation?: string; properties?: PropertyMap } = {}): ArchimateDocument {
  const view = makeView("Main view", options);
  const documentName = name.trim().slice(0, 100) || "Untitled drawing";
  return {
    app: DOCUMENT_APP,
    format: DOCUMENT_FORMAT,
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    language: {
      name: "ArchiMate",
      version: ARCHIMATE_VERSION,
      specificationUrl: ARCHIMATE_CATALOG.language.specificationUrl,
      authority: ARCHIMATE_CATALOG.language.authority,
    },
    model: {
      id: newId("model"),
      name: documentName,
      documentation: options.documentation || "",
      properties: options.properties ? clone(options.properties) : {},
      elements: {},
      relationships: {},
      organization: [],
    },
    page: { width: view.width, height: view.height, background: view.background },
    views: [view],
    activeViewId: view.id,
    assets: {},
    extensions: {},
  };
}

export function normalizeMultiplicity(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (normalized === "*") return "0..*";
  if (/^\d+$/.test(normalized)) return `${normalized}..${normalized}`;
  const match = normalized.match(/^(\d+)\.\.(\d+|\*)$/);
  if (!match) return undefined;
  return match[2] === "*" || Number(match[2]) >= Number(match[1]) ? normalized : undefined;
}

function normalizeCollection<T extends { id: string }>(value: unknown): Record<string, T> {
  if (Array.isArray(value)) {
    return Object.fromEntries(value.filter((item): item is T => isRecord(item) && typeof item.id === "string").map((item) => [item.id, item]));
  }
  return isRecord(value) ? value as Record<string, T> : {};
}

function normalizeView(value: unknown): ArchimateView {
  const view = isRecord(value) ? clone(value) as Partial<ArchimateView> : {};
  const normalized = makeView(typeof view.name === "string" ? view.name : "Main view", view);
  normalized.id = typeof view.id === "string" && view.id ? view.id : normalized.id;
  normalized.documentation = safeText(view.documentation) ? view.documentation : "";
  normalized.nodes = normalizeCollection<ViewNode>(view.nodes);
  normalized.connections = normalizeCollection<ViewConnection>(view.connections);
  normalized.annotations = normalizeCollection<ViewAnnotation>(view.annotations);
  normalized.order = Array.isArray(view.order) ? view.order.filter((item): item is string => typeof item === "string") : [];
  return normalized;
}

function nodeFromElement(element: LegacyElement, modelId: string, nodeId: string, type: ArchimateElementType): ViewNode {
  return {
    id: nodeId,
    elementId: modelId,
    x: element.x,
    y: element.y,
    w: Math.max(20, element.w),
    h: Math.max(20, element.h),
    rotation: element.rotation || 0,
    kind: element.kind === "arrow" || element.kind === "pen" ? "card" : element.kind,
    label: element.text,
    style: { ...defaultStyle(type), ...styleFor(element) },
    groupId: element.groupId,
    parentId: element.parentId,
    points: element.points,
  };
}

function modelFromElement(element: LegacyElement, type: ArchimateElementType, modelId: string): ArchimateModelElement {
  return {
    id: modelId,
    type,
    name: element.text || type,
    documentation: element.detail || "",
    properties: isRecord(element.semanticProperties) ? clone(element.semanticProperties) : {},
    extensions: isRecord(element.semanticExtensions) ? clone(element.semanticExtensions) : undefined,
  };
}

function validLegacy(value: unknown): value is LegacyElement {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.kind !== "string") return false;
  return ["card", "container", "text", "ellipse", "arrow", "pen", "icon"].includes(value.kind) &&
    finite(value.x) && finite(value.y) && finite(value.w) && finite(value.h) &&
    typeof value.text === "string" && value.text.length <= 10000 &&
    typeof value.detail === "string" && value.detail.length <= 10000 &&
    /^#[a-f0-9]{6}$/i.test(String(value.fill)) && /^#[a-f0-9]{6}$/i.test(String(value.stroke));
}

export function migrateLegacyDocument(input: unknown, metadata: { name?: string; documentation?: string; properties?: PropertyMap } = {}): ArchimateDocument {
  const rawElements = Array.isArray(input)
    ? input
    : isRecord(input) && Array.isArray(input.elements)
      ? input.elements
      : [];
  const document = createDocument(metadata.name || (isRecord(input) && typeof input.name === "string" ? input.name : "Untitled drawing"), metadata);
  const view = document.views[0];
  const nodesByRawId = new Map<string, string>();
  const nodesByModelId = new Map<string, string>();
  const validElements = rawElements.filter(validLegacy).map(clone);
  for (const element of validElements) {
    const type = typeFor(element.archimateType || element.elementType || element.semanticType);
    if (!type || element.kind === "arrow") continue;
    const modelId = element.modelElementId || `model-${element.id}`;
    const nodeId = element.viewNodeId || `node-${element.id}`;
    document.model.elements[modelId] = modelFromElement(element, type, modelId);
    view.nodes[nodeId] = nodeFromElement(element, modelId, nodeId, type);
    nodesByRawId.set(element.id, nodeId);
    nodesByModelId.set(modelId, nodeId);
    view.order.push(nodeId);
  }
  for (const element of validElements) {
    const relationType = relationshipTypeFor(element.relationshipType || element.archimateRelationship);
    const sourceNodeId = typeof element.sourceAnchor?.elementId === "string"
      ? nodesByRawId.get(element.sourceAnchor.elementId) || nodesByModelId.get(element.sourceAnchor.elementId)
      : undefined;
    const targetNodeId = typeof element.targetAnchor?.elementId === "string"
      ? nodesByRawId.get(element.targetAnchor.elementId) || nodesByModelId.get(element.targetAnchor.elementId)
      : undefined;
    if (element.kind === "arrow" && relationType && sourceNodeId && targetNodeId) {
      const sourceNode = view.nodes[sourceNodeId];
      const targetNode = view.nodes[targetNodeId];
      const relationshipId = element.relationshipId || `relationship-${element.id}`;
      document.model.relationships[relationshipId] = {
        id: relationshipId,
        type: relationType,
        sourceId: sourceNode.elementId,
        targetId: targetNode.elementId,
        name: element.text || "",
        documentation: element.detail || "",
        properties: isRecord(element.semanticProperties) ? clone(element.semanticProperties) : {},
        sourceMultiplicity: normalizeMultiplicity(element.sourceMultiplicity),
        targetMultiplicity: normalizeMultiplicity(element.targetMultiplicity),
      };
      const connectionId = element.viewConnectionId || `connection-${element.id}`;
      view.connections[connectionId] = {
        id: connectionId,
        relationshipId,
        x: element.x,
        y: element.y,
        w: element.w,
        h: element.h,
        source: { nodeId: sourceNodeId, side: element.sourceAnchor!.side, offset: element.sourceAnchor!.offset },
        target: { nodeId: targetNodeId, side: element.targetAnchor!.side, offset: element.targetAnchor!.offset },
        route: element.route || "straight",
        waypoints: element.waypoints || [],
        label: element.text || "",
        sourceMultiplicity: normalizeMultiplicity(element.sourceMultiplicity),
        targetMultiplicity: normalizeMultiplicity(element.targetMultiplicity),
        style: styleFor(element),
      } as ViewConnection;
      view.order.push(connectionId);
      continue;
    }
    if (!view.nodes[`node-${element.id}`]) {
      view.annotations[element.id] = { id: element.id, type: "legacy-drawing-element", element };
      view.order.push(element.id);
    }
  }
  document.extensions.migration = {
    from: isRecord(input) && input.schemaVersion === 1 ? "archint-json-v1" : "legacy-element-array",
    migratedAt: new Date().toISOString(),
    genericAnnotations: Object.keys(view.annotations).length,
  };
  return document;
}

export function ensureCanonicalDocument(input: unknown, metadata: { name?: string; documentation?: string; properties?: PropertyMap } = {}): ArchimateDocument {
  if (isRecord(input) && input.app === DOCUMENT_APP && input.format === DOCUMENT_FORMAT && input.schemaVersion === DOCUMENT_SCHEMA_VERSION && isRecord(input.model) && Array.isArray(input.views)) {
    const raw = clone(input) as ArchimateDocument;
    raw.language = {
      name: "ArchiMate",
      version: ARCHIMATE_VERSION,
      specificationUrl: ARCHIMATE_CATALOG.language.specificationUrl,
      authority: ARCHIMATE_CATALOG.language.authority,
      ...(isRecord(input.language) ? input.language : {}),
    };
    raw.model.elements = normalizeCollection<ArchimateModelElement>(raw.model.elements);
    raw.model.relationships = normalizeCollection<ArchimateRelationship>(raw.model.relationships);
    raw.views = raw.views.map(normalizeView);
    if (!raw.views.length) raw.views = [makeView()];
    raw.activeViewId = raw.views.some((view) => view.id === raw.activeViewId) ? raw.activeViewId : raw.views[0].id;
    raw.page = { width: raw.views[0].width, height: raw.views[0].height, background: raw.views[0].background };
    raw.assets = isRecord(raw.assets) ? raw.assets : {};
    raw.extensions = isRecord(raw.extensions) ? raw.extensions : {};
    return raw;
  }
  return migrateLegacyDocument(input, metadata);
}

function orderedItems(view: ArchimateView): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of view.order) {
    if (!seen.has(item) && (view.nodes[item] || view.connections[item] || view.annotations[item])) {
      seen.add(item);
      result.push(item);
    }
  }
  for (const collection of [view.annotations, view.nodes, view.connections]) {
    for (const item of Object.keys(collection)) if (!seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }
  return result;
}

function arrowheadFor(type: ArchimateRelationshipType): LegacyElement["arrowhead"] {
  if (["Composition", "Aggregation", "Association"].includes(type)) return "none";
  if (type === "Triggering") return "triangle";
  return "open";
}

export function flattenDocument(document: ArchimateDocument, viewId = document.activeViewId): LegacyElement[] {
  const canonical = ensureCanonicalDocument(document);
  const view = canonical.views.find((candidate) => candidate.id === viewId) || canonical.views[0];
  const result: LegacyElement[] = [];
  for (const item of orderedItems(view)) {
    const annotation = view.annotations[item];
    if (annotation) {
      result.push(clone(annotation.element));
      continue;
    }
    const node = view.nodes[item];
    if (node) {
      const model = canonical.model.elements[node.elementId];
      if (!model) continue;
      const style = node.style || {};
      result.push({
        id: node.id,
        kind: ["card", "container", "text", "ellipse", "icon"].includes(node.kind) ? node.kind : "card",
        x: node.x,
        y: node.y,
        w: node.w,
        h: node.h,
        text: node.label || model.name,
        detail: model.documentation,
        fill: safeColor(style.fill),
        stroke: safeColor(style.stroke, "#7392b8"),
        fontSize: finite(style.fontSize, 80) ? style.fontSize : 16,
        rotation: node.rotation || 0,
        groupId: node.groupId,
        parentId: node.parentId,
        locked: Boolean(style.locked),
        hidden: Boolean(style.hidden),
        strokeWidth: finite(style.strokeWidth, 100) ? style.strokeWidth : 1.5,
        fontWeight: [400, 500, 600, 700].includes(Number(style.fontWeight)) ? Number(style.fontWeight) as 400 | 500 | 600 | 700 : 600,
        lineHeight: finite(style.lineHeight, 3) ? style.lineHeight : 1.35,
        textAlign: style.textAlign || "left",
        wrap: style.wrap !== false,
        overflow: style.overflow || "visible",
        iconName: style.iconName,
        archimateType: model.type,
        modelElementId: model.id,
        viewNodeId: node.id,
        semanticProperties: clone(model.properties),
        points: node.points,
      });
      continue;
    }
    const connection = view.connections[item];
    if (!connection) continue;
    const relationship = canonical.model.relationships[connection.relationshipId];
    if (!relationship) continue;
    const style = connection.style || {};
    const source = "nodeId" in connection.source ? connection.source : undefined;
    const target = "nodeId" in connection.target ? connection.target : undefined;
    result.push({
      id: connection.id,
      kind: "arrow",
      x: connection.x,
      y: connection.y,
      w: connection.w,
      h: connection.h,
      text: connection.label || relationship.name,
      detail: relationship.documentation,
      fill: safeColor(style.fill),
      stroke: safeColor(style.stroke, "#7392b8"),
      fontSize: 12,
      strokeWidth: finite(style.strokeWidth, 100) ? style.strokeWidth : 2.5,
      locked: Boolean(style.locked),
      hidden: Boolean(style.hidden),
      route: connection.route,
      waypoints: clone(connection.waypoints),
      arrowhead: arrowheadFor(relationship.type),
      sourceAnchor: source ? { elementId: source.nodeId, side: source.side, offset: source.offset } : undefined,
      targetAnchor: target ? { elementId: target.nodeId, side: target.side, offset: target.offset } : undefined,
      relationshipType: relationship.type,
      relationshipId: relationship.id,
      sourceMultiplicity: connection.sourceMultiplicity || relationship.sourceMultiplicity,
      targetMultiplicity: connection.targetMultiplicity || relationship.targetMultiplicity,
      accessType: relationship.accessType,
      influenceStrength: relationship.influenceStrength,
    });
  }
  return result;
}

export function applyLegacyElements(document: ArchimateDocument, elements: LegacyElement[], viewId = document.activeViewId): ArchimateDocument {
  const next = ensureCanonicalDocument(document);
  const view = next.views.find((candidate) => candidate.id === viewId) || next.views[0];
  const nodes: Record<string, ViewNode> = {};
  const connections: Record<string, ViewConnection> = {};
  const annotations: Record<string, ViewAnnotation> = {};
  const order: string[] = [];
  const modelIds = new Map<string, string>();
  for (const element of elements) {
    const type = typeFor(element.archimateType || element.elementType || element.semanticType);
    if (!type || element.kind === "arrow") continue;
    const existing = view.nodes[element.viewNodeId || element.id] || Object.values(view.nodes).find((candidate) => candidate.elementId === element.modelElementId);
    const modelId = element.modelElementId || existing?.elementId || `model-${element.id}`;
    const nodeId = element.viewNodeId || existing?.id || `node-${element.id}`;
    nodes[nodeId] = {
      id: nodeId,
      elementId: modelId,
      x: element.x,
      y: element.y,
      w: Math.max(20, element.w),
      h: Math.max(20, element.h),
      rotation: element.rotation || 0,
      kind: element.kind,
      label: element.text,
      style: { ...defaultStyle(type), ...styleFor(element) },
      groupId: element.groupId,
      parentId: element.parentId,
      points: element.points,
    };
    modelIds.set(element.id, modelId);
    next.model.elements[modelId] = {
      ...(next.model.elements[modelId] || modelFromElement(element, type, modelId)),
      id: modelId,
      type,
      name: element.text || next.model.elements[modelId]?.name || type,
      documentation: element.detail || next.model.elements[modelId]?.documentation || "",
      properties: isRecord(element.semanticProperties) ? clone(element.semanticProperties) : next.model.elements[modelId]?.properties || {},
    };
    order.push(nodeId);
  }
  for (const element of elements) {
    const relationType = relationshipTypeFor(element.relationshipType || element.archimateRelationship);
    if (element.kind === "arrow" && relationType) {
      const sourceId = modelIds.get(element.sourceAnchor?.elementId || "") || view.nodes[element.sourceAnchor?.elementId || ""]?.elementId;
      const targetId = modelIds.get(element.targetAnchor?.elementId || "") || view.nodes[element.targetAnchor?.elementId || ""]?.elementId;
      if (sourceId && targetId && element.sourceAnchor && element.targetAnchor) {
        const relationshipId = element.relationshipId || view.connections[element.id]?.relationshipId || `relationship-${element.id}`;
        next.model.relationships[relationshipId] = {
          ...(next.model.relationships[relationshipId] || {}),
          id: relationshipId,
          type: relationType,
          sourceId,
          targetId,
          name: element.text || "",
          documentation: element.detail || "",
          properties: isRecord(element.semanticProperties) ? clone(element.semanticProperties) : {},
          sourceMultiplicity: normalizeMultiplicity(element.sourceMultiplicity),
          targetMultiplicity: normalizeMultiplicity(element.targetMultiplicity),
          accessType: element.accessType,
          influenceStrength: element.influenceStrength,
        };
        const connectionId = element.viewConnectionId || view.connections[element.id]?.id || `connection-${element.id}`;
        connections[connectionId] = {
          id: connectionId,
          relationshipId,
          x: element.x,
          y: element.y,
          w: element.w,
          h: element.h,
          source: { nodeId: element.sourceAnchor.elementId, side: element.sourceAnchor.side, offset: element.sourceAnchor.offset },
          target: { nodeId: element.targetAnchor.elementId, side: element.targetAnchor.side, offset: element.targetAnchor.offset },
          route: element.route || "straight",
          waypoints: element.waypoints || [],
          label: element.text || "",
          sourceMultiplicity: normalizeMultiplicity(element.sourceMultiplicity),
          targetMultiplicity: normalizeMultiplicity(element.targetMultiplicity),
          style: styleFor(element),
        } as ViewConnection;
        order.push(connectionId);
        continue;
      }
    }
    if (!typeFor(element.archimateType || element.elementType || element.semanticType) || element.kind === "arrow") {
      annotations[element.id] = { id: element.id, type: "legacy-drawing-element", element: clone(element) };
      order.push(element.id);
    }
  }
  view.nodes = nodes;
  view.connections = connections;
  view.annotations = annotations;
  view.order = order;
  next.page = { width: view.width, height: view.height, background: view.background };
  return next;
}

function relationshipIsValid(source: ArchimateElementType, type: ArchimateRelationshipType, target: ArchimateElementType): boolean {
  const relationship = ARCHIMATE_CATALOG.relationships.find((candidate) => candidate.id === type);
  if (!relationship || source === target && ["Composition", "Specialization"].includes(type)) return false;
  return (relationship.sourceTypes.includes("*") || relationship.sourceTypes.includes(source)) &&
    (relationship.targetTypes.includes("*") || relationship.targetTypes.includes(target));
}

export function validateDocument(input: unknown, metadata: { name?: string } = {}): DocumentValidation {
  const document = ensureCanonicalDocument(input, metadata);
  const errors: string[] = [];
  if (document.language.version !== ARCHIMATE_VERSION) errors.push("document must target ArchiMate 4.0");
  if (!document.model.name || document.model.name.length > 100) errors.push("model name is invalid");
  if (Object.keys(document.model.elements).length > 2000) errors.push("model contains too many elements");
  if (Object.keys(document.model.relationships).length > 4000) errors.push("model contains too many relationships");
  const ids = new Set(Object.keys(document.model.elements));
  for (const [id, element] of Object.entries(document.model.elements)) {
    if (id !== element.id || !elementTypes.has(element.type) || !safeText(element.name, 1000) || !safeText(element.documentation)) errors.push(`invalid model element ${id}`);
  }
  for (const [id, relation] of Object.entries(document.model.relationships)) {
    const source = document.model.elements[relation.sourceId];
    const target = document.model.elements[relation.targetId];
    if (id !== relation.id || !relationshipTypes.has(relation.type) || !source || !target || !relationshipIsValid(source.type, relation.type, target.type) || (relation.sourceMultiplicity && !normalizeMultiplicity(relation.sourceMultiplicity)) || (relation.targetMultiplicity && !normalizeMultiplicity(relation.targetMultiplicity))) errors.push(`invalid relationship ${id}`);
  }
  const viewIds = new Set<string>();
  for (const view of document.views) {
    if (viewIds.has(view.id) || !view.id || !view.name || !finite(view.width, 10000) || !finite(view.height, 10000)) errors.push(`invalid view ${view.id}`);
    viewIds.add(view.id);
    for (const node of Object.values(view.nodes)) if (!ids.has(node.elementId) || !finite(node.x) || !finite(node.y) || !finite(node.w) || !finite(node.h)) errors.push(`invalid view node ${node.id}`);
    for (const connection of Object.values(view.connections)) if (!document.model.relationships[connection.relationshipId] || !finite(connection.x) || !finite(connection.y) || !finite(connection.w) || !finite(connection.h)) errors.push(`invalid view connection ${connection.id}`);
    for (const annotation of Object.values(view.annotations)) if (!validLegacy(annotation.element)) errors.push(`invalid view annotation ${annotation.id}`);
  }
  if (!viewIds.has(document.activeViewId)) errors.push("active view does not exist");
  return { document, errors: [...new Set(errors)], valid: errors.length === 0 };
}

export function isArchimateElementType(value: unknown): value is ArchimateElementType {
  return typeof value === "string" && elementTypes.has(value as ArchimateElementType);
}

export function isArchimateRelationshipType(value: unknown): value is ArchimateRelationshipType {
  return typeof value === "string" && relationshipTypes.has(value as ArchimateRelationshipType);
}

export function relationshipAllowed(source: ArchimateElementType, type: ArchimateRelationshipType, target: ArchimateElementType): boolean {
  return relationshipIsValid(source, type, target);
}
