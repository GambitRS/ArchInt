const {
  ARCHIMATE_CATALOG,
  ARCHIMATE_VERSION,
  MAX_DOCUMENT_BYTES,
  applyLegacyElements,
  clone,
  createDocument,
  createView,
  defaultStyle,
  ensureCanonicalDocument,
  id,
  normalizeMultiplicity,
  normalizeRelationshipType,
  normalizeType,
  relationshipIsValid,
  validateDocument,
} = require("../shared/archimate-model");

const EXCHANGE_NAMESPACE = "http://www.opengroup.org/xsd/archimate";
const EXCHANGE_VERSIONS = ["3.1", "3.2"];
const MAX_XML_NODES = 50000;
const MAX_XML_DEPTH = 100;
const MAX_XML_TEXT = 10000;
const EXCHANGE_EXTENSION_NAMESPACE = "https://archint.local/ns/archimate";

const TYPE_TO_EXCHANGE = {
  Role: "BusinessRole",
  Collaboration: "BusinessCollaboration",
  Path: "TechnologyPath",
  Service: "BusinessService",
  Process: "BusinessProcess",
  Function: "BusinessFunction",
  Event: "BusinessEvent",
};

const XML_ENTITY = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  quot: '"',
};

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asText(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function localName(value) {
  return asText(value).replace(/^.*:/, "").toLowerCase();
}

function decodeEntities(value) {
  return asText(value).replace(/&(#x[0-9a-f]+|#\d+|[a-z][\w.-]*);/gi, (full, entity) => {
    const normalized = entity.toLowerCase();
    if (XML_ENTITY[normalized]) return XML_ENTITY[normalized];
    if (normalized.startsWith("#x")) {
      const code = Number.parseInt(normalized.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(Math.min(code, 0x10ffff)) : full;
    }
    if (normalized.startsWith("#")) {
      const code = Number.parseInt(normalized.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(Math.min(code, 0x10ffff)) : full;
    }
    return full;
  });
}

function parseTag(source) {
  let cursor = 0;
  while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
  const nameStart = cursor;
  while (cursor < source.length && !/[\s/>]/.test(source[cursor])) cursor += 1;
  const name = source.slice(nameStart, cursor);
  if (!name) throw new Error("XML tag name is missing");
  const attrs = {};
  while (cursor < source.length) {
    while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
    if (cursor >= source.length) break;
    if (source[cursor] === "/") {
      cursor += 1;
      continue;
    }
    const attrStart = cursor;
    while (cursor < source.length && !/[\s=/>]/.test(source[cursor])) cursor += 1;
    const attrName = source.slice(attrStart, cursor);
    while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
    if (source[cursor] !== "=") throw new Error(`XML attribute ${attrName || "<unknown>"} is missing =`);
    cursor += 1;
    while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
    const quote = source[cursor];
    if (quote !== '"' && quote !== "'") throw new Error(`XML attribute ${attrName} must be quoted`);
    cursor += 1;
    const valueStart = cursor;
    const end = source.indexOf(quote, cursor);
    if (end < 0) throw new Error(`XML attribute ${attrName} is unterminated`);
    attrs[attrName] = decodeEntities(source.slice(valueStart, end));
    cursor = end + 1;
  }
  return { name, attrs };
}

function findTagEnd(source, start) {
  let quote = "";
  for (let cursor = start; cursor < source.length; cursor += 1) {
    const character = source[cursor];
    if (quote) {
      if (character === quote) quote = "";
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return cursor;
    }
  }
  return -1;
}

function parseXml(source) {
  if (typeof source !== "string" || !source.trim()) throw new Error("XML document is empty");
  if (Buffer.byteLength(source, "utf8") > MAX_DOCUMENT_BYTES) throw new Error("XML document exceeds the 5 MB limit");
  if (/<!doctype|<!entity|\b(?:system|public)\b/i.test(source)) throw new Error("XML document uses a forbidden external entity or doctype");
  const root = { name: "#document", attrs: {}, children: [], text: "" };
  const stack = [root];
  let cursor = 0;
  let nodeCount = 1;
  while (cursor < source.length) {
    const open = source.indexOf("<", cursor);
    if (open < 0) {
      stack[stack.length - 1].text += decodeEntities(source.slice(cursor));
      break;
    }
    if (open > cursor) stack[stack.length - 1].text += decodeEntities(source.slice(cursor, open));
    if (source.startsWith("<!--", open)) {
      const end = source.indexOf("-->", open + 4);
      if (end < 0) throw new Error("XML comment is unterminated");
      cursor = end + 3;
      continue;
    }
    if (source.startsWith("<![CDATA[", open)) {
      const end = source.indexOf("]]>", open + 9);
      if (end < 0) throw new Error("XML CDATA is unterminated");
      stack[stack.length - 1].text += source.slice(open + 9, end);
      cursor = end + 3;
      continue;
    }
    if (source.startsWith("<?", open)) {
      const end = source.indexOf("?>", open + 2);
      if (end < 0) throw new Error("XML processing instruction is unterminated");
      cursor = end + 2;
      continue;
    }
    if (source.startsWith("<!", open)) throw new Error("XML declaration is not supported here");
    const close = findTagEnd(source, open + 1);
    if (close < 0) throw new Error("XML tag is unterminated");
    const body = source.slice(open + 1, close);
    if (body.trimStart().startsWith("/")) {
      const closingName = body.trim().slice(1).trim();
      const current = stack.pop();
      if (!current || localName(current.name) !== localName(closingName)) throw new Error(`XML closing tag ${closingName} does not match`);
    } else {
      const selfClosing = /\/\s*$/.test(body);
      const parsed = parseTag(selfClosing ? body.replace(/\/\s*$/, "") : body);
      const node = { name: parsed.name, attrs: parsed.attrs, children: [], text: "" };
      stack[stack.length - 1].children.push(node);
      nodeCount += 1;
      if (nodeCount > MAX_XML_NODES) throw new Error("XML document exceeds the node complexity limit");
      if (!selfClosing) {
        stack.push(node);
        if (stack.length > MAX_XML_DEPTH) throw new Error("XML document exceeds the nesting limit");
      }
    }
    cursor = close + 1;
  }
  if (stack.length !== 1) throw new Error("XML document has unclosed tags");
  const elements = root.children.filter((child) => !child.name.startsWith("#"));
  if (elements.length !== 1) throw new Error("XML document must contain exactly one root element");
  return elements[0];
}

function getAttr(node, names) {
  if (!node || !isRecord(node.attrs)) return undefined;
  const wanted = names.map(localName);
  for (const [key, value] of Object.entries(node.attrs)) {
    if (wanted.includes(localName(key))) return value;
  }
  return undefined;
}

function directChildren(node, names = []) {
  const wanted = names.map(localName);
  return (node?.children || []).filter((child) => wanted.length === 0 || wanted.includes(localName(child.name)));
}

function firstChild(node, names) {
  return directChildren(node, names)[0];
}

function descendants(node, names, output = []) {
  const wanted = names.map(localName);
  for (const child of node?.children || []) {
    if (wanted.length === 0 || wanted.includes(localName(child.name))) output.push(child);
    descendants(child, names, output);
  }
  return output;
}

function textOf(node) {
  if (!node) return "";
  return [node.text || "", ...(node.children || []).map(textOf)].join("").trim();
}

function valueOf(node, names, attrs = []) {
  const attribute = getAttr(node, attrs);
  if (attribute !== undefined) return attribute;
  return textOf(firstChild(node, names));
}

function numberOf(node, names = [], attrs = [], fallback = undefined) {
  const raw = valueOf(node, names, attrs);
  const value = Number(raw);
  return raw !== "" && Number.isFinite(value) ? value : fallback;
}

function collectionItems(root, collectionNames, itemNames) {
  const collection = descendants(root, collectionNames, [])[0];
  if (collection) return descendants(collection, itemNames, []);
  return directChildren(root, itemNames);
}

function nodeToObject(node, depth = 0) {
  if (!node || depth > 5) return undefined;
  const result = { name: node.name, attributes: { ...(node.attrs || {}) } };
  const text = (node.text || "").trim();
  if (text) result.text = text.slice(0, MAX_XML_TEXT);
  if (node.children?.length) result.children = node.children.slice(0, 100).map((child) => nodeToObject(child, depth + 1));
  return result;
}

function unknownXml(node, knownChildren = []) {
  const known = new Set(knownChildren.map(localName));
  const unknownChildren = (node.children || []).filter((child) => !known.has(localName(child.name)));
  if (!unknownChildren.length) return undefined;
  return {
    attributes: { ...(node.attrs || {}) },
    children: unknownChildren.slice(0, 50).map((child) => nodeToObject(child)),
  };
}

function parseProperties(node) {
  const result = {};
  const wrappers = directChildren(node, ["properties", "propertyList"]);
  const candidates = wrappers.flatMap((wrapper) => descendants(wrapper, ["property"], []));
  for (const property of candidates) {
    const key = valueOf(property, ["key", "name", "identifier"], ["key", "name", "identifier"]);
    const value = valueOf(property, ["value", "text"], ["value"]);
    if (key && key.length <= 200 && value.length <= 5000) result[key] = value;
  }
  return result;
}

function refValue(node, attrs, children) {
  return valueOf(node, children, attrs);
}

function shapeKind(type) {
  const definition = ARCHIMATE_CATALOG.elements.find((candidate) => candidate.id === type);
  if (["Event", "AndJunction", "OrJunction"].includes(type)) return "ellipse";
  if (["Grouping", "Location", "Product", "Plateau"].includes(type)) return "container";
  if (definition?.shape === "circle" || definition?.shape === "junction") return "ellipse";
  return "card";
}

function colorValue(value, fallback) {
  if (typeof value !== "string") return fallback;
  if (/^#[0-9a-f]{3}$/i.test(value)) return `#${value.slice(1).split("").map((item) => item + item).join("")}`;
  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function parsedStyle(node, type) {
  const styleNode = firstChild(node, ["style", "appearance", "format"]);
  const source = styleNode || node;
  const defaults = defaultStyle(type);
  const fill = getAttr(source, ["fill", "fillColor", "background", "backgroundColor"]);
  const stroke = getAttr(source, ["stroke", "lineColor", "borderColor"]);
  const fontSize = numberOf(source, ["fontSize"], ["fontSize"], defaults.fontSize);
  const strokeWidth = numberOf(source, ["strokeWidth", "lineWidth"], ["strokeWidth", "lineWidth"], defaults.strokeWidth);
  return {
    ...defaults,
    fill: colorValue(fill, defaults.fill),
    stroke: colorValue(stroke, defaults.stroke),
    fontSize,
    strokeWidth,
    locked: getAttr(source, ["locked"]) === "true",
    hidden: getAttr(source, ["hidden"]) === "true",
  };
}

function boundsOf(node) {
  const bounds = firstChild(node, ["bounds", "position", "geometry", "rectangle"]) || node;
  return {
    x: numberOf(bounds, ["x"], ["x", "left"], 0),
    y: numberOf(bounds, ["y"], ["y", "top"], 0),
    w: numberOf(bounds, ["width", "w"], ["width", "w"], 180),
    h: numberOf(bounds, ["height", "h"], ["height", "h"], 80),
  };
}

function sideFor(source, target) {
  if (!source || !target) return "right";
  const sourceCenter = { x: source.x + source.w / 2, y: source.y + source.h / 2 };
  const targetCenter = { x: target.x + target.w / 2, y: target.y + target.h / 2 };
  if (Math.abs(targetCenter.x - sourceCenter.x) >= Math.abs(targetCenter.y - sourceCenter.y)) return targetCenter.x >= sourceCenter.x ? "right" : "left";
  return targetCenter.y >= sourceCenter.y ? "bottom" : "top";
}

function parseVersion(root, source) {
  const explicit = getAttr(root, ["version", "formatVersion", "modelVersion", "exchangeVersion"]);
  const match = `${explicit || ""} ${source || ""}`.match(/(?:^|[^\d])(3\.1|3\.2)(?:[^\d]|$)/);
  return match?.[1] || (source.includes("3.1") ? "3.1" : "3.2");
}

function detectArchimateFileFormat(input, filename = "") {
  const source = Buffer.isBuffer(input) ? input.toString("utf8") : asText(input);
  const trimmed = source.trimStart();
  const result = { format: "unknown", languageVersion: undefined, filename, errors: [] };
  if (!trimmed) {
    result.errors.push("file is empty");
    return result;
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      const payload = isRecord(parsed) && isRecord(parsed.document) ? parsed.document : parsed;
      if (isRecord(payload) && (payload.format === "archint-archimate" || Array.isArray(payload.elements) || payload.schemaVersion === 1)) {
        result.format = "archint-json";
        result.languageVersion = payload.language?.version || (payload.schemaVersion === 1 ? "legacy" : "4.0");
      } else {
        result.errors.push("JSON is not an ArchInt or legacy ArchInt document");
      }
    } catch (error) {
      result.errors.push(`invalid JSON: ${error.message}`);
    }
    return result;
  }
  if (trimmed.startsWith("<")) {
    try {
      const root = parseXml(source);
      const version = parseVersion(root, source);
      result.format = "open-group-exchange";
      result.languageVersion = version;
      if (!EXCHANGE_VERSIONS.includes(version)) result.errors.push(`unsupported Open Group exchange version ${version}`);
      if (!["model", "archimatemodel", "archimate-model"].includes(localName(root.name))) result.errors.push("XML root is not an ArchiMate model");
    } catch (error) {
      result.errors.push(error.message);
    }
    return result;
  }
  result.errors.push(`unrecognized ${filename || "file"} content`);
  return result;
}

function parseNativeJson(source, filename, warnings) {
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    return { document: createDocument(filename || "Imported drawing"), errors: [`invalid JSON: ${error.message}`], warnings };
  }
  const payload = isRecord(parsed) && isRecord(parsed.document) ? parsed.document : parsed;
  const metadata = isRecord(parsed?.drawing) ? parsed.drawing : parsed;
  if (!isRecord(payload) && !Array.isArray(payload)) return { document: createDocument(filename || "Imported drawing"), errors: ["JSON does not contain a document"], warnings };
  if (isRecord(payload) && payload.format !== "archint-archimate") warnings.push("Imported legacy ArchInt JSON; the document was migrated to the ArchiMate 4.0 model contract.");
  const document = ensureCanonicalDocument(payload, { name: metadata?.name || filename || "Imported drawing" });
  const validation = validateDocument(document);
  return { document: validation.document, errors: validation.errors, warnings };
}

function parseOpenGroupExchange(source, filename, root, version) {
  const warnings = [];
  const errors = [];
  const document = createDocument(valueOf(root, ["name", "title"], ["name"]) || filename || "Imported ArchiMate model");
  document.extensions = {
    ...(document.extensions || {}),
    sourceFormat: "open-group-exchange",
    sourceLanguageVersion: version,
    importedXml: { root: root.name, namespace: getAttr(root, ["xmlns"]), attributes: { ...(root.attrs || {}) } },
  };
  const modelElements = {};
  const rawElementIds = new Map();
  const elementNodes = collectionItems(root, ["elements", "modelelements"], ["element", "modelelement", "concept"]);
  elementNodes.forEach((node, index) => {
    const rawId = getAttr(node, ["identifier", "id", "uuid"]) || `imported-element-${index + 1}`;
    let elementId = rawId;
    if (modelElements[elementId]) {
      elementId = `${rawId}-${index + 1}`;
      warnings.push(`duplicate element identifier ${rawId} was renamed to ${elementId}`);
    }
    if (!rawElementIds.has(rawId)) rawElementIds.set(rawId, elementId);
    const originalType = getAttr(node, ["xsi:type", "type", "elementType", "conceptType"]) || valueOf(node, ["type"], ["type"]);
    const type = normalizeType(originalType) || "Grouping";
    const name = valueOf(node, ["name", "label", "title"], ["name", "label"]) || `${type} ${index + 1}`;
    const extensions = {};
    if (!normalizeType(originalType)) {
      warnings.push(`unsupported element type ${originalType || "<missing>"} was represented as Grouping`);
      extensions.importedType = originalType || "";
    }
    const unknown = unknownXml(node, ["name", "label", "title", "documentation", "properties", "propertyList", "type"]);
    if (unknown) extensions.importedXml = unknown;
    modelElements[elementId] = {
      id: elementId,
      type,
      name: name.slice(0, 1000),
      documentation: valueOf(node, ["documentation", "description", "doc"], ["documentation", "description"]).slice(0, MAX_XML_TEXT),
      properties: parseProperties(node),
      extensions: Object.keys(extensions).length ? extensions : undefined,
    };
  });
  document.model.elements = modelElements;

  const rawRelationIds = new Map();
  const relationships = {};
  const relationNodes = collectionItems(root, ["relationships", "relations"], ["relationship", "relation"]);
  relationNodes.forEach((node, index) => {
    const rawId = getAttr(node, ["identifier", "id", "uuid"]) || `imported-relationship-${index + 1}`;
    let relationId = rawId;
    if (relationships[relationId]) {
      relationId = `${rawId}-${index + 1}`;
      warnings.push(`duplicate relationship identifier ${rawId} was renamed to ${relationId}`);
    }
    if (!rawRelationIds.has(rawId)) rawRelationIds.set(rawId, relationId);
    const sourceRaw = refValue(node, ["source", "sourceRef", "sourceId", "elementRef"], ["source", "sourceRef"]);
    const targetRaw = refValue(node, ["target", "targetRef", "targetId"], ["target", "targetRef"]);
    const sourceId = rawElementIds.get(sourceRaw) || sourceRaw;
    const targetId = rawElementIds.get(targetRaw) || targetRaw;
    if (!modelElements[sourceId] || !modelElements[targetId]) {
      errors.push(`relationship ${relationId} references a missing endpoint`);
      return;
    }
    const originalType = getAttr(node, ["xsi:type", "type", "relationshipType"]) || valueOf(node, ["type"], ["type"]);
    let type = normalizeRelationshipType(originalType) || "Association";
    const relationExtensions = {};
    if (!normalizeRelationshipType(originalType)) {
      warnings.push(`unsupported relationship type ${originalType || "<missing>"} was represented as Association`);
      relationExtensions.importedType = originalType || "";
    }
    if (!relationshipIsValid(modelElements[sourceId].type, type, modelElements[targetId].type)) {
      warnings.push(`relationship ${relationId} is not valid for ArchiMate 4.0 endpoints; it was represented as Association`);
      relationExtensions.validationFallback = type;
      type = "Association";
    }
    const unknown = unknownXml(node, ["name", "label", "title", "documentation", "properties", "propertyList", "type", "source", "target", "sourceRef", "targetRef", "sourceMultiplicity", "targetMultiplicity"]);
    if (unknown) relationExtensions.importedXml = unknown;
    const qualifier = firstChild(node, ["qualifiers"]);
    const accessType = getAttr(node, ["accessType", "access-type"]) || getAttr(qualifier, ["accessType", "access-type"]);
    const influenceStrength = getAttr(node, ["influenceStrength", "influence-strength"]) || getAttr(qualifier, ["influenceStrength", "influence-strength"]);
    relationships[relationId] = {
      id: relationId,
      type,
      sourceId,
      targetId,
      name: valueOf(node, ["name", "label", "title"], ["name", "label"]).slice(0, 1000),
      documentation: valueOf(node, ["documentation", "description", "doc"], ["documentation", "description"]).slice(0, MAX_XML_TEXT),
      properties: parseProperties(node),
      sourceMultiplicity: normalizeMultiplicity(valueOf(node, ["sourceMultiplicity"], ["sourceMultiplicity", "source-multiplicity"])),
      targetMultiplicity: normalizeMultiplicity(valueOf(node, ["targetMultiplicity"], ["targetMultiplicity", "target-multiplicity"])),
      accessType: ["read", "write", "read-write", "unspecified"].includes(accessType) ? accessType : undefined,
      influenceStrength: ["+", "++", "-", "--"].includes(influenceStrength) ? influenceStrength : undefined,
      extensions: Object.keys(relationExtensions).length ? relationExtensions : undefined,
    };
  });
  document.model.relationships = relationships;

  const viewNodesById = new Map();
  const parsedViews = [];
  const viewNodes = collectionItems(root, ["views", "diagrams", "viewpoints"], ["view", "diagram", "viewpoint"]);
  for (let viewIndex = 0; viewIndex < viewNodes.length; viewIndex += 1) {
    const sourceView = viewNodes[viewIndex];
    const rawViewId = getAttr(sourceView, ["identifier", "id", "uuid"]) || `view-${viewIndex + 1}`;
    const view = createView(valueOf(sourceView, ["name", "title"], ["name", "label"]) || `View ${viewIndex + 1}`, { id: rawViewId });
    view.documentation = valueOf(sourceView, ["documentation", "description"], ["documentation", "description"]).slice(0, MAX_XML_TEXT);
    const viewWidth = numberOf(sourceView, ["width"], ["width"], undefined);
    const viewHeight = numberOf(sourceView, ["height"], ["height"], undefined);
    const nodes = {};
    const rawViewNodes = new Map();
    const nodeCandidates = collectionItems(sourceView, ["nodes", "children", "objects"], ["node", "child", "object", "viewnode"]);
    let maxX = 0;
    let maxY = 0;
    nodeCandidates.forEach((node, nodeIndex) => {
      const viewNodeId = getAttr(node, ["identifier", "id", "uuid"]) || `node-${viewIndex + 1}-${nodeIndex + 1}`;
      const rawElementId = getAttr(node, ["elementRef", "element", "elementId", "modelElement", "modelElementId", "ref"]);
      const elementId = rawElementIds.get(rawElementId) || rawElementId;
      if (!modelElements[elementId]) {
        warnings.push(`view ${view.id} node ${viewNodeId} references an unknown element and was skipped`);
        return;
      }
      let nodeId = viewNodeId;
      if (nodes[nodeId]) nodeId = `${viewNodeId}-${nodeIndex + 1}`;
      const bounds = boundsOf(node);
      const model = modelElements[elementId];
      const viewNode = {
        id: nodeId,
        elementId,
        x: bounds.x,
        y: bounds.y,
        w: Math.max(20, bounds.w),
        h: Math.max(20, bounds.h),
        rotation: numberOf(node, ["rotation", "angle"], ["rotation", "angle"], 0),
        kind: shapeKind(model.type),
        label: valueOf(node, ["label", "name", "text"], ["label", "name"]) || model.name,
        style: parsedStyle(node, model.type),
        parentId: getAttr(node, ["parentRef", "parent", "parentId"]),
      };
      nodes[nodeId] = viewNode;
      rawViewNodes.set(viewNodeId, nodeId);
      view.order.push(nodeId);
      maxX = Math.max(maxX, bounds.x + bounds.w);
      maxY = Math.max(maxY, bounds.y + bounds.h);
    });
    view.nodes = nodes;
    viewNodesById.set(view.id, rawViewNodes);
    const connectionCandidates = collectionItems(sourceView, ["connections", "edges", "relationships"], ["connection", "edge", "connector", "relationship"]);
    connectionCandidates.forEach((node, connectionIndex) => {
      const connectionId = getAttr(node, ["identifier", "id", "uuid"]) || `connection-${viewIndex + 1}-${connectionIndex + 1}`;
      const rawRelationshipId = getAttr(node, ["relationshipRef", "relationship", "relationshipId", "ref"]);
      const relationshipId = rawRelationIds.get(rawRelationshipId) || rawRelationshipId;
      const rawSource = refValue(node, ["source", "sourceRef", "sourceId"], ["source", "sourceRef"]);
      const rawTarget = refValue(node, ["target", "targetRef", "targetId"], ["target", "targetRef"]);
      const sourceId = rawViewNodes.get(rawSource) || rawSource;
      const targetId = rawViewNodes.get(rawTarget) || rawTarget;
      const sourceNode = nodes[sourceId];
      const targetNode = nodes[targetId];
      if (!sourceNode || !targetNode) {
        errors.push(`view connection ${connectionId} references a missing node`);
        return;
      }
      let resolvedRelationshipId = relationshipId;
      if (!relationships[resolvedRelationshipId]) {
        const syntheticType = normalizeRelationshipType(getAttr(node, ["xsi:type", "type", "relationshipType"])) || "Association";
        resolvedRelationshipId = `relationship-${connectionId}`;
        relationships[resolvedRelationshipId] = {
          id: resolvedRelationshipId,
          type: syntheticType,
          sourceId: sourceNode.elementId,
          targetId: targetNode.elementId,
          name: valueOf(node, ["name", "label"], ["name", "label"]),
          documentation: "",
          properties: {},
          extensions: { importedXml: { missingRelationshipRef: rawRelationshipId || "" } },
        };
        warnings.push(`view connection ${connectionId} had no model relationship; a synthetic Association was created`);
      }
      const relationship = relationships[resolvedRelationshipId];
      const points = descendants(firstChild(node, ["bendpoints", "waypoints", "points"]), ["point", "bendpoint", "waypoint"], []);
      const waypoints = points.map((point) => ({ x: numberOf(point, ["x"], ["x"], 0), y: numberOf(point, ["y"], ["y"], 0) }));
      const bounds = boundsOf(node);
      view.connections[connectionId] = {
        id: connectionId,
        relationshipId: relationship.id,
        x: bounds.x,
        y: bounds.y,
        w: bounds.w,
        h: bounds.h,
        source: {
          nodeId: sourceId,
          side: getAttr(node, ["sourceSide"]) || sideFor(sourceNode, targetNode),
          offset: Number(getAttr(node, ["sourceOffset"])) || 0.5,
        },
        target: {
          nodeId: targetId,
          side: getAttr(node, ["targetSide"]) || sideFor(targetNode, sourceNode),
          offset: Number(getAttr(node, ["targetOffset"])) || 0.5,
        },
        route: getAttr(node, ["route"]) === "orthogonal" ? "orthogonal" : "straight",
        waypoints,
        label: valueOf(node, ["label", "name", "text"], ["label", "name"]) || relationship.name || "",
        sourceMultiplicity: normalizeMultiplicity(valueOf(node, ["sourceMultiplicity"], ["sourceMultiplicity"])),
        targetMultiplicity: normalizeMultiplicity(valueOf(node, ["targetMultiplicity"], ["targetMultiplicity"])),
        style: parsedStyle(node, "Grouping"),
      };
      view.order.push(connectionId);
      maxX = Math.max(maxX, bounds.x + bounds.w);
      maxY = Math.max(maxY, bounds.y + bounds.h);
    });
    view.width = viewWidth && viewWidth > 0 ? viewWidth : Math.max(1400, maxX + 80);
    view.height = viewHeight && viewHeight > 0 ? viewHeight : Math.max(900, maxY + 80);
    const background = getAttr(sourceView, ["background", "backgroundColor"]);
    if (background) view.background = colorValue(background, view.background);
    parsedViews.push(view);
  }
  if (!parsedViews.length) {
    const view = document.views[0];
    let index = 0;
    for (const model of Object.values(modelElements)) {
      const style = defaultStyle(model.type);
      const nodeId = `node-${model.id}`;
      view.nodes[nodeId] = {
        id: nodeId,
        elementId: model.id,
        x: 80 + (index % 4) * 250,
        y: 80 + Math.floor(index / 4) * 130,
        w: 210,
        h: 86,
        rotation: 0,
        kind: shapeKind(model.type),
        label: model.name,
        style,
      };
      view.order.push(nodeId);
      index += 1;
    }
  } else {
    document.views = parsedViews;
  }
  const organization = descendants(root, ["organizations", "organization"], [])[0];
  if (organization) document.model.organization = descendants(organization, ["item", "folder", "group"], []).map((item) => ({
    id: getAttr(item, ["identifier", "id"]),
    elementId: getAttr(item, ["elementRef", "elementRefId", "ref"]),
    name: valueOf(item, ["name", "label"], ["name", "label"]),
    children: [],
  }));
  document.activeViewId = document.views[0].id;
  document.page = { width: document.views[0].width, height: document.views[0].height, background: document.views[0].background };
  const validation = validateDocument(document);
  return { document: validation.document, errors: [...errors, ...validation.errors], warnings: unique(warnings) };
}

function parseArchimateFile(input, filename = "") {
  const source = Buffer.isBuffer(input) ? input.toString("utf8") : asText(input);
  if (Buffer.byteLength(source, "utf8") > MAX_DOCUMENT_BYTES) return { document: createDocument(filename || "Imported drawing"), format: "unknown", languageVersion: undefined, errors: ["file exceeds the 5 MB limit"], warnings: [] };
  const detection = detectArchimateFileFormat(source, filename);
  if (detection.errors.length) return { document: createDocument(filename || "Imported drawing"), format: detection.format, languageVersion: detection.languageVersion, errors: detection.errors, warnings: [] };
  if (detection.format === "archint-json") {
    const parsed = parseNativeJson(source, filename, []);
    return { ...parsed, format: detection.format, languageVersion: parsed.document.language.version };
  }
  try {
    const root = parseXml(source);
    const parsed = parseOpenGroupExchange(source, filename, root, detection.languageVersion);
    return { ...parsed, format: detection.format, languageVersion: detection.languageVersion };
  } catch (error) {
    return { document: createDocument(filename || "Imported drawing"), format: detection.format, languageVersion: detection.languageVersion, errors: [error.message], warnings: [] };
  }
}

function xmlEscape(value) {
  return asText(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function cdata(value) {
  return `<![CDATA[${asText(value).replace(/\]\]>/g, "]]]]><![CDATA[>")}]]>`;
}

function attrs(values) {
  return Object.entries(values).filter(([, value]) => value !== undefined && value !== null && value !== "").map(([key, value]) => ` ${key}="${xmlEscape(String(value))}"`).join("");
}

function serializeProperties(properties, indent) {
  if (!isRecord(properties) || !Object.keys(properties).length) return "";
  return `${indent}<properties>\n${Object.entries(properties).map(([key, value]) => `${indent}  <property key="${xmlEscape(key)}" value="${xmlEscape(String(value))}"/>`).join("\n")}\n${indent}</properties>\n`;
}

function exchangeType(type) {
  return TYPE_TO_EXCHANGE[type] || type;
}

function serializeOpenGroupExchange(input, options = {}) {
  const version = String(options.languageVersion || "3.2");
  if (!EXCHANGE_VERSIONS.includes(version)) throw new Error(`unsupported Open Group exchange version ${version}`);
  const document = ensureCanonicalDocument(input);
  const validation = validateDocument(document);
  if (!validation.valid) throw new Error(validation.errors.join("; "));
  const warnings = [];
  const unsupportedTypes = [];
  for (const element of Object.values(document.model.elements)) {
    if (TYPE_TO_EXCHANGE[element.type]) unsupportedTypes.push(element.type);
  }
  if (unsupportedTypes.length) warnings.push(`Generic ArchiMate 4.0 types use the closest 3.x exchange aliases: ${unique(unsupportedTypes).join(", ")}.`);
  if (Object.values(document.views).some((view) => Object.keys(view.annotations).length)) warnings.push("Generic annotations are retained in an ArchInt extension and may be ignored by other tools.");
  if (Object.values(document.model.relationships).some((relationship) => relationship.sourceMultiplicity || relationship.targetMultiplicity || relationship.accessType || relationship.influenceStrength)) warnings.push("ArchInt multiplicities and relationship qualifiers are retained in an ArchInt extension for 3.x exchange consumers.");
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<model${attrs({
      xmlns: EXCHANGE_NAMESPACE,
      "xmlns:archimate": EXCHANGE_NAMESPACE,
      "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
      "xmlns:archint": EXCHANGE_EXTENSION_NAMESPACE,
      version,
      "archint:sourceLanguageVersion": ARCHIMATE_VERSION,
    })}>`,
    `  <name>${xmlEscape(document.model.name)}</name>`,
    document.model.documentation ? `  <documentation>${xmlEscape(document.model.documentation)}</documentation>` : "",
    "  <elements>",
  ];
  for (const element of Object.values(document.model.elements)) {
    lines.push(`    <element${attrs({ identifier: element.id, "xsi:type": `archimate:${exchangeType(element.type)}`, "archint:type4": element.type })}>`);
    lines.push(`      <name>${xmlEscape(element.name)}</name>`);
    if (element.documentation) lines.push(`      <documentation>${xmlEscape(element.documentation)}</documentation>`);
    const properties = serializeProperties(element.properties, "      ");
    if (properties) lines.push(properties.trimEnd());
    if (element.extensions) lines.push(`      <archint:extensions>${cdata(JSON.stringify(element.extensions))}</archint:extensions>`);
    lines.push("    </element>");
  }
  lines.push("  </elements>", "  <relationships>");
  for (const relationship of Object.values(document.model.relationships)) {
    lines.push(`    <relationship${attrs({ identifier: relationship.id, "xsi:type": `archimate:${relationship.type}Relationship`, source: relationship.sourceId, target: relationship.targetId, "archint:type4": relationship.type })}>`);
    if (relationship.name) lines.push(`      <name>${xmlEscape(relationship.name)}</name>`);
    if (relationship.documentation) lines.push(`      <documentation>${xmlEscape(relationship.documentation)}</documentation>`);
    if (relationship.sourceMultiplicity) lines.push(`      <sourceMultiplicity>${xmlEscape(relationship.sourceMultiplicity)}</sourceMultiplicity>`);
    if (relationship.targetMultiplicity) lines.push(`      <targetMultiplicity>${xmlEscape(relationship.targetMultiplicity)}</targetMultiplicity>`);
    const properties = serializeProperties(relationship.properties, "      ");
    if (properties) lines.push(properties.trimEnd());
    const qualifier = { accessType: relationship.accessType, influenceStrength: relationship.influenceStrength };
    if (Object.values(qualifier).some(Boolean)) lines.push(`      <archint:qualifiers${attrs(qualifier)}/>`);
    if (relationship.extensions) lines.push(`      <archint:extensions>${cdata(JSON.stringify(relationship.extensions))}</archint:extensions>`);
    lines.push("    </relationship>");
  }
  lines.push("  </relationships>", "  <views>");
  for (const view of document.views) {
    lines.push(`    <view${attrs({ identifier: view.id, xsiType: undefined, "xsi:type": "archimate:Diagram", width: view.width, height: view.height, background: view.background })}>`);
    lines.push(`      <name>${xmlEscape(view.name)}</name>`);
    if (view.documentation) lines.push(`      <documentation>${xmlEscape(view.documentation)}</documentation>`);
    lines.push("      <nodes>");
    for (const node of Object.values(view.nodes)) {
      const style = node.style || {};
      lines.push(`        <node${attrs({ identifier: node.id, elementRef: node.elementId, parentRef: node.parentId, x: node.x, y: node.y, width: node.w, height: node.h, rotation: node.rotation, fill: style.fill, stroke: style.stroke, fontSize: style.fontSize })}>`);
      if (node.label) lines.push(`          <label>${xmlEscape(node.label)}</label>`);
      lines.push("        </node>");
    }
    lines.push("      </nodes>", "      <connections>");
    for (const connection of Object.values(view.connections)) {
      const source = connection.source?.nodeId;
      const target = connection.target?.nodeId;
      lines.push(`        <connection${attrs({ identifier: connection.id, relationshipRef: connection.relationshipId, source, target, route: connection.route, label: connection.label, sourceMultiplicity: connection.sourceMultiplicity, targetMultiplicity: connection.targetMultiplicity })}>`);
      if (connection.waypoints?.length) {
        lines.push("          <bendpoints>");
        for (const point of connection.waypoints) lines.push(`            <point${attrs({ x: point.x, y: point.y })}/>`);
        lines.push("          </bendpoints>");
      }
      lines.push("        </connection>");
    }
    lines.push("      </connections>");
    const annotations = Object.values(view.annotations);
    if (annotations.length) lines.push(`      <archint:annotations>${cdata(JSON.stringify(annotations))}</archint:annotations>`);
    lines.push("    </view>");
  }
  lines.push("  </views>");
  if (document.model.organization?.length) lines.push(`  <organizations><archint:json>${cdata(JSON.stringify(document.model.organization))}</archint:json></organizations>`);
  if (document.extensions && Object.keys(document.extensions).length) lines.push(`  <archint:extensions>${cdata(JSON.stringify(document.extensions))}</archint:extensions>`);
  lines.push("</model>");
  return { content: lines.filter(Boolean).join("\n"), warnings: unique(warnings) };
}

function serializeArchimateFile(input, options = {}) {
  const format = options.format || "native";
  const document = ensureCanonicalDocument(input);
  const validation = validateDocument(document);
  if (!validation.valid) return { content: "", format, extension: format === "open-group-exchange" ? ".xml" : ".archimate", warnings: [], errors: validation.errors };
  if (format === "open-group-exchange" || format === "xml" || format === "archimate") {
    try {
      const result = serializeOpenGroupExchange(document, options);
      return { ...result, format: "open-group-exchange", extension: ".xml", errors: [] };
    } catch (error) {
      return { content: "", format: "open-group-exchange", extension: ".xml", warnings: [], errors: [error.message] };
    }
  }
  const payload = {
    app: "ArchInt",
    format: "archint-archimate",
    schemaVersion: 2,
    drawing: { name: document.model.name, category: options.category || "Other" },
    document,
  };
  return { content: JSON.stringify(payload, null, 2), format: "archint-json", extension: ".archimate", warnings: [], errors: [] };
}

function validateOpenGroupExchangeXml(source) {
  try {
    const root = parseXml(source);
    const version = parseVersion(root, source);
    const errors = [];
    if (!["model", "archimatemodel", "archimate-model"].includes(localName(root.name))) errors.push("XML root is not an ArchiMate model");
    if (!EXCHANGE_VERSIONS.includes(version)) errors.push(`unsupported Open Group exchange version ${version}`);
    return { valid: errors.length === 0, version, errors };
  } catch (error) {
    return { valid: false, version: undefined, errors: [error.message] };
  }
}

module.exports = {
  EXCHANGE_EXTENSION_NAMESPACE,
  EXCHANGE_NAMESPACE,
  EXCHANGE_VERSIONS,
  detectArchimateFileFormat,
  parseArchimateFile,
  serializeArchimateFile,
  serializeOpenGroupExchange,
  validateOpenGroupExchangeXml,
};
