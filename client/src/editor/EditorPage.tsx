import { useState, type PointerEventHandler, type RefObject } from "react";
import {
  ArchimateCornerGlyph,
  Diagram,
  type Drawing,
  type Element,
  type Kind,
} from "../diagram";
import type { SnapGuide } from "./geometry";
import {
  ARCHIMATE_CATALOG,
  isArchimateElementType,
  type ArchimateElementType,
  type ArchimateRelationshipType,
} from "../model/archimate";

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
  showAnchors: boolean;
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
  onAddWaypoint: () => void;
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
  viewId: string;
  viewSummaries: { id: string; name: string; width: number; height: number }[];
  onViewChange: (id: string) => void;
  onCreateView: () => void;
  onRenameView: () => void;
  onRemoveView: () => void;
  onAddSemantic: (type: ArchimateElementType) => void;
  onPlaceModelElement: (id: string) => void;
  onAssignElementType: (type: ArchimateElementType) => void;
  onAssignRelationshipType: (type: ArchimateRelationshipType) => void;
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
  showAnchors,
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
  onAddWaypoint,
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
  viewId,
  viewSummaries,
  onViewChange,
  onCreateView,
  onRenameView,
  onRemoveView,
  onAddSemantic,
  onPlaceModelElement,
  onAssignElementType,
  onAssignRelationshipType,
}: EditorPageProps) {
  const [paletteSearch, setPaletteSearch] = useState("");
  const activeView = drawing.document?.views.find((view) => view.id === viewId);
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
          <label className="view-selector">
            <span className="sr-only">Current view</span>
            <select value={viewId} onChange={(event) => onViewChange(event.target.value)}>
              {viewSummaries.map((view) => (
                <option key={view.id} value={view.id}>
                  {view.name}
                </option>
              ))}
            </select>
          </label>
          <button className="compact-action" onClick={onCreateView} title="Create view">
            + View
          </button>
          <button className="compact-action" onClick={onRenameView} title="Rename view">
            Rename
          </button>
          <button
            className="compact-action"
            onClick={onRemoveView}
            disabled={viewSummaries.length <= 1}
            title="Remove current view"
          >
            Remove
          </button>
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
      <main className="editor-layout" aria-label="Drawing editor">
        <aside className="tools-panel" aria-label="Drawing tools">
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
          <div className="panel-section semantic-palette">
            <div className="row between">
              <span className="eyebrow">ARCHIMATE 4.0</span>
              <span className="muted">{ARCHIMATE_CATALOG.elements.length}</span>
            </div>
            <input
              aria-label="Search ArchiMate palette"
              placeholder="Search concepts…"
              value={paletteSearch}
              onChange={(event) => setPaletteSearch(event.target.value)}
            />
            <div className="semantic-palette-list">
              {ARCHIMATE_CATALOG.domains.map((domain) => {
                const items = ARCHIMATE_CATALOG.elements.filter(
                  (candidate) =>
                    candidate.domain === domain.id &&
                    `${candidate.name} ${candidate.description}`
                      .toLowerCase()
                      .includes(paletteSearch.toLowerCase()),
                );
                if (!items.length) return null;
                return (
                  <div key={domain.id} className="semantic-domain">
                    <span>{domain.name}</span>
                    {items.map((candidate) => (
                      <button
                        key={candidate.id}
                        type="button"
                        title={candidate.description}
                        onClick={() => onAddSemantic(candidate.id as ArchimateElementType)}
                      >
                        <svg className="semantic-glyph" viewBox="0 0 24 24" aria-hidden="true">
                          <ArchimateCornerGlyph
                            type={candidate.id as ArchimateElementType}
                            x={0}
                            y={0}
                            w={24}
                            h={24}
                            color="#53765b"
                            fill="none"
                          />
                        </svg>
                        {candidate.name}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
            {drawing.document && Object.keys(drawing.document.model.elements).length > 0 && (
              <div className="semantic-domain existing-models">
                <span>Existing model elements</span>
                {Object.values(drawing.document.model.elements).map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    title="Place another occurrence in this view"
                    onClick={() => onPlaceModelElement(candidate.id)}
                  >
                    <span className="semantic-glyph" aria-hidden="true">↗</span>
                    {candidate.name}
                  </button>
                ))}
              </div>
            )}
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
        <section
          className={"canvas-workspace" + (grid ? " dotted" : "")}
          aria-label="Drawing canvas"
        >
          <div className="canvas-label">
            PAGE 01 <span>/</span> {drawing.name}
          </div>
          <div className="canvas-scroll">
            <div
              className="paper"
              style={{
                width: ((activeView?.width || 1400) * zoom) / 100,
                height: ((activeView?.height || 900) * zoom) / 100,
              }}
            >
              <Diagram
                svgRef={svgRef}
                elements={drawing.elements}
                selectedIds={selectedIds}
                guides={guides}
                selectionBox={selectionBox}
                onTextDoubleClick={onTextDoubleClick}
                showAnchors={showAnchors}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                page={{
                  width: activeView?.width || 1400,
                  height: activeView?.height || 900,
                  background: activeView?.background || "#ffffff",
                }}
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
        <aside className="properties" aria-label="Properties and layers">
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
                {element.archimateType && (
                  <span className="semantic-badge">
                    {ARCHIMATE_CATALOG.elements.find((candidate) => candidate.id === element.archimateType)?.name || element.archimateType}
                  </span>
                )}
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
              {element.kind !== "arrow" && element.kind !== "pen" && (
                <label>
                  ArchiMate 4.0 type
                  <select
                    disabled={isLocked}
                    value={element.archimateType || ""}
                    onChange={(event) => {
                      if (isArchimateElementType(event.target.value)) onAssignElementType(event.target.value);
                    }}
                  >
                    <option value="">Generic annotation</option>
                    {ARCHIMATE_CATALOG.domains.map((domain) => (
                      <optgroup key={domain.id} label={domain.name}>
                        {ARCHIMATE_CATALOG.elements
                          .filter((candidate) => candidate.domain === domain.id)
                          .map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>
                              {candidate.name}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
              )}
              {element.kind !== "arrow" && element.kind !== "pen" && (
                <label>
                  Vector icon
                  <select
                    disabled={isLocked}
                    value={element.iconName || ""}
                    onChange={(e) =>
                      onUpdate({
                        iconName: e.target.value
                          ? (e.target.value as NonNullable<Element["iconName"]>)
                          : undefined,
                      })
                    }
                  >
                    <option value="">No icon</option>
                    <option value="computer">Computer</option>
                    <option value="person">Person</option>
                    <option value="cloud">Cloud</option>
                    <option value="model">Model / chip</option>
                    <option value="database">Database</option>
                    <option value="shield">Shield</option>
                    <option value="folder">Folder</option>
                    <option value="terminal">Terminal</option>
                    <option value="globe">Globe</option>
                    <option value="microphone">Microphone</option>
                  </select>
                </label>
              )}
              {element.kind === "arrow" && (
                <div className="connector-controls">
                  <span className="eyebrow">CONNECTOR</span>
                  <label>
                    ArchiMate relationship
                    <select
                      disabled={isLocked}
                      value={element.relationshipType || ""}
                      onChange={(event) => {
                        if (event.target.value) onAssignRelationshipType(event.target.value as ArchimateRelationshipType);
                      }}
                    >
                      <option value="">Generic connector</option>
                      {ARCHIMATE_CATALOG.relationships.map((relationship) => (
                        <option key={relationship.id} value={relationship.id}>
                          {relationship.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {element.relationshipType === "Access" && (
                    <label>
                      Access type
                      <select
                        disabled={isLocked}
                        value={element.accessType || "unspecified"}
                        onChange={(event) =>
                          onUpdate({
                            accessType: event.target.value as Element["accessType"],
                          })
                        }
                      >
                        <option value="unspecified">Unspecified</option>
                        <option value="read">Read</option>
                        <option value="write">Write</option>
                        <option value="read-write">Read / write</option>
                      </select>
                    </label>
                  )}
                  {element.relationshipType === "Influence" && (
                    <label>
                      Influence strength
                      <select
                        disabled={isLocked}
                        value={element.influenceStrength || ""}
                        onChange={(event) =>
                          onUpdate({
                            influenceStrength: event.target.value as Element["influenceStrength"],
                          })
                        }
                      >
                        <option value="">Unspecified</option>
                        <option value="+">+</option>
                        <option value="++">++</option>
                        <option value="-">-</option>
                        <option value="--">--</option>
                      </select>
                    </label>
                  )}
                  <div className="property-grid">
                    <label>
                      Source multiplicity
                      <input
                        placeholder="0..*"
                        disabled={isLocked}
                        value={element.sourceMultiplicity || ""}
                        onChange={(event) => onUpdate({ sourceMultiplicity: event.target.value })}
                      />
                    </label>
                    <label>
                      Target multiplicity
                      <input
                        placeholder="1"
                        disabled={isLocked}
                        value={element.targetMultiplicity || ""}
                        onChange={(event) => onUpdate({ targetMultiplicity: event.target.value })}
                      />
                    </label>
                  </div>
                  <label>
                    Route
                    <select
                      disabled={isLocked}
                      value={element.route || "straight"}
                      onChange={(e) =>
                        onUpdate({
                          route: e.target.value as "straight" | "orthogonal",
                        })
                      }
                    >
                      <option value="straight">Straight</option>
                      <option value="orthogonal">Orthogonal</option>
                    </select>
                  </label>
                  <label>
                    Arrowhead
                    <select
                      disabled={isLocked}
                      value={element.arrowhead || "open"}
                      onChange={(e) =>
                        onUpdate({
                          arrowhead: e.target.value as
                            | "none"
                            | "open"
                            | "triangle"
                            | "circle",
                        })
                      }
                    >
                      <option value="triangle">Triangle</option>
                      <option value="open">Open</option>
                      <option value="circle">Circle</option>
                      <option value="none">None</option>
                    </select>
                  </label>
                  <div className="connector-status">
                    <span>{element.sourceAnchor ? "Named source" : "Free source"}</span>
                    <span>{element.targetAnchor ? "Named target" : "Free target"}</span>
                  </div>
                  <button
                    className="secondary"
                    disabled={isLocked}
                    onClick={onAddWaypoint}
                  >
                    Add waypoint
                  </button>
                </div>
              )}
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
              {element.archimateType && (
                <label>
                  Model properties
                  <textarea
                    value={Object.entries(element.semanticProperties || {})
                      .map(([key, value]) => `${key}=${value}`)
                      .join("\n")}
                    disabled={isLocked}
                    placeholder="owner=Architecture team"
                    onChange={(event) => {
                      const properties: Record<string, string> = {};
                      for (const line of event.target.value.split(/\r?\n/)) {
                        const separator = line.indexOf("=");
                        if (separator > 0) properties[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
                      }
                      onUpdate({ semanticProperties: properties }, false);
                    }}
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
