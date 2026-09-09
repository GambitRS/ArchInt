import type { PointerEventHandler, RefObject } from "react";
import { Diagram, type Drawing, type Element, type Kind } from "../diagram";

type Tool = Kind | "select";

const symbols: Record<string, string> = {
  select: "↖",
  card: "▭",
  container: "▣",
  text: "T",
  ellipse: "◯",
  arrow: "↗",
  pen: "〰",
  icon: "◇",
};

type EditorPageProps = {
  drawing: Drawing;
  element?: Element;
  selected: string | null;
  tool: Tool;
  grid: boolean;
  zoom: number;
  status: string;
  canUndo: boolean;
  canRedo: boolean;
  svgRef: RefObject<SVGSVGElement | null>;
  onBack: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onToolChange: (tool: Tool) => void;
  onGridChange: (visible: boolean) => void;
  onPointerDown: PointerEventHandler<SVGSVGElement>;
  onPointerMove: PointerEventHandler<SVGSVGElement>;
  onPointerUp: PointerEventHandler<SVGSVGElement>;
  onZoomOut: () => void;
  onFitZoom: () => void;
  onZoomIn: () => void;
  onUpdate: (patch: Partial<Element>) => void;
  onDuplicate: () => void;
  onSendToBack: () => void;
  onRemove: () => void;
  onSelect: (id: string | null) => void;
};

