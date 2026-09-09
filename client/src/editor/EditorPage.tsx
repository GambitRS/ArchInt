import type { PointerEventHandler, RefObject } from "react";
import { Diagram, type Drawing, type Element, type Kind } from "../diagram";
import type { SnapGuide } from "./geometry";

type Tool = Kind | "select" | "eraser";
type Alignment =
  | "left"
  | "center-x"
  | "right"
  | "top"
  | "center-y"
  | "bottom";
type Distribution = "horizontal" | "vertical";

const symbols: Record<string, string> = {
  select: "↖",
  card: "▭",
  container: "▣",
  text: "T",
  ellipse: "◯",
  arrow: "↗",
  pen: "〰",
  eraser: "⌫",
  icon: "◇",
};

const toolNames: Record<Tool, string> = {
  select: "Select",
  card: "Card",
  container: "Container",
  text: "Text",
  ellipse: "Ellipse",
  arrow: "Arrow",
  pen: "Freehand",
  eraser: "Eraser",
  icon: "Icon",
};

type EditorPageProps = {
  drawing: Drawing;
  element?: Element;
  selectedIds: string[];
  tool: Tool;
  grid: boolean;
  zoom: number;
  status: string;
  guides: SnapGuide[];
  selectionBox: { x: number; y: number; w: number; h: number } | null;
  onTextDoubleClick: (id: string) => void;
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
  onUpdate: (patch: Partial<Element>, remember?: boolean) => void;
  onFinishTextEdit: () => void;
  onDuplicate: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onGroup: () => void;
  onUngroup: () => void;
  onToggleLock: () => void;
  onToggleVisibility: () => void;
  onToggleLockFor: (id: string) => void;
  onToggleVisibilityFor: (id: string) => void;
  onBringToFront: () => void;
  onMoveForward: () => void;
  onMoveBackward: () => void;
  onSendToBack: () => void;
  onAlign: (alignment: Alignment) => void;
  onDistribute: (distribution: Distribution) => void;
  onRemove: () => void;
  onSelect: (id: string | null, additive?: boolean) => void;
};

