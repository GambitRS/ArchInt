import type { PointerEventHandler, Ref } from "react";
import { boundsForElements, type SnapGuide } from "./editor/geometry";
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
    "◉  You",
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
  [
    "☁  Cloud model",
    "▣  Local model",
    "◇  Vision model",
    "◎  Speech model",
  ].forEach((s, i) =>
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
  ["▤  Documents", "◎  Browser", "▣  Terminal", "◇  Images", "▦  Data"].forEach(
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
  return align === "right"
    ? element.w - padding
    : element.kind === "text"
      ? 0
      : padding;
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

export function Diagram({
  elements,
  selectedIds = [],
  guides = [],
  selectionBox,
  onTextDoubleClick,
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
      aria-label="Architecture drawing"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{ touchAction: "none", fontFamily: "Arial, sans-serif" }}
    >
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
      <rect width="1400" height="900" fill="white" />
      {visibleElements.map((e) => (
        <g
          key={e.id}
          data-element={e.id}
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
          {e.kind === "arrow" && (
            <>
              <path
                d={`M0 0 L${e.w} ${e.h}`}
                stroke="transparent"
                strokeWidth="18"
              />
              <path
                d={`M0 0 L${e.w} ${e.h}`}
                fill="none"
                stroke={e.stroke}
                strokeWidth={e.strokeWidth ?? 2.5}
              />
              <path
                d="M-10 -5 L0 0 L-10 5"
                fill="none"
                stroke={e.stroke}
                strokeWidth={e.strokeWidth ?? 2.5}
                transform={`translate(${e.w} ${e.h}) rotate(${(Math.atan2(e.h, e.w) * 180) / Math.PI})`}
              />
            </>
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
          {!["pen", "arrow"].includes(e.kind) && (
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
            <text x="18" y={e.h < 60 ? 43 : 60} fill="#637990" fontSize="13">
              {wrapLines(
                e.detail,
                Math.max(1, e.w - 36),
                13,
                e.wrap !== false,
              ).map((line, i) => (
                <tspan key={i} x="18" dy={i ? 17 : 0}>
                  {line}
                </tspan>
              ))}
            </text>
          )}
          </g>
          {selectedIds.length === 1 && selected.has(e.id) && (
            <g data-selection="true">
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
      {selectedIds.length > 1 && selectedBounds && (
        <rect
          data-selection="true"
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
}