export function EditorPage({
  drawing,
  element,
  selected,
  tool,
  grid,
  zoom,
  status,
  canUndo,
  canRedo,
  svgRef,
  onBack,
  onUndo,
  onRedo,
  onToolChange,
  onGridChange,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onZoomOut,
  onFitZoom,
  onZoomIn,
  onUpdate,
  onDuplicate,
  onSendToBack,
  onRemove,
  onSelect,
}: EditorPageProps) {
  return (
    <>
      <div className="editor-toolbar">
        <button onClick={onBack}>← All drawings</button>
        <div className="row">
          <span className="document-tag">{drawing.category}</span>
          <span className="muted">{drawing.elements.length} elements</span>
        </div>
        <div className="row">
          <button onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">
            ↶ Undo
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Shift+Z)"
          >
            ↷ Redo
          </button>
        </div>
      </div>
      <main className="editor-layout">
        <aside className="tools-panel">
          <div className="eyebrow">CREATE</div>
          <div className="tools">
            {(
              [
                "select",
                "card",
                "container",
                "text",
                "ellipse",
                "arrow",
                "pen",
                "icon",
              ] as const
            ).map((currentTool) => (
              <button
                aria-pressed={tool === currentTool}
                key={currentTool}
                className={tool === currentTool ? "tool active" : "tool"}
                onClick={() => onToolChange(currentTool)}
              >
                <span>{symbols[currentTool]}</span>
                <small>
                  {
                    {
                      select: "Select",
                      card: "Card",
                      container: "Container",
                      text: "Text",
                      ellipse: "Ellipse",
                      arrow: "Arrow",
                      pen: "Freehand",
                      icon: "Icon",
                    }[currentTool]
                  }
                </small>
              </button>
            ))}
          </div>
          <div className="panel-section">
            <span className="eyebrow">QUICK GUIDE</span>
            <p>Choose a tool, then click the canvas to add it.</p>
            <p>
              Drag arrows and freehand strokes. Select any element to move or
              style it.
            </p>
          </div>
          <div className="tool-bottom">
            <span>⌘</span>
            <p>
              <kbd>V</kbd> Select <kbd>R</kbd> Card
              <br />
              <kbd>T</kbd> Text <kbd>A</kbd> Arrow
            </p>
          </div>
        </aside>
        <section className={"canvas-workspace" + (grid ? " dotted" : "")}>
          <div className="canvas-label">
            PAGE 01 <span>/</span> {drawing.name}
          </div>
          <div className="canvas-scroll">
            <div
              className="paper"
              style={{
                width: (1400 * zoom) / 100,
                height: (900 * zoom) / 100,
              }}
            >
              <Diagram
                svgRef={svgRef}
                elements={drawing.elements}
                selected={selected}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
              />
            </div>
          </div>
          <div className="canvas-bottom">
            <span>
              {tool === "select"
                ? "Select an element to start editing"
                : "Click the canvas to add " +
                  (tool === "pen" ? "a freehand stroke" : "a " + tool)}
            </span>
            <div className="zoom-control">
              <button aria-label="Zoom out" onClick={onZoomOut}>
                −
              </button>
              <button onClick={onFitZoom} title="Fit page">
                {zoom}%
              </button>
              <button aria-label="Zoom in" onClick={onZoomIn}>
                ＋
              </button>
            </div>
          </div>
        </section>
        <aside className="properties">
          <div className="row between">
            <h3>{element ? "Element" : "Canvas"}</h3>
            <span className="muted">✷</span>
          </div>
          {element ? (
            <>
              <div className="selected-type">
                {symbols[element.kind]} <strong>{element.kind}</strong>
                <span className="status-dot" />
              </div>
              <label>
                Label
                <textarea
                  value={element.text}
                  onChange={(e) => onUpdate({ text: e.target.value })}
                />
              </label>
              {element.kind === "card" && (
                <label>
                  Description
                  <textarea
                    value={element.detail}
                    onChange={(e) => onUpdate({ detail: e.target.value })}
                  />
                </label>
              )}
              <div className="property-grid">
                {(["x", "y", "w", "h"] as const).map((key) => (
                  <label key={key}>
                    {
                      {
                        x: "X position",
                        y: "Y position",
                        w: "Width",
                        h: "Height",
                      }[key]
                    }
                    <input
                      type="number"
                      value={Math.round(element[key])}
                      onChange={(e) =>
                        onUpdate({
                          [key]:
                            ["w", "h"].includes(key) &&
                            element.kind !== "arrow"
                              ? Math.max(20, Number(e.target.value))
                              : Number(e.target.value),
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <div className="panel-section">
                <span className="eyebrow">APPEARANCE</span>
                <label className="color-row">
                  Fill
                  <input
                    aria-label="Fill color"
                    type="color"
                    value={element.fill}
                    onChange={(e) => onUpdate({ fill: e.target.value })}
                  />
                </label>
                <label className="color-row">
                  Stroke
                  <input
                    aria-label="Stroke color"
                    type="color"
                    value={element.stroke}
                    onChange={(e) => onUpdate({ stroke: e.target.value })}
                  />
                </label>
                <label>
                  Text size
                  <input
                    type="number"
                    min="8"
                    max="80"
                    value={element.fontSize}
                    onChange={(e) =>
                      onUpdate({
                        fontSize: Math.max(
                          8,
                          Math.min(80, Number(e.target.value)),
                        ),
                      })
                    }
                  />
                </label>
              </div>
              <button className="secondary wide" onClick={onDuplicate}>
                Duplicate element
              </button>
              <button className="secondary wide" onClick={onSendToBack}>
                Send to back
              </button>
              <button className="delete wide" onClick={onRemove}>
                Delete element
              </button>
            </>
          ) : (
            <>
              <label>
                Page size
                <div className="static-input">Landscape · 1400 × 900</div>
              </label>
              <label className="color-row">
                Show dot grid
                <input
                  type="checkbox"
                  checked={grid}
                  onChange={(e) => onGridChange(e.target.checked)}
                />
              </label>
              <div className="panel-section">
                <span className="eyebrow">DOCUMENT PALETTE</span>
                <div className="palette">
                  {[
                    "#203c33",
                    "#7392b8",
                    "#c9bcf1",
                    "#e6c87c",
                    "#e9f0ed",
                  ].map((color) => (
                    <span key={color} style={{ background: color }} />
                  ))}
                </div>
              </div>
              <div className="inspector-note">
                <span>↖</span>
                <h3>A little more detail.</h3>
                <p>
                  Select an element to edit its text, color, size, and
                  position.
                </p>
              </div>
            </>
          )}
          <div className="layers">
            <span className="eyebrow">
              LAYERS <span>{drawing.elements.length}</span>
            </span>
            <div className="layer-list">
              {[...drawing.elements].reverse().map((layer) => (
                <button
                  key={layer.id}
                  className={layer.id === selected ? "active" : ""}
                  onClick={() => onSelect(layer.id)}
                >
                  <span>{symbols[layer.kind]}</span>
                  {layer.text || layer.kind}
                </button>
              ))}
            </div>
          </div>
        </aside>
      </main>
      <footer className="editor-footer">
        <span>
          <i className="status-dot" /> Personal workspace · Autosave on
          <span className="save-status"> · {status}</span>
        </span>
        <span>
          Built for the big picture <span className="brand-dot">✳</span>
        </span>
      </footer>
    </>
  );
}
