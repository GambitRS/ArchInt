import { memo, type PointerEventHandler, type Ref } from "react";
import {
  anchorPoint,
  boundsForElements,
  connectorLabelPoint,
  connectorPoints,
  type SnapGuide,
} from "./editor/geometry";
import type {
  ArchimateDocument,
  ArchimateElementType,
  ArchimateRelationshipType,
} from "./model/archimate";
import { ARCHIMATE_CATALOG } from "./model/archimate";
export type Kind =
  | "card"
  | "container"
  | "text"
  | "ellipse"
  | "arrow"
  | "pen"
  | "icon";
export type TextAlign = "left" | "center" | "right";
export type OverflowMode = "visible" | "hidden";
export type AnchorSide = "top" | "right" | "bottom" | "left";
export type AnchorRef = {
  elementId: string;
  side: AnchorSide;
  offset: number;
};
export type ConnectorRoute = "straight" | "orthogonal";
export type Arrowhead = "none" | "open" | "triangle" | "circle";
export type Waypoint = { x: number; y: number };
export type IconName =
  | "computer"
  | "person"
  | "cloud"
  | "model"
  | "database"
  | "shield"
  | "folder"
  | "terminal"
  | "globe"
  | "microphone";
export type Element = {
  id: string;
  kind: Kind;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  detail: string;
  fill: string;
  stroke: string;
  fontSize: number;
  points?: [number, number][];
  rotation?: number;
  groupId?: string;
  parentId?: string;
  locked?: boolean;
  hidden?: boolean;
  strokeWidth?: number;
  fontWeight?: 400 | 500 | 600 | 700;
  lineHeight?: number;
  textAlign?: TextAlign;
  wrap?: boolean;
  overflow?: OverflowMode;
  sourceAnchor?: AnchorRef;
  targetAnchor?: AnchorRef;
  route?: ConnectorRoute;
  waypoints?: Waypoint[];
  arrowhead?: Arrowhead;
  iconName?: IconName;
  /** Semantic identity is separate from the view occurrence. */
  archimateType?: ArchimateElementType;
  elementType?: ArchimateElementType;
  semanticType?: ArchimateElementType;
  modelElementId?: string;
  viewNodeId?: string;
  relationshipType?: ArchimateRelationshipType;
  archimateRelationship?: ArchimateRelationshipType;
  relationshipId?: string;
  viewConnectionId?: string;
  sourceMultiplicity?: string;
  targetMultiplicity?: string;
  accessType?: "read" | "write" | "read-write" | "unspecified";
  influenceStrength?: "+" | "++" | "-" | "--";
  semanticProperties?: Record<string, string>;
  semanticExtensions?: Record<string, unknown>;
};
export type Drawing = {
  id: string;
  name: string;
  updated: string;
  category: string;
  elements: Element[];
  revision: number;
  /** Canonical ArchiMate document. `elements` remains a view compatibility projection. */
  document?: ArchimateDocument;
  activeViewId?: string;
  defaultView?: string;
  viewSummaries?: { id: string; name: string; width: number; height: number }[];
};
export function makeExample(): Element[] {
  const list: Element[] = [];
  const add = (
    id: string,
    kind: Kind,
    x: number,
    y: number,
    w: number,
    h: number,
    text: string,
    detail = "",
    fill = "#edf3fc",
    stroke = "#afc7e7",
    fontSize = 18,
  ) =>
    list.push({ id, kind, x, y, w, h, text, detail, fill, stroke, fontSize });
  add(
    "title",
    "text",
    80,
    60,
    800,
    55,
    "AI harness on your computer",
    "",
    "#ffffff",
    "#18352d",
    38,
  );
  add(
    "subtitle",
    "text",
    80,
    116,
    1100,
    35,
    "How your ideas become actions — with you in control.",
    "",
    "#ffffff",
    "#7c8b87",
    18,
  );
  add(
    "computer",
    "container",
    370,
    210,
    590,
    510,
    "Your computer",
    "",
    "#f5f8fc",
    "#b3c6dc",
    24,
  );
  add(
    "models",
    "container",
    1020,
    210,
    300,
    510,
    "Connected models",
    "",
    "#f7f5fc",
    "#d7cff0",
    24,
  );
  add(
    "user",
    "card",
    80,
    300,
    235,
    110,
    "You",
    "A prompt. An idea. A goal.",
    "#eff5ef",
    "#b4cdbb",
  );
  add("request", "arrow", 315, 352, 90, 0, "", "", "#ffffff", "#6c8d80");
  [
    "User interface",
    "AI orchestrator",
    "Context & memory",
    "Safety & permissions",
    "Tool connectors",
    "Model router",
  ].forEach((s, i) => {
    add(
      "row" + i,
      "card",
      400,
      280 + i * 65,
      530,
      54,
      s,
      [
        "Chat, tasks, and progress",
        "Plans, reasons, and coordinates",
        "Documents, history, preferences",
        "Access control and guardrails",
        "Files, browser, terminal, and apps",
        "Routes requests to the right model",
      ][i],
      i === 1 ? "#e7e0fa" : "#eaf1fb",
      i === 1 ? "#b6a3e9" : "#c9d9ee",
      17,
    );
    if (i < 5)
      add(
        "flow" + i,
        "arrow",
        665,
        334 + i * 65,
        0,
        11,
        "",
        "",
        "#ffffff",
        "#7392b8",
      );
  });
  ["Cloud model", "Local model", "Vision model", "Speech model"].forEach((s, i) =>
    add(
      "model" + i,
      "card",
      1040,
      280 + i * 100,
      260,
      82,
      s,
      [
        "OpenAI, Anthropic, Gemini",
        "Llama, Mistral, Phi",
        "Images and visual understanding",
        "Speech to text and audio",
      ][i],
      "#ffffff",
      "#ded8ed",
      17,
    ),
  );
  add("model-link", "arrow", 930, 632, 108, 0, "", "", "#ffffff", "#a38dce");
  add(
    "note",
    "text",
    80,
    475,
    260,
    120,
    "Your device.\nYour data.\nYour control.",
    "",
    "#ffffff",
    "#47695a",
    24,
  );
  add(
    "actions",
    "container",
    370,
    755,
    950,
    110,
    "Tools that bring ideas to life",
    "",
    "#f1f5f0",
    "#cbd9c5",
    19,
  );
  ["Documents", "Browser", "Terminal", "Images", "Data"].forEach(
    (s, i) =>
      add(
        "action" + i,
        "text",
        392 + i * 183,
        810,
        175,
        30,
        s,
        "",
        "#ffffff",
        "#486451",
        17,
      ),
  );
  for (const element of list) {
    if (element.id.startsWith("row") || element.id.startsWith("flow")) {
      element.parentId = "computer";
    } else if (element.id.startsWith("model")) {
      element.parentId = "models";
    } else if (element.id.startsWith("action")) {
      element.parentId = "actions";
    }
  }
  const iconNames: Record<string, IconName> = {
    user: "person",
    computer: "computer",
    models: "cloud",
    actions: "folder",
    row0: "computer",
    row1: "model",
    row2: "database",
    row3: "shield",
    row4: "terminal",
    row5: "model",
    model0: "cloud",
    model1: "model",
    model2: "globe",
    model3: "microphone",
    action0: "folder",
    action1: "globe",
    action2: "terminal",
    action3: "cloud",
    action4: "database",
  };
  for (const element of list) {
    if (iconNames[element.id]) element.iconName = iconNames[element.id];
  }
  const bind = (
    id: string,
    sourceId: string,
    sourceSide: AnchorSide,
    sourceOffset: number,
    targetId: string,
    targetSide: AnchorSide,
    targetOffset: number,
    route: ConnectorRoute = "straight",
    arrowhead: Arrowhead = "triangle",
    text = "",
  ) => {
    const element = list.find((candidate) => candidate.id === id);
    if (!element) return;
    element.sourceAnchor = { elementId: sourceId, side: sourceSide, offset: sourceOffset };
    element.targetAnchor = { elementId: targetId, side: targetSide, offset: targetOffset };
    element.route = route;
    element.arrowhead = arrowhead;
    element.text = text;
  };
  bind("request", "user", "right", 0.5, "row0", "left", 0.5, "orthogonal", "triangle", "Request");
  for (let i = 0; i < 5; i += 1) {
    bind(
      "flow" + i,
      "row" + i,
      "bottom",
      0.5,
      "row" + (i + 1),
      "top",
      0.5,
      "straight",
      "triangle",
    );
  }
  bind("model-link", "computer", "right", 0.5, "models", "left", 0.5, "straight", "triangle", "Routes");
  return list;
}