export function EditorPage({
  drawing,
  element,
  selectedIds,
  tool,
  grid,
  zoom,
  status,
  guides,
  selectionBox,
  onTextDoubleClick,
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
  onFinishTextEdit,
  onDuplicate,
  onCopy,
  onPaste,
  onGroup,
  onUngroup,
  onToggleLock,
  onToggleVisibility,
  onToggleLockFor,
  onToggleVisibilityFor,
  onBringToFront,
  onMoveForward,
  onMoveBackward,
  onSendToBack,
  onAlign,
  onDistribute,
  onRemove,
  onSelect,
}: EditorPageProps) {
  const hasGroup = selectedIds.some(
    (id) => drawing.elements.find((candidate) => candidate.id === id)?.groupId,
  );
  const isLocked = Boolean(element?.locked);
  const isHidden = Boolean(element?.hidden);
  const isStroke = element?.kind === "pen" || element?.kind === "arrow";

  return (
    <>
      <div className="editor-toolbar">
        <button onClick={onBack}>← All drawings</button>
        <div className="row">
          <span className="document-tag">{drawing.category}</span>
          <span className="muted">
            {selectedIds.length > 1
              ? `${selectedIds.length} selected · `
              : ""}
            {drawing.elements.length} elements
          </span>
        </div>
        <div className="row editor-actions">
          <button onClick={onCopy} disabled={!selectedIds.length} title="Copy selection (Ctrl+C)">
            Copy
          </button>
          <button onClick={onPaste} title="Paste selection (Ctrl+V)">
            Paste
          </button>
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
                "eraser",
                "icon",
              ] as const
            ).map((currentTool) => (
              <button
                aria-pressed={tool === currentTool}
                key={currentTool}
                className={tool === currentTool ? "tool active" : "tool"}
                onClick={() => onToolChange(currentTool)}
                title={toolNames[currentTool]}
              >
                <span>{symbols[currentTool]}</span>
                <small>{toolNames[currentTool]}</small>
              </button>
            ))}
          </div>
          <div className="panel-section">
            <span className="eyebrow">QUICK GUIDE</span>
            <p>Click an object to select it. Shift-click or drag an empty area to select several.</p>
            <p>
              Drag selected objects to move them. Shift-resize keeps the aspect ratio;
              guides appear when edges and centers align.
            </p>
          </div>
          <div className="tool-bottom">
            <span>⌘</span>
            <p>
              <kbd>V</kbd> Select <kbd>R</kbd> Card
              <br />
              <kbd>T</kbd> Text <kbd>O</kbd> Ellipse
              <br />
              <kbd>A</kbd> Arrow <kbd>P</kbd> Draw <kbd>E</kbd> Erase
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
                selectedIds={selectedIds}
                guides={guides}
                selectionBox={selectionBox}
                onTextDoubleClick={onTextDoubleClick}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
              />
            </div>
          </div>
          <div className="canvas-bottom">
            <span>
              {tool === "select"
                ? "Select, shift-click, or marquee-select elements"
                : tool === "eraser"
                  ? "Drag across a freehand stroke to erase it"
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
            <h3>
              {element
                ? "Element"
                : selectedIds.length
                  ? `${selectedIds.length} selected`
                  : "Canvas"}
            </h3>
            <span className="muted">✷</span>
          </div>
          {element ? (
            <>
              <div className="selected-type">
                {symbols[element.kind]} <strong>{element.kind}</strong>
                {isLocked && <span title="Locked">🔒</span>}
                {isHidden && <span title="Hidden">◌</span>}
                <span className="status-dot" />
              </div>
              <label>
                Label
                <textarea
                  value={element.text}
                  data-primary-label="true"
                  disabled={isLocked}
                  onChange={(e) => onUpdate({ text: e.target.value }, false)}
                  onBlur={onFinishTextEdit}
                />
              </label>
              {element.kind === "card" && (
                <label>
                  Description
                  <textarea
                    value={element.detail}
                    disabled={isLocked}
                    onChange={(e) => onUpdate({ detail: e.target.value }, false)}
                    onBlur={onFinishTextEdit}
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
                      disabled={isLocked}
                      value={Math.round(element[key])}
                      onChange={(e) =>
                        onUpdate({
                          [key]:
                            ["w", "h"].includes(key) && element.kind !== "arrow"
                              ? Math.max(20, Number(e.target.value))
                              : Number(e.target.value),
                        })
                      }
                    />
                  </label>
                ))}
                <label>
                  Rotation
                  <input
                    type="number"
                    min="-180"
                    max="180"
                    disabled={isLocked}
                    value={Math.round(element.rotation || 0)}
                    onChange={(e) =>
                      onUpdate({
                        rotation: Math.max(-180, Math.min(180, Number(e.target.value))),
                      })
                    }
                  />
                </label>
              </div>
              <div className="panel-section">
                <span className="eyebrow">APPEARANCE</span>
                {!isStroke && (
                  <label className="color-row">
                    Fill
                    <input
                      aria-label="Fill color"
                      type="color"
                      disabled={isLocked}
                      value={element.fill}
                      onChange={(e) => onUpdate({ fill: e.target.value })}
                    />
                  </label>
                )}
                <label className="color-row">
                  {element.kind === "pen" ? "Freehand color" : "Stroke"}
                  <input
                    aria-label={element.kind === "pen" ? "Freehand color" : "Stroke color"}
                    type="color"
                    disabled={isLocked}
                    value={element.stroke}
                    onChange={(e) => onUpdate({ stroke: e.target.value })}
                  />
                </label>
                <label>
                  Stroke width
                  <input
                    type="number"
                    min="0.5"
                    max="20"
                    step="0.5"
                    disabled={isLocked}
                    value={element.strokeWidth ?? (element.kind === "pen" ? 3 : 1.5)}
                    onChange={(e) =>
                      onUpdate({
                        strokeWidth: Math.max(0.5, Math.min(20, Number(e.target.value))),
                      })
                    }
                  />
                </label>
                {!isStroke && (
                  <>
                    <label>
                      Text size
                      <input
                        type="number"
                        min="8"
                        max="80"
                        disabled={isLocked}
                        value={element.fontSize}
                        onChange={(e) =>
                          onUpdate({
                            fontSize: Math.max(8, Math.min(80, Number(e.target.value))),
                          })
                        }
                      />
                    </label>
                    <label>
                      Font weight
                      <select
                        disabled={isLocked}
                        value={element.fontWeight || 600}
                        onChange={(e) =>
                          onUpdate({
                            fontWeight: Number(e.target.value) as 400 | 500 | 600 | 700,
                          })
                        }
                      >
                        <option value="400">Regular</option>
                        <option value="500">Medium</option>
                        <option value="600">Semibold</option>
                        <option value="700">Bold</option>
                      </select>
                    </label>
                    <label>
                      Line height
                      <input
                        type="number"
                        min="1"
                        max="3"
                        step="0.05"
                        disabled={isLocked}
                        value={element.lineHeight || 1.35}
                        onChange={(e) =>
                          onUpdate({
                            lineHeight: Math.max(1, Math.min(3, Number(e.target.value))),
                          })
                        }
                      />
                    </label>
                    <label>
                      Text alignment
                      <select
                        disabled={isLocked}
                        value={element.textAlign || "left"}
                        onChange={(e) =>
                          onUpdate({
                            textAlign: e.target.value as "left" | "center" | "right",
                          })
                        }
                      >
                        <option value="left">Left</option>
                        <option value="center">Center</option>
                        <option value="right">Right</option>
                      </select>
                    </label>
                    <label className="color-row">
                      Wrap text
                      <input
                        type="checkbox"
                        disabled={isLocked}
                        checked={element.wrap !== false}
                        onChange={(e) => onUpdate({ wrap: e.target.checked })}
                      />
                    </label>
                    <label>
                      Overflow
                      <select
                        disabled={isLocked}
                        value={element.overflow || "visible"}
                        onChange={(e) =>
                          onUpdate({ overflow: e.target.value as "visible" | "hidden" })
                        }
                      >
                        <option value="visible">Visible</option>
                        <option value="hidden">Clip to bounds</option>
                      </select>
                    </label>
                  </>
                )}
              </div>
              <div className="button-grid">
                <button className="secondary" onClick={onDuplicate}>
                  Duplicate
                </button>
                <button className="secondary" onClick={onCopy}>
                  Copy
                </button>
                <button className="secondary" onClick={onToggleLock}>
                  {isLocked ? "Unlock" : "Lock"}
                </button>
                <button className="secondary" onClick={onToggleVisibility}>
                  {isHidden ? "Show" : "Hide"}
                </button>
              </div>
            </>
          ) : selectedIds.length ? (
            <div className="selection-actions">
              <p>Selecting together keeps the objects aligned while you move them.</p>
              <div className="button-grid">
                <button className="secondary" disabled={selectedIds.length < 2} onClick={onGroup}>
                  Group
                </button>
                <button className="secondary" disabled={!hasGroup} onClick={onUngroup}>
                  Ungroup
                </button>
                <button className="secondary" onClick={onCopy}>
                  Copy
                </button>
                <button className="secondary" onClick={onToggleLock}>
                  Lock / unlock
                </button>
              </div>
            </div>
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
                  {["#203c33", "#7392b8", "#c9bcf1", "#e6c87c", "#e9f0ed"].map(
                    (color) => (
                      <span key={color} style={{ background: color }} />
                    ),
                  )}
                </div>
              </div>
              <div className="inspector-note">
                <span>↖</span>
                <h3>A little more detail.</h3>
                <p>
                  Select an element, shift-click several, or drag an empty area to
                  edit the layout.
                </p>
              </div>
            </>
          )}
          {selectedIds.length >= 2 && (
            <div className="panel-section arrange-section">
              <span className="eyebrow">ALIGN & DISTRIBUTE</span>
              <div className="button-grid compact">
                <button className="secondary" onClick={() => onAlign("left")}>Left</button>
                <button className="secondary" onClick={() => onAlign("center-x")}>Center X</button>
                <button className="secondary" onClick={() => onAlign("right")}>Right</button>
                <button className="secondary" onClick={() => onAlign("top")}>Top</button>
                <button className="secondary" onClick={() => onAlign("center-y")}>Center Y</button>
                <button className="secondary" onClick={() => onAlign("bottom")}>Bottom</button>
                <button className="secondary" disabled={selectedIds.length < 3} onClick={() => onDistribute("horizontal")}>Space X</button>
                <button className="secondary" disabled={selectedIds.length < 3} onClick={() => onDistribute("vertical")}>Space Y</button>
              </div>
            </div>
          )}
          {selectedIds.length > 0 && (
            <div className="panel-section arrange-section">
              <span className="eyebrow">ORDER</span>
              <div className="button-grid compact">
                <button className="secondary" onClick={onBringToFront}>To front</button>
                <button className="secondary" onClick={onMoveForward}>Forward</button>
                <button className="secondary" onClick={onMoveBackward}>Backward</button>
                <button className="secondary" onClick={onSendToBack}>To back</button>
              </div>
              <button className="delete wide" onClick={onRemove}>
                Delete selection
              </button>
            </div>
          )}
          <div className="layers">
            <span className="eyebrow">
              LAYERS <span>{drawing.elements.length}</span>
            </span>
            <div className="layer-list">
              {[...drawing.elements].reverse().map((layer) => (
                <div
                  key={layer.id}
                  className={
                    "layer-row" +
                    (selectedIds.includes(layer.id) ? " active" : "") +
                    (layer.hidden ? " hidden" : "") +
                    (layer.locked ? " locked" : "")
                  }
                >
                  <button
                    className="layer-select"
                    aria-pressed={selectedIds.includes(layer.id)}
                    onClick={(event) =>
                      onSelect(layer.id, event.shiftKey || event.metaKey || event.ctrlKey)
                    }
                  >
                    <span>{symbols[layer.kind]}</span>
                    <span>{layer.text || layer.kind}</span>
                  </button>
                  <button
                    className="layer-icon"
                    aria-label={layer.hidden ? `Show ${layer.text || layer.kind}` : `Hide ${layer.text || layer.kind}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleVisibilityFor(layer.id);
                    }}
                  >
                    {layer.hidden ? "◌" : "◉"}
                  </button>
                  <button
                    className="layer-icon"
                    aria-label={layer.locked ? `Unlock ${layer.text || layer.kind}` : `Lock ${layer.text || layer.kind}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleLockFor(layer.id);
                    }}
                  >
                    {layer.locked ? "🔒" : "⌑"}
                  </button>
                </div>
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
