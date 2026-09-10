import {
  ARCHIMATE_CATALOG,
  ARCHIMATE_VERSION,
  createDocument,
  createView,
  defaultStyle,
  ensureCanonicalDocument,
  isArchimateElementType,
  normalizeMultiplicity,
  relationshipAllowed,
  validateDocument,
  type ArchimateDocument,
  type ArchimateElementType,
  type ArchimateRelationshipType,
  type ArchimateView,
  type ViewConnection,
  type ViewNode,
} from "../model/archimate";
import type { AnchorSide, Element as LegacyElement } from "../diagram";

export type ArchimateFileFormat = "archint-json" | "open-group-exchange" | "unknown";

export type FileDetection = {
  format: ArchimateFileFormat;
  languageVersion?: string;
  filename: string;
  errors: string[];
};

export type ArchimateFileResult = {
  document: ArchimateDocument;
  format: ArchimateFileFormat;
  languageVersion?: string;
  errors: string[];
  warnings: string[];
};

export type ArchimateExportResult = {
  content: string;
  format: ArchimateFileFormat;
  extension: ".archimate" | ".xml";
  warnings: string[];
  errors: string[];
};

const EXCHANGE_NAMESPACE = "http://www.opengroup.org/xsd/archimate";
const EXCHANGE_VERSIONS = ["3.1", "3.2"];
const EXTENSION_NAMESPACE = "https://archint.local/ns/archimate";
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_XML_NODES = 50000;
const MAX_XML_DEPTH = 100;
const MAX_TEXT = 10000;
const TYPES_TO_EXCHANGE: Record<string, string> = {
  Role: "BusinessRole",
  Collaboration: "BusinessCollaboration",
  Path: "TechnologyPath",
  Service: "BusinessService",
  Process: "BusinessProcess",
  Function: "BusinessFunction",
  Event: "BusinessEvent",
};

const elementAliases = new Map<string, ArchimateElementType>();
for (const item of ARCHIMATE_CATALOG.elements) {
  elementAliases.set(item.id, item.id as ArchimateElementType);
  for (const alias of item.legacyAliases || []) elementAliases.set(alias, item.id as ArchimateElementType);
}

const relationshipAliases = new Map<string, ArchimateRelationshipType>();
for (const item of ARCHIMATE_CATALOG.relationships) relationshipAliases.set(item.id, item.id as ArchimateRelationshipType);
relationshipAliases.set("Serves", "Serving");
relationshipAliases.set("Triggers", "Triggering");
relationshipAliases.set("AssociationRelationship", "Association");

type XmlElement = globalThis.Element;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function localName(value: string): string {
  return value.replace(/^.*:/, "").toLowerCase();
}

function textOf(node: XmlElement | null | undefined): string {
  return node?.textContent?.trim() || "";
}

function attr(node: XmlElement | null | undefined, names: string[]): string | undefined {
  if (!node) return undefined;
  const wanted = names.map(localName);
  for (const item of Array.from(node.attributes)) if (wanted.includes(localName(item.name))) return item.value;
  return undefined;
}

function children(node: XmlElement | null | undefined, names: string[]): XmlElement[] {
  const wanted = names.map(localName);
  return node ? Array.from(node.children).filter((child) => wanted.includes(localName(child.tagName))) : [];
}

function firstChild(node: XmlElement | null | undefined, names: string[]): XmlElement | undefined {
  return children(node, names)[0];
}

function descendants(node: XmlElement | null | undefined, names: string[]): XmlElement[] {
  if (!node) return [];
  const wanted = names.map(localName);
  return Array.from(node.querySelectorAll("*"))
    .filter((candidate) => wanted.includes(localName(candidate.tagName)));
}

function valueOf(node: XmlElement | null | undefined, names: string[], attrs: string[] = []): string {
  return attr(node, attrs) || textOf(firstChild(node, names));
}

function numberOf(node: XmlElement | null | undefined, names: string[], attrs: string[], fallback: number): number {
  const raw = valueOf(node, names, attrs);
  const value = Number(raw);
  return raw !== "" && Number.isFinite(value) ? value : fallback;
}

function collectionItems(root: XmlElement, collectionNames: string[], itemNames: string[]): XmlElement[] {
  const collection = descendants(root, collectionNames)[0];
  return collection ? descendants(collection, itemNames) : children(root, itemNames);
}

function typeFor(value: string | undefined): ArchimateElementType | undefined {
  if (!value) return undefined;
  return elementAliases.get(value.replace(/^.*:/, ""));
}