function wrapLines(
  value: string,
  width: number,
  fontSize: number,
  wrap = true,
): string[] {
  const paragraphs = value.split(/\r?\n/);
  if (!wrap) return paragraphs;
  const maxCharacters = Math.max(
    1,
    Math.floor(width / Math.max(5, fontSize * 0.56)),
  );
  return paragraphs.flatMap((paragraph) => {
    if (!paragraph.trim()) return [""];
    const words = paragraph.trim().split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      if (word.length > maxCharacters) {
        if (line) {
          lines.push(line);
          line = "";
        }
        for (let i = 0; i < word.length; i += maxCharacters) {
          const chunk = word.slice(i, i + maxCharacters);
          if (chunk.length === maxCharacters || i + maxCharacters < word.length) {
            lines.push(chunk);
          } else {
            line = chunk;
          }
        }
      } else if (!line) {
        line = word;
      } else if ((line + " " + word).length <= maxCharacters) {
        line += " " + word;
      } else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
  });
}

function textAnchor(align: TextAlign): "start" | "middle" | "end" {
  return align === "center" ? "middle" : align === "right" ? "end" : "start";
}

function textPosition(element: Element, align: TextAlign, padding = 18) {
  if (align === "center") return element.w / 2;
  const iconPadding = element.iconName ? 42 : 0;
  return align === "right"
    ? element.w - padding
    : element.kind === "text"
      ? iconPadding
      : padding + iconPadding;
}

function textWrapWidth(element: Element) {
  const basePadding = element.kind === "text" ? 0 : 36;
  const cornerGlyphPadding = element.archimateType ? 28 : 0;
  return Math.max(1, element.w - basePadding - cornerGlyphPadding);
}

