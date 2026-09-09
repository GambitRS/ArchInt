import type { Ref, PointerEventHandler } from "react";
export type Kind =
  | "card"
  | "container"
  | "text"
  | "ellipse"
  | "arrow"
  | "pen"
  | "icon";
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
  return list;
}
export function Diagram({
  elements,
  selected,
  svgRef,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  elements: Element[];
  selected?: string | null;
  svgRef?: Ref<SVGSVGElement>;
  onPointerDown?: PointerEventHandler<SVGSVGElement>;
  onPointerMove?: PointerEventHandler<SVGSVGElement>;
  onPointerUp?: PointerEventHandler<SVGSVGElement>;
}) {
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
      <rect width="1400" height="900" fill="white" />
      {elements.map((e) => (
        <g
          key={e.id}
          data-element={e.id}
          transform={`translate(${e.x} ${e.y})`}
          style={{ cursor: onPointerDown ? "move" : undefined }}
        >
          {(e.kind === "card" || e.kind === "container") && (
            <rect
              width={e.w}
              height={e.h}
              rx={e.kind === "container" ? 16 : 10}
              fill={e.fill}
              stroke={e.stroke}
              strokeWidth="1.5"
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
              strokeWidth="2"
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
                strokeWidth="2.5"
              />
              <path
                d="M-10 -5 L0 0 L-10 5"
                fill="none"
                stroke={e.stroke}
                strokeWidth="2.5"
                transform={`translate(${e.w} ${e.h}) rotate(${(Math.atan2(e.h, e.w) * 180) / Math.PI})`}
              />
            </>
          )}
          {e.kind === "pen" && (
            <polyline
              points={e.points?.map((p) => p.join(",")).join(" ")}
              fill="none"
              stroke={e.stroke}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {!["pen", "arrow"].includes(e.kind) && (
            <text
              x={e.kind === "text" ? 0 : 18}
              y={
                e.kind === "text"
                  ? e.fontSize
                  : e.kind === "card" && e.h < 60
                    ? 23
                    : 34
              }
              fill={["text", "icon"].includes(e.kind) ? e.stroke : "#233d46"}
              fontSize={e.fontSize}
              fontWeight={e.kind === "text" && e.fontSize < 25 ? 400 : 600}
            >
              {e.text.split("\n").map((line, i) => (
                <tspan
                  key={i}
                  x={e.kind === "text" ? 0 : 18}
                  dy={i ? e.fontSize * 1.35 : 0}
                >
                  {line}
                </tspan>
              ))}
            </text>
          )}
          {e.kind === "card" && e.detail && (
            <text x="18" y={e.h < 60 ? 43 : 60} fill="#637990" fontSize="13">
              {e.detail}
            </text>
          )}
          {selected === e.id && (
            <g data-selection="true" pointerEvents="none">
              <rect
                x={Math.min(0, e.w) - 4}
                y={Math.min(0, e.h) - 4}
                width={Math.abs(e.w) + 8}
                height={Math.abs(e.h) + 8}
                fill="none"
                stroke="#438268"
                strokeDasharray="5 3"
                strokeWidth="2"
              />
              {[
                [0, 0],
                [e.w, 0],
                [e.w, e.h],
                [0, e.h],
              ].map(([x, y], i) => (
                <rect
                  key={i}
                  x={x - 4}
                  y={y - 4}
                  width="8"
                  height="8"
                  fill="white"
                  stroke="#438268"
                />
              ))}
            </g>
          )}
        </g>
      ))}
    </svg>
  );
}