function relationshipTypeFor(value: string | undefined): ArchimateRelationshipType | undefined {
  if (!value) return undefined;
  const short = value.replace(/^.*:/, "").replace(/Relationship$/, "");
  return relationshipAliases.get(short);
}

function safeColor(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  if (/^#[0-9a-f]{3}$/i.test(value)) return `#${value.slice(1).split("").map((item) => item + item).join("")}`;
  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function parseProperties(node: XmlElement): Record<string, string> {
  const result: Record<string, string> = {};
  const wrapper = firstChild(node, ["properties", "propertyList"]);
  for (const property of descendants(wrapper, ["property"])) {
    const key = attr(property, ["key", "name", "identifier"]) || textOf(firstChild(property, ["key", "name", "identifier"]));
    const value = attr(property, ["value"]) || textOf(firstChild(property, ["value", "text"]));
    if (key && key.length <= 200 && value.length <= 5000) result[key] = value;
  }
  return result;
}

function parseJsonExtension(node: XmlElement | undefined): Record<string, unknown> | undefined {
  if (!node) return undefined;
  try {
    const parsed: unknown = JSON.parse(textOf(node));
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function parseJsonArray(node: XmlElement | undefined): unknown[] | undefined {
  if (!node) return undefined;
  try {
    const parsed: unknown = JSON.parse(textOf(node));
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function styleFor(node: XmlElement, type: ArchimateElementType): Partial<LegacyElement> {
  const source = firstChild(node, ["style", "appearance", "format"]) || node;
  const defaults = defaultStyle(type);
  return {
    ...defaults,
    fill: safeColor(attr(source, ["fill", "fillColor", "background", "backgroundColor"]), String(defaults.fill || "#edf3fc")),
    stroke: safeColor(attr(source, ["stroke", "lineColor", "borderColor"]), String(defaults.stroke || "#7392b8")),
    fontSize: numberOf(source, ["fontSize"], ["fontSize"], Number(defaults.fontSize || 16)),
    strokeWidth: numberOf(source, ["strokeWidth", "lineWidth"], ["strokeWidth", "lineWidth"], Number(defaults.strokeWidth || 1.5)),
    locked: attr(source, ["locked"]) === "true",
    hidden: attr(source, ["hidden"]) === "true",
  };
}

function boundsFor(node: XmlElement): { x: number; y: number; w: number; h: number } {
  const bounds = firstChild(node, ["bounds", "position", "geometry", "rectangle"]) || node;
  return {
    x: numberOf(bounds, ["x"], ["x", "left"], 0),
    y: numberOf(bounds, ["y"], ["y", "top"], 0),
    w: numberOf(bounds, ["width", "w"], ["width", "w"], 180),
    h: numberOf(bounds, ["height", "h"], ["height", "h"], 80),
  };
}

function shapeKind(type: ArchimateElementType): LegacyElement["kind"] {
  if (["Event", "AndJunction", "OrJunction"].includes(type)) return "ellipse";
  if (["Grouping", "Location", "Product", "Plateau"].includes(type)) return "container";
  return "card";
}

function sideFor(source: ViewNode, target: ViewNode): AnchorSide {
  const sx = source.x + source.w / 2;
  const sy = source.y + source.h / 2;
  const tx = target.x + target.w / 2;
  const ty = target.y + target.h / 2;
  if (Math.abs(tx - sx) >= Math.abs(ty - sy)) return tx >= sx ? "right" : "left";
  return ty >= sy ? "bottom" : "top";
}

function parseVersion(root: XmlElement, source: string): string {
  const explicit = attr(root, ["version", "formatVersion", "modelVersion", "exchangeVersion"]);
  if (explicit) return explicit;
  const match = source.match(/(?:^|[^\d])(4\.0|3\.1|3\.2)(?:[^\d]|$)/);
  return match?.[1] || "3.2";
}

function parseXml(source: string): { root?: XmlElement; version?: string; errors: string[] } {
  if (new TextEncoder().encode(source).length > MAX_BYTES) return { errors: ["file exceeds the 5 MB limit"] };
  if (/<!doctype|<!entity|\b(?:system|public)\s+["']/i.test(source)) return { errors: ["XML document uses a forbidden external entity or doctype"] };
  const parsed = new DOMParser().parseFromString(source, "application/xml");
  if (parsed.getElementsByTagName("parsererror").length) return { errors: ["XML document is not well formed"] };
  const root = parsed.documentElement;
  if (!root) return { errors: ["XML document has no root element"] };
  if (parsed.getElementsByTagName("*").length > MAX_XML_NODES) return { errors: ["XML document exceeds the node complexity limit"] };
  let depth = 0;
  const walk = (node: XmlElement, current: number) => {
    depth = Math.max(depth, current);
    for (const child of Array.from(node.children)) walk(child, current + 1);
  };
  walk(root, 1);
  if (depth > MAX_XML_DEPTH) return { errors: ["XML document exceeds the nesting limit"] };
  return { root, version: parseVersion(root, source), errors: [] };
}

export function detectArchimateFileFormat(source: string, filename = ""): FileDetection {
  const result: FileDetection = { format: "unknown", languageVersion: undefined, filename, errors: [] };
  const trimmed = source.trimStart();
  if (!trimmed) return { ...result, errors: ["file is empty"] };
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      const payload = isRecord(parsed) && isRecord(parsed.document) ? parsed.document : parsed;
      if (isRecord(payload) && (payload.format === "archint-archimate" || Array.isArray(payload.elements) || payload.schemaVersion === 1)) {
        const language = isRecord(payload.language) && typeof payload.language.version === "string" ? payload.language.version : undefined;
        return { ...result, format: "archint-json", languageVersion: language || (payload.schemaVersion === 1 ? "legacy" : "4.0") };
      }
      return { ...result, errors: ["JSON is not an ArchInt or legacy ArchInt document"] };
    } catch {
      return { ...result, errors: ["selected file is not valid JSON"] };
    }
  }
  if (trimmed.startsWith("<")) {
    const parsed = parseXml(source);
    if (parsed.errors.length || !parsed.root) return { ...result, errors: parsed.errors };
    const version = parsed.version || "3.2";
    const errors = ["model", "archimatemodel", "archimate-model"].includes(localName(parsed.root.tagName)) ? [] : ["XML root is not an ArchiMate model"];
    if (!EXCHANGE_VERSIONS.includes(version)) errors.push(`unsupported Open Group exchange version ${version}`);
    return { ...result, format: "open-group-exchange", languageVersion: version, errors };
  }
  return { ...result, errors: [`unrecognized ${filename || "file"} content`] };
}

function parseNative(source: string, filename: string): ArchimateFileResult {
  try {
    const parsed: unknown = JSON.parse(source);
    const payload = isRecord(parsed) && isRecord(parsed.document) ? parsed.document : parsed;
    if (!isRecord(payload) && !Array.isArray(payload)) throw new Error("JSON does not contain a document");
    const metadata = isRecord(parsed) && isRecord(parsed.drawing) ? parsed.drawing : undefined;
    const document = ensureCanonicalDocument(payload, { name: typeof metadata?.name === "string" ? metadata.name : filename || "Imported drawing" });
    const validation = validateDocument(document);
    const warnings = isRecord(payload) && payload.format !== "archint-archimate" ? ["Imported legacy ArchInt JSON; the document was migrated to the ArchiMate 4.0 model contract."] : [];
    return { document: validation.document, format: "archint-json", languageVersion: document.language.version, errors: validation.errors, warnings };
  } catch (error) {
    return { document: createDocument(filename || "Imported drawing"), format: "archint-json", languageVersion: ARCHIMATE_VERSION, errors: [error instanceof Error ? error.message : "invalid JSON"], warnings: [] };
  }
}

function parseExchange(source: string, filename: string, root: XmlElement, version: string): ArchimateFileResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const document = createDocument(valueOf(root, ["name", "title"], ["name"]) || filename || "Imported ArchiMate model");
  document.extensions = { sourceFormat: "open-group-exchange", sourceLanguageVersion: version, importedXml: { root: root.tagName, namespace: attr(root, ["xmlns"]) } };
  const rootExtension = parseJsonExtension(firstChild(root, ["extensions"]));
  if (rootExtension) document.extensions = { ...document.extensions, ...rootExtension };
  const elements: Record<string, ArchimateDocument["model"]["elements"][string]> = {};
  const elementIds = new Map<string, string>();
  for (const [index, node] of collectionItems(root, ["elements", "modelElements"], ["element", "modelElement", "concept"]).entries()) {
    const rawId = attr(node, ["identifier", "id", "uuid"]) || `imported-element-${index + 1}`;
    const elementId = elements[rawId] ? `${rawId}-${index + 1}` : rawId;
    if (elementId !== rawId) warnings.push(`duplicate element identifier ${rawId} was renamed to ${elementId}`);
    elementIds.set(rawId, elementId);
    const originalType = attr(node, ["type4", "xsi:type", "type", "elementType", "conceptType"]) || valueOf(node, ["type"], ["type"]);
    const type = typeFor(originalType) || "Grouping";
    const extensions: Record<string, unknown> = {};
    if (!typeFor(originalType)) {
      warnings.push(`unsupported element type ${originalType || "<missing>"} was represented as Grouping`);
      extensions.importedType = originalType || "";
    }
    const importedExtension = parseJsonExtension(firstChild(node, ["extensions"]));
    if (importedExtension) Object.assign(extensions, importedExtension);
    elements[elementId] = {
      id: elementId,
      type,
      name: (valueOf(node, ["name", "label", "title"], ["name", "label"]) || `${type} ${index + 1}`).slice(0, 1000),
      documentation: valueOf(node, ["documentation", "description", "doc"], ["documentation", "description"]).slice(0, MAX_TEXT),
      properties: parseProperties(node),
      extensions: Object.keys(extensions).length ? extensions : undefined,
    };
  }
  document.model.elements = elements;
  const relationships: Record<string, ArchimateDocument["model"]["relationships"][string]> = {};
  const relationshipIds = new Map<string, string>();
  for (const [index, node] of collectionItems(root, ["relationships", "relations"], ["relationship", "relation"]).entries()) {
    const rawId = attr(node, ["identifier", "id", "uuid"]) || `imported-relationship-${index + 1}`;
    const relationshipId = relationships[rawId] ? `${rawId}-${index + 1}` : rawId;
    if (relationshipId !== rawId) warnings.push(`duplicate relationship identifier ${rawId} was renamed to ${relationshipId}`);
    relationshipIds.set(rawId, relationshipId);
    const sourceRaw = attr(node, ["source", "sourceRef", "sourceId"]) || textOf(firstChild(node, ["source", "sourceRef"]));
    const targetRaw = attr(node, ["target", "targetRef", "targetId"]) || textOf(firstChild(node, ["target", "targetRef"]));
    const sourceId = elementIds.get(sourceRaw) || sourceRaw;
    const targetId = elementIds.get(targetRaw) || targetRaw;
    if (!elements[sourceId] || !elements[targetId]) {
      errors.push(`relationship ${relationshipId} references a missing endpoint`);
      continue;
    }
    const originalType = attr(node, ["type4", "xsi:type", "type", "relationshipType"]) || valueOf(node, ["type"], ["type"]);
    let type = relationshipTypeFor(originalType) || "Association";
    const extensions: Record<string, unknown> = {};
    if (!relationshipTypeFor(originalType)) {
      warnings.push(`unsupported relationship type ${originalType || "<missing>"} was represented as Association`);
      extensions.importedType = originalType || "";
    }
    if (!relationshipAllowed(elements[sourceId].type, type, elements[targetId].type)) {
      warnings.push(`relationship ${relationshipId} is not valid for ArchiMate 4.0 endpoints; it was represented as Association`);
      extensions.validationFallback = type;
      type = "Association";
    }
    const qualifier = firstChild(node, ["qualifiers"]);
    const accessType = attr(node, ["accessType", "access-type"]) || attr(qualifier, ["accessType", "access-type"]);
    const influenceStrength = attr(node, ["influenceStrength", "influence-strength"]) || attr(qualifier, ["influenceStrength", "influence-strength"]);
    const importedExtension = parseJsonExtension(firstChild(node, ["extensions"]));
    if (importedExtension) Object.assign(extensions, importedExtension);
    relationships[relationshipId] = {
      id: relationshipId,
      type,
      sourceId,
      targetId,
      name: valueOf(node, ["name", "label", "title"], ["name", "label"]).slice(0, 1000),
      documentation: valueOf(node, ["documentation", "description", "doc"], ["documentation", "description"]).slice(0, MAX_TEXT),
      properties: parseProperties(node),
      sourceMultiplicity: normalizeMultiplicity(valueOf(node, ["sourceMultiplicity"], ["sourceMultiplicity", "source-multiplicity"])),
      targetMultiplicity: normalizeMultiplicity(valueOf(node, ["targetMultiplicity"], ["targetMultiplicity", "target-multiplicity"])),
      accessType: ["read", "write", "read-write", "unspecified"].includes(accessType || "") ? accessType as ArchimateDocument["model"]["relationships"][string]["accessType"] : undefined,
      influenceStrength: ["+", "++", "-", "--"].includes(influenceStrength || "") ? influenceStrength as ArchimateDocument["model"]["relationships"][string]["influenceStrength"] : undefined,
      extensions: Object.keys(extensions).length ? extensions : undefined,
    };
  }
  document.model.relationships = relationships;

  const viewNodes = collectionItems(root, ["views", "diagrams", "viewpoints"], ["view", "diagram", "viewpoint"]);
  const parsedViews: ArchimateView[] = [];
  for (const [viewIndex, sourceView] of viewNodes.entries()) {
    const view = createView(valueOf(sourceView, ["name", "title"], ["name", "label"]) || `View ${viewIndex + 1}`, { id: attr(sourceView, ["identifier", "id", "uuid"]) || `view-${viewIndex + 1}` });
    view.documentation = valueOf(sourceView, ["documentation", "description"], ["documentation", "description"]).slice(0, MAX_TEXT);
    const width = numberOf(sourceView, ["width"], ["width"], 0);
    const height = numberOf(sourceView, ["height"], ["height"], 0);
    const nodes: Record<string, ViewNode> = {};
    const rawNodeIds = new Map<string, string>();
    let maxX = 0;
    let maxY = 0;
    for (const [nodeIndex, node] of collectionItems(sourceView, ["nodes", "children", "objects"], ["node", "child", "object", "viewnode"]).entries()) {
      const rawNodeId = attr(node, ["identifier", "id", "uuid"]) || `node-${viewIndex + 1}-${nodeIndex + 1}`;
      const nodeId = nodes[rawNodeId] ? `${rawNodeId}-${nodeIndex + 1}` : rawNodeId;
      const rawElementId = attr(node, ["elementRef", "element", "elementId", "modelElement", "modelElementId", "ref"]);
      const elementId = elementIds.get(rawElementId || "") || rawElementId || "";
      const model = document.model.elements[elementId];
      if (!model) {
        warnings.push(`view ${view.id} node ${rawNodeId} references an unknown element and was skipped`);
        continue;
      }
      const bounds = boundsFor(node);
      nodes[nodeId] = {
        id: nodeId,
        elementId,
        x: bounds.x,
        y: bounds.y,
        w: Math.max(20, bounds.w),
        h: Math.max(20, bounds.h),
        rotation: numberOf(node, ["rotation", "angle"], ["rotation", "angle"], 0),
        kind: shapeKind(model.type),
        label: valueOf(node, ["label", "name", "text"], ["label", "name"]) || model.name,
        style: styleFor(node, model.type),
        parentId: attr(node, ["parentRef", "parent", "parentId"]),
      };
      rawNodeIds.set(rawNodeId, nodeId);
      view.order.push(nodeId);
      maxX = Math.max(maxX, bounds.x + bounds.w);
      maxY = Math.max(maxY, bounds.y + bounds.h);
    }
    view.nodes = nodes;
    for (const [connectionIndex, node] of collectionItems(sourceView, ["connections", "edges", "relationships"], ["connection", "edge", "connector", "relationship"]).entries()) {
      const connectionId = attr(node, ["identifier", "id", "uuid"]) || `connection-${viewIndex + 1}-${connectionIndex + 1}`;
      const rawSource = attr(node, ["source", "sourceRef", "sourceId"]) || textOf(firstChild(node, ["source", "sourceRef"]));
      const rawTarget = attr(node, ["target", "targetRef", "targetId"]) || textOf(firstChild(node, ["target", "targetRef"]));
      const sourceId = rawNodeIds.get(rawSource) || rawSource;
      const targetId = rawNodeIds.get(rawTarget) || rawTarget;
      const source = nodes[sourceId];
      const target = nodes[targetId];
      if (!source || !target) {
        errors.push(`view connection ${connectionId} references a missing node`);
        continue;
      }
      const rawRelationshipId = attr(node, ["relationshipRef", "relationship", "relationshipId", "ref"]);
      let relationshipId = relationshipIds.get(rawRelationshipId || "") || rawRelationshipId || "";
      if (!relationships[relationshipId]) {
        relationshipId = `relationship-${connectionId}`;
        let type = relationshipTypeFor(attr(node, ["type4", "xsi:type", "type", "relationshipType"])) || "Association";
        if (!relationshipAllowed(document.model.elements[source.elementId].type, type, document.model.elements[target.elementId].type)) type = "Association";
        relationships[relationshipId] = { id: relationshipId, type, sourceId: source.elementId, targetId: target.elementId, name: valueOf(node, ["name", "label"], ["name", "label"]), documentation: "", properties: {}, extensions: { synthetic: true } };
        warnings.push(`view connection ${connectionId} had no model relationship; a synthetic Association was created`);
      }
      const relationship = relationships[relationshipId];
      const points = descendants(firstChild(node, ["bendpoints", "waypoints", "points"]), ["point", "bendpoint", "waypoint"]);
      const waypoints = points.map((point) => ({ x: numberOf(point, ["x"], ["x"], 0), y: numberOf(point, ["y"], ["y"], 0) }));
      const bounds = boundsFor(node);
      const sourceSide = (attr(node, ["sourceSide"]) || sideFor(source, target)) as AnchorSide;
      const targetSide = (attr(node, ["targetSide"]) || sideFor(target, source)) as AnchorSide;
      const connection: ViewConnection = {
        id: connectionId,
        relationshipId: relationship.id,
        x: bounds.x,
        y: bounds.y,
        w: bounds.w,
        h: bounds.h,
        source: { nodeId: source.id, side: ["top", "right", "bottom", "left"].includes(sourceSide) ? sourceSide : "right", offset: Number(attr(node, ["sourceOffset"])) || 0.5 },
        target: { nodeId: target.id, side: ["top", "right", "bottom", "left"].includes(targetSide) ? targetSide : "left", offset: Number(attr(node, ["targetOffset"])) || 0.5 },
        route: attr(node, ["route"]) === "orthogonal" ? "orthogonal" : "straight",
        waypoints,
        label: valueOf(node, ["label", "name", "text"], ["label", "name"]) || relationship.name || "",
        sourceMultiplicity: normalizeMultiplicity(valueOf(node, ["sourceMultiplicity"], ["sourceMultiplicity"])),
        targetMultiplicity: normalizeMultiplicity(valueOf(node, ["targetMultiplicity"], ["targetMultiplicity"])),
        style: styleFor(node, "Grouping"),
      };
      view.connections[connectionId] = connection;
      view.order.push(connectionId);
      maxX = Math.max(maxX, bounds.x + bounds.w);
      maxY = Math.max(maxY, bounds.y + bounds.h);
    }
    const annotationJson = parseJsonArray(firstChild(sourceView, ["annotations"]));
    if (annotationJson) {
      for (const item of annotationJson) {
        if (isRecord(item) && typeof item.id === "string" && isRecord(item.element)) {
          view.annotations[item.id] = item as unknown as ArchimateView["annotations"][string];
          view.order.push(item.id);
        }
      }
    }
    view.width = width > 0 ? width : Math.max(1400, maxX + 80);
    view.height = height > 0 ? height : Math.max(900, maxY + 80);
    const background = attr(sourceView, ["background", "backgroundColor"]);
    if (background) view.background = safeColor(background, view.background);
    parsedViews.push(view);
  }
  if (parsedViews.length) document.views = parsedViews;
  else {
    const view = document.views[0];
    let index = 0;
    for (const model of Object.values(document.model.elements)) {
      const style = defaultStyle(model.type);
      const nodeId = `node-${model.id}`;
      view.nodes[nodeId] = { id: nodeId, elementId: model.id, x: 80 + (index % 4) * 250, y: 80 + Math.floor(index / 4) * 130, w: 210, h: 86, rotation: 0, kind: shapeKind(model.type), label: model.name, style };
      view.order.push(nodeId);
      index += 1;
    }
  }
  const organization = descendants(root, ["organizations", "organization"])[0];
  const organizationJson = organization ? textOf(firstChild(organization, ["json"])) : "";
  if (organizationJson) {
    try {
      const parsedOrganization: unknown = JSON.parse(organizationJson);
      if (Array.isArray(parsedOrganization)) document.model.organization = parsedOrganization;
    } catch {
      warnings.push("the organization extension could not be decoded");
    }
  }
  document.activeViewId = document.views[0].id;
  document.page = { width: document.views[0].width, height: document.views[0].height, background: document.views[0].background };
  const validation = validateDocument(document);
  return { document: validation.document, format: "open-group-exchange", languageVersion: version, errors: [...errors, ...validation.errors], warnings: [...new Set(warnings)] };
}

export function parseArchimateFile(source: string, filename = ""): ArchimateFileResult {
  if (new TextEncoder().encode(source).length > MAX_BYTES) return { document: createDocument(filename || "Imported drawing"), format: "unknown", errors: ["file exceeds the 5 MB limit"], warnings: [] };
  const detection = detectArchimateFileFormat(source, filename);
  if (detection.errors.length) return { document: createDocument(filename || "Imported drawing"), format: detection.format, languageVersion: detection.languageVersion, errors: detection.errors, warnings: [] };
  if (detection.format === "archint-json") return parseNative(source, filename);
  const parsed = parseXml(source);
  if (!parsed.root || parsed.errors.length) return { document: createDocument(filename || "Imported drawing"), format: detection.format, languageVersion: detection.languageVersion, errors: parsed.errors, warnings: [] };
  return parseExchange(source, filename, parsed.root, detection.languageVersion || "3.2");
}

function xmlEscape(value: unknown): string {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function cdata(value: unknown): string {
  return `<![CDATA[${String(value ?? "").replace(/\]\]>/g, "]]]]><![CDATA[>")}]]>`;
}

function xmlAttrs(values: Record<string, unknown>): string {
  return Object.entries(values).filter(([, value]) => value !== undefined && value !== null && value !== "").map(([key, value]) => ` ${key}="${xmlEscape(value)}"`).join("");
}

function serializedProperties(properties: Record<string, string> | undefined, indent: string): string[] {
  if (!properties || !Object.keys(properties).length) return [];
  return [`${indent}<properties>`, ...Object.entries(properties).map(([key, value]) => `${indent}  <property key="${xmlEscape(key)}" value="${xmlEscape(value)}"/>`), `${indent}</properties>`];
}

export function serializeOpenGroupExchange(documentInput: ArchimateDocument, languageVersion: "3.1" | "3.2" = "3.2"): { content: string; warnings: string[] } {
  const document = ensureCanonicalDocument(documentInput);
  const validation = validateDocument(document);
  if (!validation.valid) throw new Error(validation.errors.join("; "));
  const warnings: string[] = [];
  const genericTypes = Object.values(document.model.elements).filter((element) => TYPES_TO_EXCHANGE[element.type]);
  if (genericTypes.length) warnings.push(`Generic ArchiMate 4.0 types use the closest ${languageVersion} exchange aliases: ${[...new Set(genericTypes.map((element) => element.type))].join(", ")}.`);
  if (Object.values(document.views).some((view) => Object.keys(view.annotations).length)) warnings.push("Generic annotations are retained in an ArchInt extension and may be ignored by other tools.");
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<model${xmlAttrs({ xmlns: EXCHANGE_NAMESPACE, "xmlns:archimate": EXCHANGE_NAMESPACE, "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance", "xmlns:archint": EXTENSION_NAMESPACE, version: languageVersion, "archint:sourceLanguageVersion": ARCHIMATE_VERSION })}>`,
    `  <name>${xmlEscape(document.model.name)}</name>`,
    ...(document.model.documentation ? [`  <documentation>${xmlEscape(document.model.documentation)}</documentation>`] : []),
    "  <elements>",
  ];
  for (const element of Object.values(document.model.elements)) {
    lines.push(`    <element${xmlAttrs({ identifier: element.id, "xsi:type": `archimate:${TYPES_TO_EXCHANGE[element.type] || element.type}`, "archint:type4": element.type })}>`, `      <name>${xmlEscape(element.name)}</name>`);
    if (element.documentation) lines.push(`      <documentation>${xmlEscape(element.documentation)}</documentation>`);
    lines.push(...serializedProperties(element.properties, "      "));
    if (element.extensions) lines.push(`      <archint:extensions>${cdata(JSON.stringify(element.extensions))}</archint:extensions>`);
    lines.push("    </element>");
  }
  lines.push("  </elements>", "  <relationships>");
  for (const relationship of Object.values(document.model.relationships)) {
    lines.push(`    <relationship${xmlAttrs({ identifier: relationship.id, "xsi:type": `archimate:${relationship.type}Relationship`, "archint:type4": relationship.type, source: relationship.sourceId, target: relationship.targetId })}>`);
    if (relationship.name) lines.push(`      <name>${xmlEscape(relationship.name)}</name>`);
    if (relationship.documentation) lines.push(`      <documentation>${xmlEscape(relationship.documentation)}</documentation>`);
    if (relationship.sourceMultiplicity) lines.push(`      <sourceMultiplicity>${xmlEscape(relationship.sourceMultiplicity)}</sourceMultiplicity>`);
    if (relationship.targetMultiplicity) lines.push(`      <targetMultiplicity>${xmlEscape(relationship.targetMultiplicity)}</targetMultiplicity>`);
    lines.push(...serializedProperties(relationship.properties, "      "));
    if (relationship.accessType || relationship.influenceStrength) lines.push(`      <archint:qualifiers${xmlAttrs({ accessType: relationship.accessType, influenceStrength: relationship.influenceStrength })}/>`);
    if (relationship.extensions) lines.push(`      <archint:extensions>${cdata(JSON.stringify(relationship.extensions))}</archint:extensions>`);
    lines.push("    </relationship>");
  }
  lines.push("  </relationships>", "  <views>");
  for (const view of document.views) {
    lines.push(`    <view${xmlAttrs({ identifier: view.id, "xsi:type": "archimate:Diagram", width: view.width, height: view.height, background: view.background })}>`, `      <name>${xmlEscape(view.name)}</name>`);
    if (view.documentation) lines.push(`      <documentation>${xmlEscape(view.documentation)}</documentation>`);
    lines.push("      <nodes>");
    for (const node of Object.values(view.nodes)) lines.push(`        <node${xmlAttrs({ identifier: node.id, elementRef: node.elementId, parentRef: node.parentId, x: node.x, y: node.y, width: node.w, height: node.h, rotation: node.rotation, fill: node.style.fill, stroke: node.style.stroke, fontSize: node.style.fontSize })}>${node.label ? `<label>${xmlEscape(node.label)}</label>` : ""}</node>`);
    lines.push("      </nodes>", "      <connections>");
    for (const connection of Object.values(view.connections)) {
      lines.push(`        <connection${xmlAttrs({ identifier: connection.id, relationshipRef: connection.relationshipId, source: "nodeId" in connection.source ? connection.source.nodeId : undefined, target: "nodeId" in connection.target ? connection.target.nodeId : undefined, route: connection.route, label: connection.label, sourceMultiplicity: connection.sourceMultiplicity, targetMultiplicity: connection.targetMultiplicity })}>`);
      if (connection.waypoints.length) lines.push("          <bendpoints>", ...connection.waypoints.map((point) => `            <point${xmlAttrs(point)}/>`), "          </bendpoints>");
      lines.push("        </connection>");
    }
    lines.push("      </connections>");
    if (Object.keys(view.annotations).length) lines.push(`      <archint:annotations>${cdata(JSON.stringify(Object.values(view.annotations)))}</archint:annotations>`);
    lines.push("    </view>");
  }
  lines.push("  </views>");
  if (document.extensions && Object.keys(document.extensions).length) lines.push(`  <archint:extensions>${cdata(JSON.stringify(document.extensions))}</archint:extensions>`);
  lines.push("</model>");
  return { content: lines.join("\n"), warnings: [...new Set(warnings)] };
}

export function serializeArchimateFile(documentInput: ArchimateDocument, options: { format?: "native" | "open-group-exchange"; category?: string; languageVersion?: "3.1" | "3.2" } = {}): ArchimateExportResult {
  const document = ensureCanonicalDocument(documentInput);
  const validation = validateDocument(document);
  const format = options.format || "native";
  if (!validation.valid) return { content: "", format: format === "open-group-exchange" ? "open-group-exchange" : "archint-json", extension: format === "open-group-exchange" ? ".xml" : ".archimate", warnings: [], errors: validation.errors };
  if (format === "open-group-exchange") {
    try {
      const exported = serializeOpenGroupExchange(document, options.languageVersion || "3.2");
      const structural = validateOpenGroupExchangeXml(exported.content);
      if (!structural.valid) return { content: "", format, extension: ".xml", warnings: exported.warnings, errors: structural.errors };
      const reopened = parseArchimateFile(exported.content, "exported.xml");
      return reopened.errors.length === 0
        ? { content: exported.content, format, extension: ".xml", warnings: exported.warnings, errors: [] }
        : { content: "", format, extension: ".xml", warnings: exported.warnings, errors: reopened.errors };
    } catch (error) {
      return { content: "", format, extension: ".xml", warnings: [], errors: [error instanceof Error ? error.message : "could not create exchange file"] };
    }
  }
  return {
    content: JSON.stringify({ ...document, exportedAt: new Date().toISOString(), drawing: { name: document.model.name, category: options.category || "Architecture" } }, null, 2),
    format: "archint-json",
    extension: ".archimate",
    warnings: [],
    errors: [],
  };
}

export function validateOpenGroupExchangeXml(source: string): { valid: boolean; version?: string; errors: string[] } {
  const parsed = parseXml(source);
  if (parsed.errors.length || !parsed.root) return { valid: false, version: parsed.version, errors: parsed.errors };
  const errors = ["model", "archimatemodel", "archimate-model"].includes(localName(parsed.root.tagName)) ? [] : ["XML root is not an ArchiMate model"];
  if (!EXCHANGE_VERSIONS.includes(parsed.version || "")) errors.push(`unsupported Open Group exchange version ${parsed.version}`);
  return { valid: errors.length === 0, version: parsed.version, errors };
}
