const crypto = require("node:crypto");
const catalog = require("./archimate-catalog.json");

const DOCUMENT_APP = "ArchInt";
const DOCUMENT_FORMAT = "archint-archimate";
const DOCUMENT_SCHEMA_VERSION = 2;
const ARCHIMATE_VERSION = "4.0";
const LEGACY_SCHEMA_VERSION = 1;
const MAX_ELEMENTS = 2000;
const MAX_RELATIONSHIPS = 4000;
const MAX_VIEWS = 100;
const MAX_PROPERTIES = 100;
const MAX_TEXT = 10000;
const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
const COLOR_PATTERN = /^#[a-f0-9]{6}$/i;
const ANCHOR_SIDES = ["top", "right", "bottom", "left"];
const LEGACY_KINDS = ["card", "container", "text", "ellipse", "arrow", "pen", "icon"];
const ROUTES = ["straight", "orthogonal"];
const ARROWHEADS = ["none", "open", "triangle", "circle"];
const TEXT_ALIGNS = ["left", "center", "right"];
const RELATIONSHIP_BY_ID = new Map(catalog.relationships.map((item) => [item.id, item]));
const ELEMENT_BY_ID = new Map(catalog.elements.map((item) => [item.id, item]));
const TYPE_ALIASES = new Map(
  catalog.elements.flatMap((element) =>
    [element.id, ...(element.legacyAliases || [])].map((alias) => [alias, element.id]),
  ),
);

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function id(prefix = "id") {
  let value;
  try {
    value = crypto.randomUUID();
  } catch {
    value = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
  return `${prefix}-${value}`;
}

function finite(value, limit = 100000) {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= limit;
}

function text(value, limit = MAX_TEXT) {
  return typeof value === "string" && value.length <= limit;
}

function record(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function color(value, fallback = "#ffffff") {
  return typeof value === "string" && COLOR_PATTERN.test(value) ? value : fallback;
}

function normalizeType(value) {
  if (typeof value !== "string") return undefined;
  return TYPE_ALIASES.get(value) || TYPE_ALIASES.get(value.replace(/^.*:/, ""));
}

function normalizeRelationshipType(value) {
  if (typeof value !== "string") return undefined;
  const short = value.replace(/^.*:/, "").replace(/Relationship$/, "");
  const aliases = {
    Serving: "Serving",
    Serves: "Serving",
    Trigger: "Triggering",
    Triggers: "Triggering",
    AssociationRelationship: "Association",
  };
  return RELATIONSHIP_BY_ID.has(short) ? short : aliases[short];
}

function defaultStyle(type) {
  const element = ELEMENT_BY_ID.get(type);
  const fills = {
    common: "#edf3fc",
    business: "#eff5ef",
    application: "#f0ecfb",
    technology: "#f4f1e9",
    strategy: "#fdf4dc",
    motivation: "#fff0e8",
    "implementation-migration": "#eaf1f5",
  };
  const strokes = {
    common: "#7392b8",
    business: "#72a17c",
    application: "#9885cf",
    technology: "#b79562",
    strategy: "#c28d40",
    motivation: "#cb8063",
    "implementation-migration": "#6791aa",
  };
  return {
    fill: fills[element?.domain] || "#edf3fc",
    stroke: strokes[element?.domain] || "#7392b8",
    strokeWidth: 1.5,
    fontSize: 16,
    fontWeight: 600,
    lineHeight: 1.35,
    textAlign: "left",
    wrap: true,
    overflow: "visible",
  };
}

function createView(name = "Main view", options = {}) {
  const width = finite(options.width, 10000) && options.width > 0 ? options.width : 1400;
  const height = finite(options.height, 10000) && options.height > 0 ? options.height : 900;
  return {
    id: options.id || id("view"),
    name: typeof name === "string" && name.trim() ? name.trim().slice(0, 100) : "Main view",
    documentation: text(options.documentation) ? options.documentation : "",
    width,
    height,
    background: color(options.background),
    nodes: {},
    connections: {},
    annotations: {},
    order: [],
    settings: record(options.settings) ? clone(options.settings) : {},
  };
}

function createDocument(name = "Untitled drawing", options = {}) {
  const view = createView(options.viewName || "Main view", options);
  const modelId = options.modelId || id("model");
  const documentName = typeof name === "string" && name.trim() ? name.trim().slice(0, 100) : "Untitled drawing";
  return {
    app: DOCUMENT_APP,
    format: DOCUMENT_FORMAT,
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    language: {
      name: "ArchiMate",
      version: ARCHIMATE_VERSION,
      specificationUrl: catalog.language.specificationUrl,
      authority: catalog.language.authority,
    },
    model: {
      id: modelId,
      name: documentName,
      documentation: text(options.documentation) ? options.documentation : "",
      properties: record(options.properties) ? clone(options.properties) : {},
      elements: {},
      relationships: {},
      organization: [],
    },
    page: {
      width: view.width,
      height: view.height,
      background: view.background,
    },
    views: [view],
    activeViewId: view.id,
    assets: {},
    extensions: record(options.extensions) ? clone(options.extensions) : {},
  };
}

function normalizeMultiplicity(value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (normalized === "*") return "0..*";
  if (/^\d+$/.test(normalized)) return `${normalized}..${normalized}`;
  const match = normalized.match(/^(\d+)\.\.(\d+|\*)$/);
  if (!match) return undefined;
  const minimum = Number(match[1]);
  const maximum = match[2] === "*" ? Infinity : Number(match[2]);
  return maximum >= minimum ? normalized : undefined;
}

function validMultiplicity(value) {
  return value === undefined || normalizeMultiplicity(value) !== undefined;
}

function normalizeAnchor(value, fallbackId) {
  if (!record(value) || typeof value.elementId !== "string") return undefined;
  const offset = Number(value.offset);
  if (
    !value.elementId ||
    value.elementId === fallbackId ||
    !ANCHOR_SIDES.includes(value.side) ||
    !Number.isFinite(offset) ||
    offset < 0 ||
    offset > 1
  )
    return undefined;
  return { elementId: value.elementId, side: value.side, offset };
}

function validPoints(value) {
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

function validWaypoints(value) {
  return (
    Array.isArray(value) &&
    value.length <= 100 &&
    value.every((point) => record(point) && finite(point.x) && finite(point.y))
  );
}

function validProperties(value) {
  if (value === undefined) return true;
  if (!record(value) || Object.keys(value).length > MAX_PROPERTIES) return false;
  return Object.entries(value).every(
    ([key, item]) =>
      key.length > 0 && key.length <= 200 && text(item, 5000),
  );
}

function validLegacyElement(value, ids = new Set(), options = {}) {
  if (!record(value)) return false;
  const kind = value.kind;
  if (
    typeof value.id !== "string" ||
    value.id.length === 0 ||
    value.id.length > 100 ||
    (!options.skipIds && ids.has(value.id)) ||
    !LEGACY_KINDS.includes(kind) ||
    !finite(value.x) ||
    !finite(value.y) ||
    !finite(value.w) ||
    !finite(value.h) ||
    !finite(value.fontSize) ||
    value.fontSize < 8 ||
    value.fontSize > 80 ||
    (kind !== "arrow" && (value.w < 0 || value.h < 0)) ||
    !text(value.text) ||
    !text(value.detail) ||
    !COLOR_PATTERN.test(value.fill) ||
    !COLOR_PATTERN.test(value.stroke)
  )
    return false;
  if (value.points !== undefined && (kind !== "pen" || !validPoints(value.points))) return false;
  if (value.waypoints !== undefined && (kind !== "arrow" || !validWaypoints(value.waypoints))) return false;
  if (value.rotation !== undefined && !finite(value.rotation, 3600)) return false;
  if (value.groupId !== undefined && (typeof value.groupId !== "string" || value.groupId.length > 100)) return false;
  if (value.parentId !== undefined && (typeof value.parentId !== "string" || value.parentId.length > 100)) return false;
  if (value.locked !== undefined && typeof value.locked !== "boolean") return false;
  if (value.hidden !== undefined && typeof value.hidden !== "boolean") return false;
  if (value.strokeWidth !== undefined && (!finite(value.strokeWidth, 100) || value.strokeWidth <= 0)) return false;
  if (value.fontWeight !== undefined && ![400, 500, 600, 700].includes(Number(value.fontWeight))) return false;
  if (value.lineHeight !== undefined && (!finite(value.lineHeight, 3) || value.lineHeight < 1)) return false;
  if (value.textAlign !== undefined && !TEXT_ALIGNS.includes(value.textAlign)) return false;
  if (value.wrap !== undefined && typeof value.wrap !== "boolean") return false;
  if (value.overflow !== undefined && !["visible", "hidden"].includes(value.overflow)) return false;
  if (value.route !== undefined && !ROUTES.includes(value.route)) return false;
  if (value.arrowhead !== undefined && !ARROWHEADS.includes(value.arrowhead)) return false;
  if (value.iconName !== undefined && (typeof value.iconName !== "string" || value.iconName.length > 100)) return false;
  if (value.semanticProperties !== undefined && !validProperties(value.semanticProperties)) return false;
  return true;
}

function legacyStyle(element) {
  return {
    fill: color(element.fill),
    stroke: color(element.stroke, "#7392b8"),
    strokeWidth: finite(element.strokeWidth, 100) && element.strokeWidth > 0 ? element.strokeWidth : 1.5,
    fontSize: finite(element.fontSize, 80) && element.fontSize >= 8 ? element.fontSize : 16,
    fontWeight: [400, 500, 600, 700].includes(Number(element.fontWeight)) ? Number(element.fontWeight) : 600,
    lineHeight: finite(element.lineHeight, 3) && element.lineHeight >= 1 ? element.lineHeight : 1.35,
    textAlign: TEXT_ALIGNS.includes(element.textAlign) ? element.textAlign : "left",
    wrap: element.wrap !== false,
    overflow: ["visible", "hidden"].includes(element.overflow) ? element.overflow : "visible",
    locked: Boolean(element.locked),
    hidden: Boolean(element.hidden),
    iconName: typeof element.iconName === "string" ? element.iconName : undefined,
  };
}

function nodeFromLegacy(element, elementId, nodeId, semanticType) {
  const style = legacyStyle(element);
  const defaults = semanticType ? defaultStyle(semanticType) : {};
  return {
    id: nodeId,
    elementId,
    x: element.x,
    y: element.y,
    w: Math.max(20, element.w),
    h: Math.max(20, element.h),
    rotation: Number.isFinite(element.rotation) ? element.rotation : 0,
    kind: element.kind === "arrow" || element.kind === "pen" ? "card" : element.kind,
    label: element.text,
    style: { ...defaults, ...style },
    groupId: element.groupId,
    parentId: element.parentId,
    points: element.points,
  };
}

function modelElementFromLegacy(element, type, elementId) {
  const style = legacyStyle(element);
  return {
    id: elementId,
    type,
    name: element.text || ELEMENT_BY_ID.get(type)?.name || type,
    documentation: element.detail || "",
    properties: validProperties(element.semanticProperties) ? clone(element.semanticProperties || {}) : {},
    extensions: record(element.semanticExtensions) ? clone(element.semanticExtensions) : {},
  };
}

function referenceToNode(rawId, nodeByRawId, nodeByModelId) {
  if (typeof rawId !== "string") return undefined;
  return nodeByRawId.get(rawId) || nodeByModelId.get(rawId);
}

function connectionFromLegacy(element, relationshipId, nodeByRawId, nodeByModelId) {
  const source = normalizeAnchor(element.sourceAnchor, element.id);
  const target = normalizeAnchor(element.targetAnchor, element.id);
  const sourceNodeId = referenceToNode(source?.elementId, nodeByRawId, nodeByModelId);
  const targetNodeId = referenceToNode(target?.elementId, nodeByRawId, nodeByModelId);
  return {
    id: element.viewConnectionId || `connection-${element.id}`,
    relationshipId,
    x: element.x,
    y: element.y,
    w: element.w,
    h: element.h,
    source: sourceNodeId
      ? { nodeId: sourceNodeId, side: source.side, offset: source.offset }
      : { x: element.x, y: element.y },
    target: targetNodeId
      ? { nodeId: targetNodeId, side: target.side, offset: target.offset }
      : { x: element.x + element.w, y: element.y + element.h },
    route: ROUTES.includes(element.route) ? element.route : "straight",
    waypoints: validWaypoints(element.waypoints) ? clone(element.waypoints) : [],
    label: element.text || "",
    sourceMultiplicity: normalizeMultiplicity(element.sourceMultiplicity),
    targetMultiplicity: normalizeMultiplicity(element.targetMultiplicity),
    style: legacyStyle(element),
  };
}

function migrateLegacyDocument(input, metadata = {}) {
  const rawElements = Array.isArray(input)
    ? input
    : Array.isArray(input?.elements)
      ? input.elements
      : [];
  const name = metadata.name || input?.name || "Untitled drawing";
  const document = createDocument(name, {
    documentation: metadata.documentation || input?.documentation,
    properties: metadata.properties || input?.properties,
  });
  const view = document.views[0];
  const nodeByRawId = new Map();
  const nodeByModelId = new Map();
  const normalized = [];
  const ids = new Set();
  for (let index = 0; index < rawElements.length && index < MAX_ELEMENTS; index += 1) {
    const candidate = rawElements[index];
    if (!record(candidate) || typeof candidate.id !== "string" || ids.has(candidate.id)) continue;
    ids.add(candidate.id);
    const element = clone(candidate);
    if (!validLegacyElement(element, new Set(), { skipIds: true })) continue;
    normalized.push(element);
    const type = normalizeType(element.archimateType || element.elementType || element.semanticType);
    if (type && element.kind !== "arrow") {
      const modelId = element.modelElementId || `model-${element.id}`;
      const nodeId = element.viewNodeId || `node-${element.id}`;
      const model = modelElementFromLegacy(element, type, modelId);
      document.model.elements[modelId] = model;
      view.nodes[nodeId] = nodeFromLegacy(element, modelId, nodeId, type);
      nodeByRawId.set(element.id, nodeId);
      nodeByModelId.set(modelId, nodeId);
      view.order.push(nodeId);
    }
  }
  for (const element of normalized) {
    const relationshipType = normalizeRelationshipType(
      element.relationshipType || element.archimateRelationship,
    );
    if (element.kind === "arrow" && relationshipType) {
      const sourceId = referenceToNode(element.sourceAnchor?.elementId, nodeByRawId, nodeByModelId);
      const targetId = referenceToNode(element.targetAnchor?.elementId, nodeByRawId, nodeByModelId);
      const sourceNode = sourceId ? view.nodes[sourceId] : undefined;
      const targetNode = targetId ? view.nodes[targetId] : undefined;
      const sourceModelId = sourceNode?.elementId;
      const targetModelId = targetNode?.elementId;
      if (sourceModelId && targetModelId) {
        const relationshipId = element.relationshipId || `relationship-${element.id}`;
        document.model.relationships[relationshipId] = {
          id: relationshipId,
          type: relationshipType,
          sourceId: sourceModelId,
          targetId: targetModelId,
          name: element.text || "",
          documentation: element.detail || "",
          properties: validProperties(element.semanticProperties) ? clone(element.semanticProperties || {}) : {},
          sourceMultiplicity: normalizeMultiplicity(element.sourceMultiplicity),
          targetMultiplicity: normalizeMultiplicity(element.targetMultiplicity),
          accessType: element.accessType,
          influenceStrength: element.influenceStrength,
        };
        const connection = connectionFromLegacy(element, relationshipId, nodeByRawId, nodeByModelId);
        view.connections[connection.id] = connection;
        view.order.push(connection.id);
        continue;
      }
    }
    if (view.nodes[`node-${element.id}`] || view.connections[`connection-${element.id}`]) continue;
    view.annotations[element.id] = {
      id: element.id,
      type: "legacy-drawing-element",
      element,
    };
    view.order.push(element.id);
  }
  document.extensions = {
    ...(document.extensions || {}),
    migration: {
      from: input?.schemaVersion === LEGACY_SCHEMA_VERSION ? "archint-json-v1" : "legacy-element-array",
      migratedAt: new Date().toISOString(),
      genericAnnotations: Object.keys(view.annotations).length,
    },
  };
  return document;
}

function ensureCanonicalDocument(input, metadata = {}) {
  if (
    record(input) &&
    input.app === DOCUMENT_APP &&
    input.format === DOCUMENT_FORMAT &&
    input.schemaVersion === DOCUMENT_SCHEMA_VERSION &&
    record(input.model) &&
    Array.isArray(input.views)
  ) {
    const document = clone(input);
    document.language = {
      name: "ArchiMate",
      version: ARCHIMATE_VERSION,
      specificationUrl: catalog.language.specificationUrl,
      authority: catalog.language.authority,
      ...(record(input.language) ? input.language : {}),
    };
    document.model.elements = normalizeCollection(document.model.elements);
    document.model.relationships = normalizeCollection(document.model.relationships);
    document.views = document.views.map((view) => normalizeView(view));
    if (!document.views.length) document.views = [createView()];
    document.activeViewId = document.views.some((view) => view.id === document.activeViewId)
      ? document.activeViewId
      : document.views[0].id;
    document.page = {
      width: document.views[0].width,
      height: document.views[0].height,
      background: document.views[0].background,
    };
    document.assets = record(document.assets) ? document.assets : {};
    document.extensions = record(document.extensions) ? document.extensions : {};
    return document;
  }
  return migrateLegacyDocument(input, metadata);
}

function normalizeCollection(value) {
  if (Array.isArray(value)) {
    return Object.fromEntries(value.filter((item) => record(item) && typeof item.id === "string").map((item) => [item.id, item]));
  }
  return record(value) ? value : {};
}

function normalizeView(view) {
  const normalized = record(view) ? clone(view) : createView();
  normalized.id = typeof normalized.id === "string" && normalized.id ? normalized.id : id("view");
  normalized.name = typeof normalized.name === "string" && normalized.name.trim() ? normalized.name.trim().slice(0, 100) : "Main view";
  normalized.documentation = text(normalized.documentation) ? normalized.documentation : "";
  normalized.width = finite(normalized.width, 10000) && normalized.width > 0 ? normalized.width : 1400;
  normalized.height = finite(normalized.height, 10000) && normalized.height > 0 ? normalized.height : 900;
  normalized.background = color(normalized.background);
  normalized.nodes = normalizeCollection(normalized.nodes);
  normalized.connections = normalizeCollection(normalized.connections);
  normalized.annotations = normalizeCollection(normalized.annotations);
  normalized.order = Array.isArray(normalized.order) ? normalized.order.filter((item) => typeof item === "string") : [];
  normalized.settings = record(normalized.settings) ? normalized.settings : {};
  return normalized;
}

function elementForNode(model, node) {
  const style = record(node.style) ? node.style : {};
  const base = {
    id: node.id,
    kind: ["card", "container", "text", "ellipse", "icon"].includes(node.kind) ? node.kind : "card",
    x: node.x,
    y: node.y,
    w: node.w,
    h: node.h,
    text: typeof node.label === "string" && node.label.length ? node.label : model.name,
    detail: model.documentation || "",
    fill: color(style.fill),
    stroke: color(style.stroke, "#7392b8"),
    fontSize: finite(style.fontSize, 80) ? style.fontSize : 16,
    rotation: finite(node.rotation, 3600) ? node.rotation : 0,
    groupId: node.groupId,
    parentId: node.parentId,
    locked: Boolean(style.locked),
    hidden: Boolean(style.hidden),
    strokeWidth: finite(style.strokeWidth, 100) ? style.strokeWidth : 1.5,
    fontWeight: [400, 500, 600, 700].includes(Number(style.fontWeight)) ? Number(style.fontWeight) : 600,
    lineHeight: finite(style.lineHeight, 3) ? style.lineHeight : 1.35,
    textAlign: TEXT_ALIGNS.includes(style.textAlign) ? style.textAlign : "left",
    wrap: style.wrap !== false,
    overflow: ["visible", "hidden"].includes(style.overflow) ? style.overflow : "visible",
    iconName: typeof style.iconName === "string" ? style.iconName : undefined,
    archimateType: model.type,
    modelElementId: model.id,
    viewNodeId: node.id,
    semanticProperties: record(model.properties) ? clone(model.properties) : {},
  };
  if (Array.isArray(node.points)) base.points = clone(node.points);
  return base;
}

function connectionElement(view, connection, relationship, nodes) {
  const sourceNode = connection.source?.nodeId ? nodes[connection.source.nodeId] : undefined;
  const targetNode = connection.target?.nodeId ? nodes[connection.target.nodeId] : undefined;
  const sourceAnchor = sourceNode && connection.source?.side
    ? { elementId: sourceNode.id, side: connection.source.side, offset: connection.source.offset ?? 0.5 }
    : undefined;
  const targetAnchor = targetNode && connection.target?.side
    ? { elementId: targetNode.id, side: connection.target.side, offset: connection.target.offset ?? 0.5 }
    : undefined;
  const style = record(connection.style) ? connection.style : {};
  return {
    id: connection.id,
    kind: "arrow",
    x: finite(connection.x) ? connection.x : 0,
    y: finite(connection.y) ? connection.y : 0,
    w: finite(connection.w) ? connection.w : 0,
    h: finite(connection.h) ? connection.h : 0,
    text: connection.label || relationship.name || "",
    detail: relationship.documentation || "",
    fill: color(style.fill),
    stroke: color(style.stroke, "#7392b8"),
    fontSize: finite(style.fontSize, 80) ? style.fontSize : 12,
    locked: Boolean(style.locked),
    hidden: Boolean(style.hidden),
    strokeWidth: finite(style.strokeWidth, 100) ? style.strokeWidth : 2.5,
    route: ROUTES.includes(connection.route) ? connection.route : "straight",
    waypoints: validWaypoints(connection.waypoints) ? clone(connection.waypoints) : [],
    arrowhead: style.arrowhead || relationshipMarkerToArrowhead(relationship.type),
    sourceAnchor,
    targetAnchor,
    relationshipType: relationship.type,
    relationshipId: relationship.id,
    sourceMultiplicity: connection.sourceMultiplicity || relationship.sourceMultiplicity,
    targetMultiplicity: connection.targetMultiplicity || relationship.targetMultiplicity,
    accessType: relationship.accessType,
    influenceStrength: relationship.influenceStrength,
  };
}

function relationshipMarkerToArrowhead(type) {
  if (["Composition", "Aggregation", "Association"].includes(type)) return "none";
  if (type === "Triggering") return "triangle";
  return "open";
}

function flattenedOrder(view) {
  const known = new Set();
  const order = [];
  for (const item of view.order || []) {
    if (typeof item !== "string" || known.has(item)) continue;
    if (view.nodes[item] || view.connections[item] || view.annotations[item]) {
      known.add(item);
      order.push(item);
    }
  }
  for (const collection of [view.annotations, view.nodes, view.connections]) {
    for (const item of Object.keys(collection || {})) {
      if (!known.has(item)) {
        known.add(item);
        order.push(item);
      }
    }
  }
  return order;
}

function flattenDocument(document, viewId = document.activeViewId) {
  const normalized = ensureCanonicalDocument(document);
  const view = normalized.views.find((candidate) => candidate.id === viewId) || normalized.views[0];
  const result = [];
  for (const itemId of flattenedOrder(view)) {
    if (view.annotations[itemId]?.element) {
      result.push(clone(view.annotations[itemId].element));
      continue;
    }
    const node = view.nodes[itemId];
    if (node) {
      const model = normalized.model.elements[node.elementId];
      if (model) result.push(elementForNode(model, node));
      continue;
    }
    const connection = view.connections[itemId];
    if (connection) {
      const relationship = normalized.model.relationships[connection.relationshipId];
      if (relationship) result.push(connectionElement(view, connection, relationship, view.nodes));
    }
  }
  return result;
}

function annotationFromElement(element) {
  return { id: element.id, type: "legacy-drawing-element", element: clone(element) };
}

function nodePatchFromElement(element, existing, modelId) {
  const next = nodeFromLegacy(element, modelId || existing?.elementId || element.modelElementId, element.viewNodeId || existing?.id || `node-${element.id}`, element.archimateType);
  next.id = element.viewNodeId || existing?.id || next.id;
  next.elementId = modelId || existing?.elementId || element.modelElementId;
  return next;
}

function connectionPatchFromElement(element, existing, relationshipId, view) {
  const source = normalizeAnchor(element.sourceAnchor, element.id);
  const target = normalizeAnchor(element.targetAnchor, element.id);
  const findNodeId = (anchor) => {
    if (!anchor) return undefined;
    if (view.nodes[anchor.elementId]) return anchor.elementId;
    return Object.values(view.nodes).find((node) => node.elementId === anchor.elementId)?.id;
  };
  return {
    ...(existing || {}),
    id: element.viewConnectionId || existing?.id || `connection-${element.id}`,
    relationshipId,
    x: element.x,
    y: element.y,
    w: element.w,
    h: element.h,
    source: findNodeId(source)
      ? { nodeId: findNodeId(source), side: source.side, offset: source.offset }
      : { x: element.x, y: element.y },
    target: findNodeId(target)
      ? { nodeId: findNodeId(target), side: target.side, offset: target.offset }
      : { x: element.x + element.w, y: element.y + element.h },
    route: ROUTES.includes(element.route) ? element.route : "straight",
    waypoints: validWaypoints(element.waypoints) ? clone(element.waypoints) : [],
    label: element.text || "",
    sourceMultiplicity: normalizeMultiplicity(element.sourceMultiplicity),
    targetMultiplicity: normalizeMultiplicity(element.targetMultiplicity),
    style: legacyStyle(element),
  };
}

function applyLegacyElements(document, elements, viewId = document.activeViewId) {
  const nextDocument = ensureCanonicalDocument(document);
  const view = nextDocument.views.find((candidate) => candidate.id === viewId) || nextDocument.views[0];
  const nextNodes = {};
  const nextConnections = {};
  const nextAnnotations = {};
  const nextOrder = [];
  const modelIdByFlatId = new Map();

  for (const element of Array.isArray(elements) ? elements : []) {
    if (!record(element) || typeof element.id !== "string") continue;
    const type = normalizeType(element.archimateType || element.elementType || element.semanticType);
    if (type && element.kind !== "arrow") {
      const existing = view.nodes[element.viewNodeId || element.id] || Object.values(view.nodes).find((node) => node.elementId === element.modelElementId);
      const modelId = element.modelElementId || existing?.elementId || `model-${element.id}`;
      const node = nodePatchFromElement(element, existing, modelId);
      nextNodes[node.id] = node;
      nextOrder.push(node.id);
      modelIdByFlatId.set(element.id, modelId);
      const existingModel = nextDocument.model.elements[modelId];
      nextDocument.model.elements[modelId] = {
        ...(existingModel || modelElementFromLegacy(element, type, modelId)),
        id: modelId,
        type,
        name: element.text || existingModel?.name || ELEMENT_BY_ID.get(type)?.name || type,
        documentation: element.detail || existingModel?.documentation || "",
        properties: validProperties(element.semanticProperties)
          ? clone(element.semanticProperties || {})
          : existingModel?.properties || {},
      };
    }
  }

  for (const element of Array.isArray(elements) ? elements : []) {
    if (!record(element) || typeof element.id !== "string") continue;
    const relationshipType = normalizeRelationshipType(element.relationshipType || element.archimateRelationship);
    if (element.kind === "arrow" && relationshipType) {
      const sourceFlatId = element.sourceAnchor?.elementId;
      const targetFlatId = element.targetAnchor?.elementId;
      const sourceId = modelIdByFlatId.get(sourceFlatId) || view.nodes[sourceFlatId]?.elementId;
      const targetId = modelIdByFlatId.get(targetFlatId) || view.nodes[targetFlatId]?.elementId;
      if (sourceId && targetId) {
        const relationshipId = element.relationshipId || view.connections[element.id]?.relationshipId || `relationship-${element.id}`;
        const existing = view.connections[element.viewConnectionId || element.id] || Object.values(view.connections).find((connection) => connection.relationshipId === relationshipId);
        nextDocument.model.relationships[relationshipId] = {
          ...(nextDocument.model.relationships[relationshipId] || {}),
          id: relationshipId,
          type: relationshipType,
          sourceId,
          targetId,
          name: element.text || "",
          documentation: element.detail || "",
          properties: validProperties(element.semanticProperties) ? clone(element.semanticProperties || {}) : {},
          sourceMultiplicity: normalizeMultiplicity(element.sourceMultiplicity),
          targetMultiplicity: normalizeMultiplicity(element.targetMultiplicity),
          accessType: element.accessType,
          influenceStrength: element.influenceStrength,
        };
        const connection = connectionPatchFromElement(element, existing, relationshipId, { ...view, nodes: nextNodes });
        nextConnections[connection.id] = connection;
        nextOrder.push(connection.id);
        continue;
      }
    }
    if (!normalizeType(element.archimateType || element.elementType || element.semanticType) || element.kind === "arrow") {
      const annotation = annotationFromElement(element);
      nextAnnotations[annotation.id] = annotation;
      nextOrder.push(annotation.id);
    }
  }
  view.nodes = nextNodes;
  view.connections = nextConnections;
  view.annotations = nextAnnotations;
  view.order = nextOrder;
  nextDocument.page = { width: view.width, height: view.height, background: view.background };
  return nextDocument;
}

function relationshipIsValid(sourceType, relationshipType, targetType) {
  const relationship = RELATIONSHIP_BY_ID.get(relationshipType);
  if (!relationship || !sourceType || !targetType || sourceType === targetType && relationshipType === "Specialization") return false;
  if (relationship.sourceTypes.includes("*") && relationship.targetTypes.includes("*")) return sourceType !== targetType || relationshipType !== "Composition";
  return (
    (relationship.sourceTypes.includes("*") || relationship.sourceTypes.includes(sourceType)) &&
    (relationship.targetTypes.includes("*") || relationship.targetTypes.includes(targetType))
  );
}

function validateLegacyElements(elements, options = {}) {
  if (!Array.isArray(elements) || elements.length > MAX_ELEMENTS) return ["elements must be an array with at most 2,000 items"];
  const ids = new Set();
  const errors = [];
  for (const element of elements) {
    if (!validLegacyElement(element, ids)) {
      errors.push(`invalid drawing element ${element?.id || "<unknown>"}`);
      continue;
    }
    ids.add(element.id);
  }
  for (const element of elements) {
    if (element.parentId && !ids.has(element.parentId)) errors.push(`invalid parent reference ${element.id}`);
    for (const anchor of [element.sourceAnchor, element.targetAnchor]) {
      if (anchor && (!ids.has(anchor.elementId) || anchor.elementId === element.id)) errors.push(`invalid connector reference ${element.id}`);
    }
  }
  return errors;
}

function validateCanonicalDocument(document) {
  const errors = [];
  if (!record(document)) return ["document must be an object"];
  if (document.app !== DOCUMENT_APP || document.format !== DOCUMENT_FORMAT || document.schemaVersion !== DOCUMENT_SCHEMA_VERSION) {
    errors.push("unsupported ArchInt document version");
  }
  if (!record(document.language) || document.language.name !== "ArchiMate" || document.language.version !== ARCHIMATE_VERSION) {
    errors.push("document must target ArchiMate 4.0");
  }
  if (!record(document.model) || typeof document.model.id !== "string" || !text(document.model.name, 100) || !text(document.model.documentation) || !validProperties(document.model.properties)) {
    errors.push("model identity, documentation, or properties are invalid");
  }
  if (!record(document.model?.elements) || Object.keys(document.model.elements).length > MAX_ELEMENTS) errors.push("model contains too many elements");
  if (!record(document.model?.relationships) || Object.keys(document.model.relationships).length > MAX_RELATIONSHIPS) errors.push("model contains too many relationships");
  if (!Array.isArray(document.views) || document.views.length === 0 || document.views.length > MAX_VIEWS) errors.push("document must contain between one and 100 views");
  const elementIds = new Set(Object.keys(document.model?.elements || {}));
  const relationIds = new Set(Object.keys(document.model?.relationships || {}));
  for (const [key, element] of Object.entries(document.model?.elements || {})) {
    const type = normalizeType(element?.type);
    if (key !== element?.id || !type || !text(element.name, 1000) || !text(element.documentation) || !validProperties(element.properties)) {
      errors.push(`invalid model element ${key}`);
      continue;
    }
    if (element.extensions !== undefined && !record(element.extensions)) errors.push(`invalid extensions on ${key}`);
  }
  for (const [key, relationship] of Object.entries(document.model?.relationships || {})) {
    const type = normalizeRelationshipType(relationship?.type);
    const source = document.model.elements[relationship?.sourceId];
    const target = document.model.elements[relationship?.targetId];
    if (
      key !== relationship?.id ||
      !type ||
      !source ||
      !target ||
      source.id === target.id ||
      !relationshipIsValid(source.type, type, target.type) ||
      !text(relationship.name, 1000) ||
      !text(relationship.documentation) ||
      !validProperties(relationship.properties) ||
      !validMultiplicity(relationship.sourceMultiplicity) ||
      !validMultiplicity(relationship.targetMultiplicity)
    ) {
      errors.push(`invalid relationship ${key}`);
    }
    if (relationship.accessType !== undefined && !["read", "write", "read-write", "unspecified"].includes(relationship.accessType)) errors.push(`invalid access type ${key}`);
    if (relationship.influenceStrength !== undefined && !["+", "++", "-", "--"].includes(relationship.influenceStrength)) errors.push(`invalid influence strength ${key}`);
  }
  const viewIds = new Set();
  for (const view of Array.isArray(document.views) ? document.views : []) {
    if (!record(view) || typeof view.id !== "string" || viewIds.has(view.id) || !text(view.name, 100) || !text(view.documentation) || !finite(view.width, 10000) || view.width <= 0 || !finite(view.height, 10000) || view.height <= 0 || !COLOR_PATTERN.test(view.background)) {
      errors.push(`invalid view ${view?.id || "<unknown>"}`);
      continue;
    }
    viewIds.add(view.id);
    if (!record(view.nodes) || !record(view.connections) || !record(view.annotations) || !Array.isArray(view.order)) {
      errors.push(`view ${view.id} collections are invalid`);
      continue;
    }
    const itemIds = new Set();
    for (const [nodeId, node] of Object.entries(view.nodes)) {
      if (nodeId !== node?.id || itemIds.has(nodeId) || !elementIds.has(node?.elementId) || !finite(node.x) || !finite(node.y) || !finite(node.w) || !finite(node.h) || node.w < 0 || node.h < 0 || !finite(node.rotation, 3600) || !record(node.style)) {
        errors.push(`invalid view node ${nodeId}`);
      }
      itemIds.add(nodeId);
    }
    for (const [connectionId, connection] of Object.entries(view.connections)) {
      const relationship = document.model.relationships[connection?.relationshipId];
      if (connectionId !== connection?.id || itemIds.has(connectionId) || !relationIds.has(connection?.relationshipId) || !relationship || !finite(connection.x) || !finite(connection.y) || !finite(connection.w) || !finite(connection.h) || !ROUTES.includes(connection.route) || !validWaypoints(connection.waypoints) || !validMultiplicity(connection.sourceMultiplicity) || !validMultiplicity(connection.targetMultiplicity)) {
        errors.push(`invalid view connection ${connectionId}`);
      }
      if (connection.source?.nodeId && !view.nodes[connection.source.nodeId]) errors.push(`invalid source node ${connectionId}`);
      if (connection.target?.nodeId && !view.nodes[connection.target.nodeId]) errors.push(`invalid target node ${connectionId}`);
      itemIds.add(connectionId);
    }
    for (const [annotationId, annotation] of Object.entries(view.annotations)) {
      if (annotationId !== annotation?.id || itemIds.has(annotationId) || annotation.type !== "legacy-drawing-element" || !validLegacyElement(annotation.element, new Set(), { skipIds: true })) errors.push(`invalid view annotation ${annotationId}`);
      itemIds.add(annotationId);
    }
    for (const item of view.order) if (typeof item !== "string" || !itemIds.has(item)) errors.push(`invalid view order in ${view.id}`);
  }
  if (!viewIds.has(document.activeViewId)) errors.push("active view does not exist");
  if (!record(document.assets) || !record(document.extensions)) errors.push("document extensions or assets are invalid");
  return [...new Set(errors)];
}

function validateDocument(input, metadata = {}) {
  const document = ensureCanonicalDocument(input, metadata);
  return { document, errors: validateCanonicalDocument(document), valid: validateCanonicalDocument(document).length === 0 };
}

function assertValidDocument(input, metadata = {}) {
  const result = validateDocument(input, metadata);
  if (!result.valid) throw new Error(result.errors.join("; "));
  return result.document;
}

function canonicalDocumentForDrawing(input) {
  let document = ensureCanonicalDocument(input.document || input, {
    name: input.name,
    documentation: input.documentation,
    properties: input.properties,
  });
  if (input.document && Array.isArray(input.elements)) {
    document = applyLegacyElements(document, input.elements, document.activeViewId);
  }
  const result = validateDocument(document);
  if (!result.valid) return { document, errors: result.errors };
  return { document, errors: [] };
}

function isDocumentLike(value) {
  return record(value) && (value.format === DOCUMENT_FORMAT || Array.isArray(value.elements) || value.schemaVersion === LEGACY_SCHEMA_VERSION);
}

module.exports = {
  ANCHOR_SIDES,
  ARCHIMATE_VERSION,
  ARCHIMATE_CATALOG: catalog,
  ARROWHEADS,
  COLOR_PATTERN,
  DOCUMENT_APP,
  DOCUMENT_FORMAT,
  DOCUMENT_SCHEMA_VERSION,
  ELEMENT_BY_ID,
  ELEMENT_TYPES: catalog.elements.map((element) => element.id),
  LEGACY_KINDS,
  MAX_DOCUMENT_BYTES,
  MAX_ELEMENTS,
  MAX_RELATIONSHIPS,
  MAX_VIEWS,
  RELATIONSHIP_BY_ID,
  RELATIONSHIP_TYPES: catalog.relationships.map((relationship) => relationship.id),
  applyLegacyElements,
  assertValidDocument,
  canonicalDocumentForDrawing,
  clone,
  createDocument,
  createView,
  defaultStyle,
  ensureCanonicalDocument,
  flattenDocument,
  id,
  isDocumentLike,
  migrateLegacyDocument,
  normalizeMultiplicity,
  normalizeRelationshipType,
  normalizeType,
  relationshipIsValid,
  validateCanonicalDocument,
  validateDocument,
  validateLegacyElements,
};
