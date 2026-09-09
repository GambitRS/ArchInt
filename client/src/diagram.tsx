import { memo, type PointerEventHandler, type Ref } from "react";
import {
  anchorPoint,
  boundsForElements,
  connectorLabelPoint,
  connectorPoints,
  type SnapGuide,
} from "./editor/geometry";
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
};
export type Drawing = {
  id: string;
  name: string;
  updated: string;
  category: string;
  elements: Element[];
  revision: number;
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
  const iconPadding = element.iconName ? 38 : 0;
  return align === "right"
    ? element.w - padding
    : element.kind === "text"
      ? iconPadding
      : padding + iconPadding;
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
}) {
  const visibleElements = elements.filter(
    (element) => !isHiddenByParent(element, elements),
  );
  const selected = new Set(selectedIds);
  const selectedBounds = boundsForElements(visibleElements, selectedIds);
  return (
    <svg
      ref={svgRef}
      viewBox="0 0 1400 900"
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
        width="1400"
        height="900"
        fill="white"
      />
      <g data-connectors="true">
        {visibleElements
          .filter((element) => element.kind === "arrow")
          .map((e) => {
            const points = connectorPoints(e, elements);
            const path = pointsPath(points);
            const label = connectorLabelPoint(points);
            const strokeWidth = e.strokeWidth ?? 2.5;
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
                  data-connector-path="true"
                />
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
                Math.max(1, e.kind === "text" ? e.w : e.w - 36),
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
                Math.max(1, e.w - 36),
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
            y2="900"
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
            x2="1400"
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