export function ArchimateCornerGlyph({
  type,
  x,
  y,
  w,
  h,
  color,
  fill,
}: {
  type: ArchimateElementType;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  fill: string;
}) {
  const definition = ARCHIMATE_CATALOG.elements.find((element) => element.id === type);
  const glyph = definition?.glyph || type;
  const line = {
    fill: "none",
    stroke: color,
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const soft = fill === "none" ? "none" : fill;
  const mark = (() => {
    switch (glyph) {
      case "role":
        return (
          <>
            <circle cx="12" cy="6.5" r="3" {...line} fill={soft} />
            <path d="M5 20c.5-4.6 3.1-7.2 7-7.2s6.5 2.6 7 7.2" {...line} />
          </>
        );
      case "collaboration":
        return (
          <>
            <circle cx="8" cy="7" r="2.7" {...line} fill={soft} />
            <circle cx="16" cy="7" r="2.7" {...line} fill={soft} />
            <path d="M2.8 19c.5-3.8 2.2-6 5.2-6s4.7 2.2 5.2 6M10.8 19c.5-3.8 2.2-6 5.2-6s4.7 2.2 5.2 6" {...line} />
            <path d="M10 10h4" {...line} />
          </>
        );
      case "path":
        return (
          <>
            <circle cx="5" cy="16" r="2.3" {...line} fill={soft} />
            <circle cx="12" cy="8" r="2.3" {...line} fill={soft} />
            <circle cx="19" cy="16" r="2.3" {...line} fill={soft} />
            <path d="m6.6 14.2 3.8-4.4m3.2 0 3.8 4.4" {...line} />
          </>
        );
      case "service":
        return (
          <>
            <path d="M4 6.5h16M4 11.9h16M4 17.3h11" {...line} />
            <path d="m17 15 3 2.3-3 2.3" {...line} />
          </>
        );
      case "process":
        return (
          <>
            <path d="M7.2 8.1a6.2 6.2 0 0 1 10.9 1.1M16.8 15.9a6.2 6.2 0 0 1-10.9-1.1" {...line} />
            <path d="m16.5 5.6 1.7 3.7-4 .6M7.5 18.4l-1.7-3.7 4-.6" {...line} />
          </>
        );
      case "function":
        return (
          <>
            <path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M18.5 5.5l-2.1 2.1M7.6 16.4l-2.1 2.1" {...line} />
            <circle cx="12" cy="12" r="5.2" {...line} fill={soft} />
            <circle cx="12" cy="12" r="1.7" fill={color} />
          </>
        );
      case "event":
        return <path d="m13.7 2.8-7 10h5l-1.4 8.4 7.9-11h-5.1Z" {...line} fill={soft} />;
      case "grouping":
        return (
          <>
            <rect x="5.5" y="5.5" width="11" height="11" rx="1.5" {...line} fill={soft} />
            <rect x="8" y="8" width="11" height="11" rx="1.5" {...line} fill={soft} />
            <path d="M12 21h6.2c1.1 0 2-.9 2-2v-6.2" {...line} />
          </>
        );
      case "location":
        return (
          <>
            <path d="M12 21s6.2-5.7 6.2-11.1A6.2 6.2 0 0 0 12 3.7a6.2 6.2 0 0 0-6.2 6.2C5.8 15.3 12 21 12 21Z" {...line} fill={soft} />
            <circle cx="12" cy="9.8" r="2.1" {...line} />
          </>
        );
      case "business-actor":
        return (
          <>
            <circle cx="12" cy="5.8" r="2.7" {...line} fill={soft} />
            <path d="M5.4 17.1c.5-3.6 2.8-5.6 6.6-5.6s6.1 2 6.6 5.6" {...line} />
            <path d="M5 20h14" {...line} />
            <path d="M8 17.2h8v3H8z" {...line} fill={soft} />
          </>
        );
      case "business-interface":
        return (
          <>
            <path d="M5 3.5h14v17H5Z" {...line} fill={soft} />
            <path d="M9 20.5v-9a3 3 0 0 1 6 0v9M12 14v1" {...line} />
          </>
        );
      case "business-object":
        return (
          <>
            <path d="M5 3.5h9l5 5v12H5Z M14 3.5v5h5" {...line} fill={soft} />
            <path d="M8.5 13h7M8.5 16.5h5" {...line} />
          </>
        );
      case "product":
        return (
          <>
            <path d="m4 7 8-4 8 4-8 4Z M4 7v10l8 4 8-4V7" {...line} fill={soft} />
            <path d="M12 11v10M8 5l8 4" {...line} />
          </>
        );
      case "application-component":
        return (
          <>
            <rect x="4" y="4" width="16" height="16" rx="2" {...line} fill={soft} />
            <path d="M8 9h8M8 13h5M8 17h8" {...line} />
            <path d="M4 8H2.5M4 16H2.5M20 8h1.5M20 16h1.5" {...line} />
          </>
        );
      case "application-interface":
        return (
          <>
            <path d="M8 5 4 12l4 7M16 5l4 7-4 7" {...line} />
            <path d="m10 17 4-10" {...line} />
          </>
        );
      case "data-object":
        return (
          <>
            <path d="m4 6 8-3 8 3-8 3Z M4 6v5l8 3 8-3V6M4 11v5l8 3 8-3v-5" {...line} fill={soft} />
            <path d="M12 9v5M12 14v5" {...line} />
          </>
        );
      case "node":
        return (
          <>
            <path d="m12 3 7 4v10l-7 4-7-4V7Z" {...line} fill={soft} />
            <path d="m5 7 7 4 7-4M12 11v10" {...line} />
          </>
        );
      case "device":
        return (
          <>
            <rect x="4" y="4" width="16" height="12" rx="1.5" {...line} fill={soft} />
            <path d="M8 20h8M12 16v4" {...line} />
            <circle cx="12" cy="10" r="1.3" fill={color} />
          </>
        );
      case "system-software":
        return (
          <>
            <rect x="3.5" y="4" width="17" height="16" rx="2" {...line} fill={soft} />
            <path d="M3.5 8h17M7 12l2 2-2 2M11 16h4" {...line} />
          </>
        );
      case "technology-interface":
        return (
          <>
            <path d="M8 3.5v6M16 3.5v6M6 9.5h12v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4Z" {...line} fill={soft} />
            <path d="M12 17.5v3M9 20.5h6" {...line} />
          </>
        );
      case "communication-network":
        return (
          <>
            <circle cx="12" cy="12" r="2.5" {...line} fill={soft} />
            <circle cx="5" cy="6" r="2" {...line} fill={soft} />
            <circle cx="19" cy="6" r="2" {...line} fill={soft} />
            <circle cx="19" cy="18" r="2" {...line} fill={soft} />
            <path d="m10 10-3.5-2.8m7 2.8 3.5-2.8m-3.5 5.6 3.5 2.8" {...line} />
          </>
        );
      case "distribution-network":
        return (
          <>
            <path d="M12 4v6M12 10 5 16M12 10l7 6" {...line} />
            <rect x="9" y="2" width="6" height="4" rx="1" {...line} fill={soft} />
            <rect x="2" y="16" width="6" height="5" rx="1" {...line} fill={soft} />
            <rect x="16" y="16" width="6" height="5" rx="1" {...line} fill={soft} />
          </>
        );
      case "equipment":
        return (
          <>
            <path d="M15.8 4.2a4 4 0 0 0-4.5 5.1L4.1 16.5a2.1 2.1 0 1 0 3 3l7.4-7.2a4 4 0 0 0 5.1-4.5l-3.3 3.3-2.4-.7-.7-2.4Z" {...line} fill={soft} />
            <circle cx="5.6" cy="17.9" r=".7" fill={color} />
          </>
        );
      case "facility":
        return (
          <>
            <path d="M4 20V9l8-5 8 5v11Z" {...line} fill={soft} />
            <path d="M8 20v-5h8v5M8 11h2M14 11h2" {...line} />
          </>
        );
      case "artifact":
        return (
          <>
            <path d="M5 3.5h9l5 5v12H5Z M14 3.5v5h5" {...line} fill={soft} />
            <circle cx="9" cy="13" r="1" fill={color} />
            <circle cx="13" cy="13" r="1" fill={color} />
            <circle cx="9" cy="17" r="1" fill={color} />
            <circle cx="13" cy="17" r="1" fill={color} />
          </>
        );
      case "material":
        return (
          <>
            <ellipse cx="12" cy="6" rx="7" ry="3" {...line} fill={soft} />
            <path d="M5 6v8c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 14v4c0 1.7 3.1 3 7 3s7-1.3 7-3v-4" {...line} />
          </>
        );
      case "resource":
        return (
          <>
            <ellipse cx="12" cy="6" rx="6.5" ry="2.5" {...line} fill={soft} />
            <path d="M5.5 6v4c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5V6M5.5 10v4c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-4M5.5 14v4c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-4" {...line} />
          </>
        );
      case "capability":
        return (
          <>
            <path d="m12 2.8 7 4v8l-7 4-7-4v-8Z" {...line} fill={soft} />
            <circle cx="12" cy="10.8" r="2.4" {...line} />
            <path d="M12 5.5v2M7 8.2l1.7 1M17 8.2l-1.7 1" {...line} />
          </>
        );
      case "value-stream":
        return (
          <>
            <path d="M3 5h6l4 7-4 7H3l4-7Z" {...line} fill={soft} />
            <path d="M11 5h4l4 7-4 7h-4l4-7Z" {...line} fill={soft} />
            <path d="M17 5h3l2 7-2 7h-3l3-7Z" {...line} fill={soft} />
          </>
        );
      case "course-of-action":
        return (
          <>
            <path d="M4 18c3-7 5-9 8-9s4 3 8 0" {...line} />
            <path d="m17 6 3 3-3 3" {...line} />
            <circle cx="4" cy="18" r="2" {...line} fill={soft} />
          </>
        );
      case "stakeholder":
        return (
          <>
            <circle cx="8" cy="7" r="3" {...line} fill={soft} />
            <path d="M2.5 20c.4-4.4 2.3-6.8 5.5-6.8s5.1 2.4 5.5 6.8" {...line} />
            <path d="M14.5 12s3-3.4 6.5 0c-3.5 3.4-6.5 0-6.5 0Z" {...line} fill={soft} />
            <circle cx="17.8" cy="12" r="1" fill={color} />
          </>
        );
      case "driver":
        return (
          <>
            <circle cx="12" cy="12" r="7" {...line} fill={soft} />
            <circle cx="12" cy="12" r="2" {...line} />
            <path d="M12 5v5M6.1 15.5l4.3-2.5M17.9 15.5 13.6 13" {...line} />
          </>
        );
      case "assessment":
        return (
          <>
            <path d="M4 17a8 8 0 0 1 16 0" {...line} />
            <path d="M5 17h14M12 17l3.6-4.6" {...line} />
            <circle cx="12" cy="17" r="1.2" fill={color} />
          </>
        );
      case "goal":
        return (
          <>
            <circle cx="12" cy="12" r="8" {...line} fill={soft} />
            <circle cx="12" cy="12" r="4.5" {...line} />
            <circle cx="12" cy="12" r="1.5" fill={color} />
          </>
        );
      case "outcome":
        return (
          <>
            <path d="M5 20V4" {...line} />
            <path d="M6 5h11l-2.2 3L17 11H6Z" {...line} fill={soft} />
            <path d="m9 8 2 2 3-3" {...line} />
          </>
        );
      case "principle":
        return (
          <>
            <path d="M4 5.5c2.7-1.4 5.3-1.4 8 0v14c-2.7-1.4-5.3-1.4-8 0ZM20 5.5c-2.7-1.4-5.3-1.4-8 0v14c2.7-1.4 5.3-1.4 8 0Z" {...line} fill={soft} />
            <path d="M6.5 9h3M14.5 9h3M6.5 12h3M14.5 12h3" {...line} />
          </>
        );
      case "requirement":
        return (
          <>
            <rect x="5" y="4" width="14" height="17" rx="1.5" {...line} fill={soft} />
            <path d="M9 4.5v-2h6v2M8 9l1.3 1.3L11.5 8M13 9h3M8 14l1.3 1.3 2.2-2.3M13 14h3" {...line} />
          </>
        );
      case "meaning":
        return (
          <>
            <path d="M8 14.5c-1.4-1.1-2.2-2.7-2.2-4.6a6.2 6.2 0 0 1 12.4 0c0 1.9-.8 3.5-2.2 4.6-.7.6-1 1.4-1 2.5h-6c0-1.1-.3-1.9-1-2.5Z" {...line} fill={soft} />
            <path d="M9 20h6M10 22h4M12 2V.5M4.8 4 3.7 2.9M19.2 4l1.1-1.1" {...line} />
          </>
        );
      case "value":
        return (
          <>
            <path d="M4 6h10l6 6-8 8-8-8Z" {...line} fill={soft} />
            <circle cx="8" cy="10" r="1.4" {...line} />
            <path d="M12 9v6M10.3 10.2c.5-.7 2.5-.7 3 0 .6.9-.5 1.5-1.5 1.8-1.1.3-2.1.8-1.5 1.8.5.7 2.5.7 3 0" {...line} />
          </>
        );
      case "work-package":
        return (
          <>
            <rect x="3.5" y="7" width="17" height="13" rx="2" {...line} fill={soft} />
            <path d="M8 7V5h8v2M3.5 12h17M10 12v2h4v-2" {...line} />
          </>
        );
      case "deliverable":
        return (
          <>
            <path d="M5 3.5h9l5 5v12H5Z M14 3.5v5h5" {...line} fill={soft} />
            <path d="m8 15 2.4 2.4 5-5" {...line} />
          </>
        );
      case "plateau":
        return (
          <>
            <path d="M4 18h16M4 13h12M4 8h8" {...line} />
            <path d="M4 18v-5M4 13V8M12 8v5M16 13v5" {...line} />
          </>
        );
      case "and-junction":
        return (
          <>
            <circle cx="12" cy="12" r="8" {...line} fill={soft} />
            <path d="M8 12h8M12 8v8" {...line} />
          </>
        );
      case "or-junction":
        return (
          <>
            <circle cx="12" cy="12" r="8" {...line} fill={soft} />
            <path d="m8 9 4 4 4-4M8 16l4-4 4 4" {...line} />
          </>
        );
      default:
        return (
          <>
            <rect x="4" y="4" width="16" height="16" rx="3" {...line} fill={soft} />
            <path d="M8 9h8M8 13h8M8 17h5" {...line} />
          </>
        );
    }
  })();
  return (
    <g
      data-archimate-glyph={type}
      data-archimate-corner-glyph={glyph}
      transform={`translate(${x} ${y}) scale(${Math.max(0.2, w / 24)} ${Math.max(0.2, h / 24)})`}
      aria-hidden="true"
    >
      <title>{definition?.name || type}</title>
      {mark}
    </g>
  );
}

function isHiddenByParent(element: Element, elements: Element[]): boolean {
  if (element.hidden) return true;
  let parentId = element.parentId;
  const visited = new Set<string>();
  while (parentId && !visited.has(parentId)) {
    const parent = elements.find((candidate) => candidate.id === parentId);
    if (!parent) return false;
    if (parent.hidden) return true;
    visited.add(parentId);
    parentId = parent.parentId;
  }
  return false;
}

const anchorSides: AnchorSide[] = ["top", "right", "bottom", "left"];

function IconGlyph({
  name,
  x,
  y,
  w,
  h,
  color,
  fill,
}: {
  name: IconName;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  fill: string;
}) {
  const line = {
    fill: "none",
    stroke: color,
    strokeWidth: 7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const softFill = fill === "none" ? "none" : fill;
  return (
    <g transform={`translate(${x} ${y}) scale(${w / 100} ${h / 100})`} aria-hidden="true">
      {name === "computer" && (
        <>
          <rect x="12" y="10" width="76" height="55" rx="8" {...line} />
          <path d="M36 82h28M50 65v17M25 82h50" {...line} />
        </>
      )}
      {name === "person" && (
        <>
          <circle cx="50" cy="28" r="15" fill={softFill} stroke={color} strokeWidth="7" />
          <path d="M20 88c3-22 16-34 30-34s27 12 30 34" {...line} />
        </>
      )}
      {name === "cloud" && (
        <path
          d="M22 76h55a17 17 0 0 0 2-34 29 29 0 0 0-54-2A18 18 0 0 0 22 76Z"
          fill={softFill}
          fillOpacity=".45"
          stroke={color}
          strokeWidth="7"
          strokeLinejoin="round"
        />
      )}
      {name === "model" && (
        <>
          <path d="M27 22h46l15 15v26L73 78H27L12 63V37Z" {...line} fill={softFill} fillOpacity=".35" />
          <path d="M40 40h20M40 60h20M50 31v9M50 60v9M31 50h9M60 50h9" {...line} />
        </>
      )}
      {name === "database" && (
        <>
          <ellipse cx="50" cy="24" rx="30" ry="12" fill={softFill} fillOpacity=".45" stroke={color} strokeWidth="7" />
          <path d="M20 24v48c0 7 13 12 30 12s30-5 30-12V24M20 48c0 7 13 12 30 12s30-5 30-12" {...line} />
        </>
      )}
      {name === "shield" && (
        <path d="M50 10 82 22v25c0 21-14 34-32 43C32 81 18 68 18 47V22Z" {...line} fill={softFill} fillOpacity=".4" />
      )}
      {name === "folder" && (
        <path d="M10 28h31l9 10h40v42H10Z" {...line} fill={softFill} fillOpacity=".4" />
      )}
      {name === "terminal" && (
        <>
          <rect x="10" y="16" width="80" height="68" rx="9" {...line} fill={softFill} fillOpacity=".25" />
          <path d="m27 40 13 12-13 12M49 67h22" {...line} />
        </>
      )}
      {name === "globe" && (
        <>
          <circle cx="50" cy="50" r="38" {...line} />
          <path d="M12 50h76M50 12c12 10 18 23 18 38s-6 28-18 38M50 12C38 22 32 35 32 50s6 28 18 38" {...line} />
        </>
      )}
      {name === "microphone" && (
        <>
          <rect x="35" y="10" width="30" height="52" rx="15" {...line} fill={softFill} fillOpacity=".35" />
          <path d="M22 48a28 28 0 0 0 56 0M50 76v14M36 90h28" {...line} />
        </>
      )}
    </g>
  );
}

function pointsPath(points: { x: number; y: number }[]): string {
  return points
    .map((point, index) => `${index ? "L" : "M"}${point.x} ${point.y}`)
    .join(" ");
}

function ConnectorArrowhead({
  arrowhead,
  points,
  color,
  strokeWidth,
}: {
  arrowhead: NonNullable<Element["arrowhead"]>;
  points: { x: number; y: number }[];
  color: string;
  strokeWidth: number;
}) {
  if (arrowhead === "none" || points.length < 2) return null;
  let index = points.length - 2;
  while (
    index >= 0 &&
    points[index].x === points[points.length - 1].x &&
    points[index].y === points[points.length - 1].y
  ) {
    index -= 1;
  }
  if (index < 0) return null;
  const end = points[points.length - 1];
  const previous = points[index];
  const angle = (Math.atan2(end.y - previous.y, end.x - previous.x) * 180) / Math.PI;
  if (arrowhead === "circle") {
    return <circle cx={end.x} cy={end.y} r={Math.max(4, strokeWidth + 1)} fill={color} />;
  }
  return (
    <path
      d={arrowhead === "triangle" ? "M-12 -7 L0 0 L-12 7 Z" : "M-12 -6 L0 0 L-12 6"}
      fill={arrowhead === "triangle" ? color : "none"}
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      transform={`translate(${end.x} ${end.y}) rotate(${angle})`}
    />
  );
}

function ConnectorEndpointDecoration({
  relationshipType,
  point,
  previous,
  color,
  strokeWidth,
}: {
  relationshipType?: ArchimateRelationshipType;
  point: { x: number; y: number };
  previous: { x: number; y: number };
  color: string;
  strokeWidth: number;
}) {
  if (relationshipType !== "Composition" && relationshipType !== "Aggregation") return null;
  const angle = (Math.atan2(point.y - previous.y, point.x - previous.x) * 180) / Math.PI;
  const filled = relationshipType === "Composition";
  return (
    <path
      d="M0 0 L-11 -7 L-18 0 L-11 7 Z"
      fill={filled ? color : "white"}
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
      transform={`translate(${point.x} ${point.y}) rotate(${angle})`}
      aria-hidden="true"
    />
  );
}

export const Diagram = memo(function Diagram({
  elements,
  selectedIds = [],
  guides = [],
  selectionBox,
  onTextDoubleClick,
  showAnchors = false,
  svgRef,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  page,
}: {
  elements: Element[];
  selectedIds?: string[];
  guides?: SnapGuide[];
  selectionBox?: { x: number; y: number; w: number; h: number } | null;
  onTextDoubleClick?: (id: string) => void;
  showAnchors?: boolean;
  svgRef?: Ref<SVGSVGElement>;
  onPointerDown?: PointerEventHandler<SVGSVGElement>;
  onPointerMove?: PointerEventHandler<SVGSVGElement>;
  onPointerUp?: PointerEventHandler<SVGSVGElement>;
  page?: { width: number; height: number; background: string };
}) {
  const pageWidth = page?.width || 1400;
  const pageHeight = page?.height || 900;
  const pageBackground = page?.background || "#ffffff";
  const visibleElements = elements.filter(
    (element) => !isHiddenByParent(element, elements),
  );
  const selected = new Set(selectedIds);
  const selectedBounds = boundsForElements(visibleElements, selectedIds);
  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${pageWidth} ${pageHeight}`}
      width="100%"
      height="100%"
      role="img"
      aria-label={onPointerDown ? "Architecture drawing canvas" : "Architecture drawing preview"}
      aria-describedby={onPointerDown ? "canvas-keyboard-help" : undefined}
      aria-keyshortcuts={onPointerDown ? "V R T O A P E Delete Control+Z Control+Shift+Z" : undefined}
      tabIndex={onPointerDown ? 0 : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{ touchAction: "none", fontFamily: "Arial, sans-serif" }}
    >
      <title>{onPointerDown ? "Architecture drawing canvas" : "Architecture drawing preview"}</title>
      {onPointerDown && (
        <desc id="canvas-keyboard-help">
          Use the layer list to select objects. Keyboard shortcuts switch tools,
          and Delete removes the current selection.
        </desc>
      )}
      <defs>
        {visibleElements
          .filter((element) => element.overflow === "hidden")
          .map((element) => (
            <clipPath key={element.id} id={`clip-${element.id}`}>
              <rect
                width={Math.max(0, element.w)}
                height={Math.max(0, element.h)}
              />
            </clipPath>
          ))}
      </defs>
      <rect
        data-page-background="true"
        width={pageWidth}
        height={pageHeight}
        fill={pageBackground}
      />
      <g data-connectors="true">
        {visibleElements
          .filter((element) => element.kind === "arrow")
          .map((e) => {
            const points = connectorPoints(e, elements);
            const path = pointsPath(points);
            const label = connectorLabelPoint(points);
            const strokeWidth = e.strokeWidth ?? 2.5;
            const relationshipDefinition = e.relationshipType
              ? ARCHIMATE_CATALOG.relationships.find(
                  (relationship) => relationship.id === e.relationshipType,
                )
              : undefined;
            const dash = relationshipDefinition?.line === "dashed" ? "8 5" : undefined;
            const labelLines = e.text.split(/\r?\n/);
            const labelWidth = Math.max(
              28,
              Math.min(220, Math.max(...labelLines.map((line) => line.length * 7 + 18))),
            );
            return (
              <g
                key={e.id}
                data-element={e.id}
                role="img"
                aria-label={`${e.kind}: ${e.text || "untitled connector"}`}
                onDoubleClick={() => onTextDoubleClick?.(e.id)}
                style={{ cursor: onPointerDown ? "move" : undefined }}
              >
                <path
                  d={path}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={Math.max(18, strokeWidth + 12)}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d={path}
                  fill="none"
                  stroke={e.stroke}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={dash}
                  data-connector-path="true"
                />
                {relationshipDefinition && points.length > 1 && (
                  <ConnectorEndpointDecoration
                    relationshipType={e.relationshipType}
                    point={points[0]}
                    previous={points[1]}
                    color={e.stroke}
                    strokeWidth={strokeWidth}
                  />
                )}
                <ConnectorArrowhead
                  arrowhead={e.arrowhead || "open"}
                  points={points}
                  color={e.stroke}
                  strokeWidth={strokeWidth}
                />
                {e.text && (
                  <g transform={`translate(${label.x} ${label.y})`} pointerEvents="none">
                    <rect
                      x={-labelWidth / 2}
                      y={-14}
                      width={labelWidth}
                      height={labelLines.length * 16 + 4}
                      rx="5"
                      fill="white"
                      stroke="#d6e1dc"
                    />
                    <text
                      textAnchor="middle"
                      y="0"
                      fill="#355348"
                      fontSize="12"
                      fontWeight="600"
                    >
                      {labelLines.map((line, index) => (
                        <tspan key={index} x="0" dy={index ? 15 : 0}>
                          {line}
                        </tspan>
                      ))}
                    </text>
                  </g>
                )}
                {(e.sourceMultiplicity || e.targetMultiplicity) && points.length > 1 && (
                  <g aria-hidden="true" fill="#355348" fontSize="11" fontWeight="600">
                    {e.sourceMultiplicity && (
                      <text x={points[0].x + 8} y={points[0].y - 8}>
                        {e.sourceMultiplicity}
                      </text>
                    )}
                    {e.targetMultiplicity && (
                      <text
                        x={points[points.length - 1].x + 8}
                        y={points[points.length - 1].y - 8}
                      >
                        {e.targetMultiplicity}
                      </text>
                    )}
                  </g>
                )}
                {selectedIds.length === 1 && selected.has(e.id) && (
                  <g data-selection="true" aria-hidden="true">
                    <path
                      d={path}
                      fill="none"
                      stroke="#438268"
                      strokeDasharray="5 3"
                      strokeWidth="2"
                      pointerEvents="none"
                    />
                    <circle
                      cx={points[0]?.x}
                      cy={points[0]?.y}
                      r="7"
                      fill="white"
                      stroke="#438268"
                      data-connector-handle="source"
                      role="button"
                      aria-label="Move connector source"
                      pointerEvents="all"
                      style={{ cursor: "grab" }}
                    />
                    <circle
                      cx={points[points.length - 1]?.x}
                      cy={points[points.length - 1]?.y}
                      r="7"
                      fill="white"
                      stroke="#438268"
                      data-connector-handle="target"
                      role="button"
                      aria-label="Move connector target"
                      pointerEvents="all"
                      style={{ cursor: "grab" }}
                    />
                    {(e.waypoints || []).map((waypoint, index) => (
                      <rect
                        key={index}
                        x={waypoint.x - 5}
                        y={waypoint.y - 5}
                        width="10"
                        height="10"
                        rx="2"
                        fill="white"
                        stroke="#438268"
                        data-connector-handle={`waypoint:${index}`}
                        role="button"
                        aria-label={`Move waypoint ${index + 1}`}
                        pointerEvents="all"
                        style={{ cursor: "move" }}
                      />
                    ))}
                  </g>
                )}
              </g>
            );
          })}
      </g>
      {visibleElements.filter((element) => element.kind !== "arrow").map((e) => (
        <g
          key={e.id}
          data-element={e.id}
          data-anchor-element={e.kind !== "pen" ? e.id : undefined}
          role="img"
          aria-label={`${e.kind}: ${e.text || "untitled element"}`}
          transform={`translate(${e.x} ${e.y}) rotate(${e.rotation || 0} ${e.w / 2} ${e.h / 2})`}
          style={{ cursor: onPointerDown ? "move" : undefined }}
          onDoubleClick={() => onTextDoubleClick?.(e.id)}
        >
          <g clipPath={e.overflow === "hidden" ? `url(#clip-${e.id})` : undefined}>
          {(e.kind === "card" || e.kind === "container") && (
            <rect
              width={e.w}
              height={e.h}
              rx={e.kind === "container" ? 16 : 10}
              fill={e.fill}
              stroke={e.stroke}
              strokeWidth={e.strokeWidth ?? 1.5}
            />
          )}
          {e.kind === "ellipse" && (
            <ellipse
              cx={e.w / 2}
              cy={e.h / 2}
              rx={e.w / 2}
              ry={e.h / 2}
              fill={e.fill}
              stroke={e.stroke}
              strokeWidth={e.strokeWidth ?? 2}
            />
          )}
          {e.kind === "pen" && (
            <polyline
              points={e.points?.map((p) => p.join(",")).join(" ")}
              fill="none"
              stroke={e.stroke}
              strokeWidth={e.strokeWidth ?? 3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {e.kind === "icon" && (
            <IconGlyph
              name={e.iconName || "model"}
              x={0}
              y={0}
              w={e.w}
              h={e.h}
              color={e.stroke}
              fill={e.fill}
            />
          )}
          {e.archimateType && e.kind !== "pen" && e.kind !== "icon" && (
            <ArchimateCornerGlyph
              type={e.archimateType}
              x={Math.max(4, e.w - 29)}
              y={5}
              w={24}
              h={24}
              color={e.stroke}
              fill={e.fill}
            />
          )}
          {e.iconName && e.kind !== "icon" && (
            <IconGlyph
              name={e.iconName}
              x={e.kind === "text" ? 0 : 18}
              y={e.kind === "text" ? 0 : e.kind === "card" && e.h < 60 ? 10 : 16}
              w={e.kind === "text" ? 26 : 30}
              h={e.kind === "text" ? 26 : 30}
              color={e.kind === "text" ? e.stroke : "#486451"}
              fill={e.fill}
            />
          )}
          {!['pen', 'arrow', 'icon'].includes(e.kind) && (
            <text
              x={textPosition(e, e.textAlign || "left")}
              y={
                e.kind === "text"
                  ? e.fontSize
                  : e.kind === "card" && e.h < 60
                    ? 23
                    : 34
              }
              textAnchor={textAnchor(e.textAlign || "left")}
              fill={["text", "icon"].includes(e.kind) ? e.stroke : "#233d46"}
              fontSize={e.fontSize}
              fontWeight={
                e.fontWeight || (e.kind === "text" && e.fontSize < 25 ? 400 : 600)
              }
            >
              {wrapLines(
                e.text,
                textWrapWidth(e),
                e.fontSize,
                e.wrap !== false,
              ).map((line, i) => (
                <tspan
                  key={i}
                  x={textPosition(e, e.textAlign || "left")}
                  dy={
                    i
                      ? e.fontSize * Math.max(1, e.lineHeight || 1.35)
                      : 0
                  }
                >
                  {line}
                </tspan>
              ))}
            </text>
          )}
          {e.kind === "card" && e.detail && (
            <text
              x={e.iconName ? 54 : 18}
              y={e.h < 60 ? 43 : 60}
              fill="#637990"
              fontSize="13"
            >
              {wrapLines(
                e.detail,
                textWrapWidth(e),
                13,
                e.wrap !== false,
              ).map((line, i) => (
                <tspan key={i} x={e.iconName ? 54 : 18} dy={i ? 17 : 0}>
                  {line}
                </tspan>
              ))}
            </text>
          )}
          </g>
          {selectedIds.length === 1 && selected.has(e.id) && (
            <g data-selection="true" aria-hidden="true">
              <rect
                x={Math.min(0, e.w) - 4}
                y={Math.min(0, e.h) - 4}
                width={Math.abs(e.w) + 8}
                height={Math.abs(e.h) + 8}
                fill="none"
                stroke="#438268"
                strokeDasharray="5 3"
                strokeWidth="2"
                pointerEvents="none"
              />
              {!['arrow', 'pen'].includes(e.kind) && (
                <>
                  <line
                    x1={e.w / 2}
                    y1={-8}
                    x2={e.w / 2}
                    y2={-28}
                    stroke="#438268"
                    strokeWidth="1.5"
                    pointerEvents="none"
                  />
                  <circle
                    cx={e.w / 2}
                    cy={-34}
                    r="6"
                    fill="white"
                    stroke="#438268"
                    data-rotate-handle="true"
                    role="button"
                    aria-label="Rotate element"
                    pointerEvents="all"
                    style={{ cursor: "grab" }}
                  />
                  {[
                    { handle: "nw", x: 0, y: 0, cursor: "nwse-resize" },
                    { handle: "ne", x: e.w, y: 0, cursor: "nesw-resize" },
                    { handle: "se", x: e.w, y: e.h, cursor: "nwse-resize" },
                    { handle: "sw", x: 0, y: e.h, cursor: "nesw-resize" },
                  ].map(({ handle, x, y, cursor }) => (
                    <rect
                      key={handle}
                      x={x - 4}
                      y={y - 4}
                      width="8"
                      height="8"
                      fill="white"
                      stroke="#438268"
                      data-resize-handle={handle}
                      role="button"
                      aria-label={`Resize ${handle}`}
                      pointerEvents="all"
                      style={{ cursor }}
                    />
                  ))}
                </>
              )}
            </g>
          )}
        </g>
      ))}
      {showAnchors &&
        visibleElements
          .filter((element) => !["arrow", "pen"].includes(element.kind))
          .flatMap((element) =>
            anchorSides.map((side) => {
              const point = anchorPoint(element, side, 0.5);
              return (
                <circle
                  key={`${element.id}-${side}`}
                  cx={point.x}
                  cy={point.y}
                  r="5"
                  fill="white"
                  stroke="#438268"
                  strokeWidth="2"
                  data-anchor-handle={`${element.id}:${side}`}
                  data-anchor-element={element.id}
                  aria-hidden="true"
                  pointerEvents="all"
                  style={{ cursor: "crosshair" }}
                />
              );
            }),
          )}
      {selectedIds.length > 1 && selectedBounds && (
        <rect
          data-selection="true"
          aria-hidden="true"
          x={selectedBounds.x - 8}
          y={selectedBounds.y - 8}
          width={selectedBounds.w + 16}
          height={selectedBounds.h + 16}
          fill="none"
          stroke="#438268"
          strokeDasharray="7 4"
          strokeWidth="2"
          pointerEvents="none"
        />
      )}
      {guides.map((guide, index) =>
        guide.axis === "x" ? (
          <line
            key={index}
            data-selection="true"
            aria-hidden="true"
            x1={guide.position}
            y1="0"
            x2={guide.position}
            y2={pageHeight}
            stroke="#d38b4d"
            strokeDasharray="4 4"
            pointerEvents="none"
          />
        ) : (
          <line
            key={index}
            data-selection="true"
            aria-hidden="true"
            x1="0"
            y1={guide.position}
            x2={pageWidth}
            y2={guide.position}
            stroke="#d38b4d"
            strokeDasharray="4 4"
            pointerEvents="none"
          />
        ),
      )}
      {selectionBox && (
        <rect
          data-selection="true"
          aria-hidden="true"
          x={selectionBox.x}
          y={selectionBox.y}
          width={selectionBox.w}
          height={selectionBox.h}
          fill="#43826820"
          stroke="#438268"
          strokeDasharray="5 3"
          pointerEvents="none"
        />
      )}
    </svg>
  );
});
