import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

type Tool = "brush" | "eraser";

type Point = {
  x: number;
  y: number;
};

type Stroke = {
  color: string;
  points: Point[];
  size: number;
  tool: Tool;
};

const CANVAS_BACKGROUND = "#fbfaf6";

function drawStroke(context: CanvasRenderingContext2D, stroke: Stroke) {
  const [firstPoint, ...remainingPoints] = stroke.points;
  if (!firstPoint) return;

  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = stroke.size;
  context.strokeStyle = stroke.tool === "eraser" ? CANVAS_BACKGROUND : stroke.color;
  context.fillStyle = context.strokeStyle;

  if (remainingPoints.length === 0) {
    context.beginPath();
    context.arc(firstPoint.x, firstPoint.y, stroke.size / 2, 0, Math.PI * 2);
    context.fill();
    context.restore();
    return;
  }

  context.beginPath();
  context.moveTo(firstPoint.x, firstPoint.y);
  for (const point of remainingPoints) {
    context.lineTo(point.x, point.y);
  }
  context.stroke();
  context.restore();
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const activeStrokeRef = useRef<Stroke | null>(null);
  const [tool, setTool] = useState<Tool>("brush");
  const [color, setColor] = useState("#d65a3a");
  const [size, setSize] = useState(8);
  const [strokeCount, setStrokeCount] = useState(0);
  const [message, setMessage] = useState("Ready to draw");

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const bounds = canvas.getBoundingClientRect();
    const width = bounds.width || canvas.clientWidth;
    const height = bounds.height || canvas.clientHeight;
    const pixelRatio = window.devicePixelRatio || 1;

    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = CANVAS_BACKGROUND;
    context.fillRect(0, 0, width, height);

    for (const stroke of strokesRef.current) {
      drawStroke(context, stroke);
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = canvas?.parentElement;
    if (!canvas || !container) return undefined;

    const resizeCanvas = () => {
      const bounds = container.getBoundingClientRect();
      const pixelRatio = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(bounds.width * pixelRatio));
      canvas.height = Math.max(1, Math.floor(bounds.height * pixelRatio));
      redraw();
    };

    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(container);
    resizeCanvas();

    return () => resizeObserver.disconnect();
  }, [redraw]);

  const undo = useCallback(() => {
    if (strokesRef.current.length === 0) return;

    strokesRef.current.pop();
    activeStrokeRef.current = null;
    setStrokeCount(strokesRef.current.length);
    setMessage("Last stroke undone");
    redraw();
  }, [redraw]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      if (event.metaKey || event.ctrlKey) {
        if (key === "z") {
          event.preventDefault();
          undo();
        }
        return;
      }

      if (key === "b") setTool("brush");
      if (key === "e") setTool("eraser");
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo]);

  const pointFromEvent = (event: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    };
  };

  const startStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    const stroke: Stroke = {
      color,
      points: [pointFromEvent(event)],
      size,
      tool,
    };

    activeStrokeRef.current = stroke;
    strokesRef.current.push(stroke);
    setStrokeCount(strokesRef.current.length);
    setMessage(tool === "eraser" ? "Erasing" : "Drawing");
    redraw();
  };

  const extendStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const stroke = activeStrokeRef.current;
    if (!stroke) return;

    stroke.points.push(pointFromEvent(event));
    redraw();
  };

  const finishStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const stroke = activeStrokeRef.current;
    if (!stroke) return;

    stroke.points.push(pointFromEvent(event));
    activeStrokeRef.current = null;
    setMessage("Saved locally");
    redraw();
  };

  const clearCanvas = () => {
    strokesRef.current = [];
    activeStrokeRef.current = null;
    setStrokeCount(0);
    setMessage("Blank canvas");
    redraw();
  };

  const exportCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const link = document.createElement("a");
    link.download = "archint-sketch.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
    setMessage("PNG exported");
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand" aria-label="ArchInt Drawing Studio">
          <div className="brand-mark">AI</div>
          <div>
            <div className="brand-name">ArchInt</div>
            <div className="brand-caption">Drawing studio</div>
          </div>
        </div>

        <div className="topbar-actions">
          <div className="save-state">
            <span className="status-dot" />
            {message}
          </div>
          <button className="button button-secondary" type="button" onClick={clearCanvas}>
            New canvas
          </button>
          <button className="button button-primary" type="button" onClick={exportCanvas}>
            Export PNG <span aria-hidden="true">↗</span>
          </button>
        </div>
      </header>

      <main className="workspace">
        <aside className="panel sidebar-panel">
          <div className="panel-heading">
            <span className="eyebrow">Tools</span>
            <span className="shortcut">⌘ 1</span>
          </div>

          <div className="tool-grid" role="toolbar" aria-label="Drawing tools">
            <button
              className={`tool-button ${tool === "brush" ? "is-active" : ""}`}
              type="button"
              aria-pressed={tool === "brush"}
              onClick={() => setTool("brush")}
            >
              <span className="tool-icon">✎</span>
              <span>Brush</span>
              <span className="tool-shortcut">B</span>
            </button>
            <button
              className={`tool-button ${tool === "eraser" ? "is-active" : ""}`}
              type="button"
              aria-pressed={tool === "eraser"}
              onClick={() => setTool("eraser")}
            >
              <span className="tool-icon">⌫</span>
              <span>Eraser</span>
              <span className="tool-shortcut">E</span>
            </button>
          </div>

          <div className="control-section">
            <div className="control-label-row">
              <label htmlFor="brush-size">Brush size</label>
              <output htmlFor="brush-size">{size}px</output>
            </div>
            <input
              id="brush-size"
              type="range"
              min="1"
              max="48"
              value={size}
              onChange={(event) => setSize(Number(event.target.value))}
            />
            <div className="range-labels">
              <span>Fine</span>
              <span>Bold</span>
            </div>
          </div>

          <div className="control-section color-section">
            <div className="control-label-row">
              <label htmlFor="brush-color">Brush color</label>
              <span className="color-value">{color.toUpperCase()}</span>
            </div>
            <div className="color-picker-row">
              <input
                id="brush-color"
                type="color"
                value={color}
                aria-label="Brush color"
                onChange={(event) => setColor(event.target.value)}
              />
              <span className="color-swatch" style={{ backgroundColor: color }} />
              <span>Custom color</span>
            </div>
          </div>

          <div className="sidebar-footer">
            <button className="text-button" type="button" onClick={undo} disabled={strokeCount === 0}>
              <span aria-hidden="true">↶</span> Undo last stroke
            </button>
            <p>Tip: hold and drag across the canvas to sketch.</p>
          </div>
        </aside>

        <section className="canvas-panel">
          <div className="canvas-heading">
            <div>
              <span className="eyebrow">Untitled canvas</span>
              <h1>Sketch something useful.</h1>
            </div>
            <div className="canvas-meta">
              <span className="meta-label">Strokes</span>
              <strong>{strokeCount}</strong>
            </div>
          </div>

          <div className="canvas-frame">
            <canvas
              ref={canvasRef}
              aria-label="Drawing canvas"
              onPointerDown={startStroke}
              onPointerMove={extendStroke}
              onPointerUp={finishStroke}
              onPointerCancel={finishStroke}
            />
            <div className="canvas-hint">{tool === "eraser" ? "Eraser active" : "Brush active"}</div>
          </div>

          <div className="canvas-footer">
            <span>Canvas 01</span>
            <span className="footer-separator">•</span>
            <span>Autosave is local for now</span>
          </div>
        </section>

        <aside className="panel inspector-panel">
          <div className="panel-heading">
            <span className="eyebrow">Canvas notes</span>
            <span className="note-icon">✦</span>
          </div>
          <div className="inspector-card">
            <span className="card-number">01</span>
            <h2>A quiet place to think.</h2>
            <p>This first canvas is ready for the ideas that are still taking shape.</p>
          </div>
          <div className="inspector-divider" />
          <div className="keyboard-section">
            <span className="eyebrow">Shortcuts</span>
            <div className="shortcut-row"><span>Brush</span><kbd>B</kbd></div>
            <div className="shortcut-row"><span>Eraser</span><kbd>E</kbd></div>
            <div className="shortcut-row"><span>Undo</span><kbd>⌘ Z</kbd></div>
          </div>
        </aside>
      </main>
    </div>
  );
}

export default App;
