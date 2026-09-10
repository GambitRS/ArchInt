import { useEffect, useRef, useState } from "react";

export type ExportFormat = "svg" | "png" | "pdf" | "json" | "archimate" | "exchange";
export type ExportBounds = "page" | "selection";
export type ExportScale = 1 | 2 | 4;
export type ExportBackground = "white" | "transparent";

export type ExportOptions = {
  format: ExportFormat;
  bounds: ExportBounds;
  scale: ExportScale;
  background: ExportBackground;
};

type ExportDialogProps = {
  open: boolean;
  hasSelection: boolean;
  onClose: () => void;
  onExport: (options: ExportOptions) => void;
};

export function ExportDialog({
  open,
  hasSelection,
  onClose,
  onExport,
}: ExportDialogProps) {
  const trigger = useRef<HTMLElement | null>(null);
  const firstControl = useRef<HTMLSelectElement>(null);
  const wasOpen = useRef(false);
  const [format, setFormat] = useState<ExportFormat>("svg");
  const [bounds, setBounds] = useState<ExportBounds>("page");
  const [scale, setScale] = useState<ExportScale>(2);
  const [background, setBackground] =
    useState<ExportBackground>("white");

  useEffect(() => {
    if (open) {
      trigger.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      wasOpen.current = true;
      setFormat("svg");
      setBounds(hasSelection ? "selection" : "page");
      setScale(2);
      setBackground("white");
      requestAnimationFrame(() => firstControl.current?.focus());
    } else if (wasOpen.current) {
      wasOpen.current = false;
      requestAnimationFrame(() => trigger.current?.focus());
    }
  }, [hasSelection, open]);

  if (!open) return null;

  const close = () => onClose();
  const fileExport = format === "json" || format === "archimate" || format === "exchange";

  return (
    <div className="modal-backdrop" onClick={close}>
      <form
        className="modal export-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onExport({
            format,
            bounds: fileExport ? "page" : bounds,
            scale: fileExport ? 1 : scale,
            background: format === "pdf" ? "white" : background,
          });
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            close();
            return;
          }
          if (event.key !== "Tab") return;
          const items = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>(
              "button:not(:disabled),input:not(:disabled),select:not(:disabled)",
            ),
          );
          const first = items[0];
          const last = items[items.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
      >
        <div className="row between">
          <div>
            <p className="eyebrow">Release output</p>
            <h2 id="export-title">Export drawing</h2>
          </div>
          <button type="button" aria-label="Close export dialog" onClick={close}>
            ×
          </button>
        </div>
        <label>
          Format
          <select
            ref={firstControl}
            value={format}
            onChange={(event) => setFormat(event.target.value as ExportFormat)}
          >
            <option value="svg">SVG — editable vector</option>
            <option value="png">PNG — raster image</option>
            <option value="pdf">PDF — print image</option>
            <option value="archimate">ArchiMate file — lossless ArchInt model</option>
            <option value="exchange">Open Group XML — 3.2 exchange</option>
            <option value="json">JSON — ArchInt document</option>
          </select>
        </label>
        <fieldset disabled={fileExport}>
          <legend>Bounds</legend>
          <label className="choice-row">
            <input
              type="radio"
              name="export-bounds"
              value="page"
              checked={bounds === "page"}
              onChange={() => setBounds("page")}
            />
            Full page
          </label>
          <label className="choice-row">
            <input
              type="radio"
              name="export-bounds"
              value="selection"
              checked={bounds === "selection"}
              disabled={!hasSelection}
              onChange={() => setBounds("selection")}
            />
            Selection only {hasSelection ? "" : "(select an element first)"}
          </label>
        </fieldset>
        <div className="export-options">
          <label>
            Scale
            <select
              disabled={fileExport}
              value={scale}
              onChange={(event) =>
                setScale(Number(event.target.value) as ExportScale)
              }
            >
              <option value="1">1×</option>
              <option value="2">2×</option>
              <option value="4">4×</option>
            </select>
          </label>
          <label>
            Background
            <select
              disabled={fileExport || format === "pdf"}
              value={background}
              onChange={(event) =>
                setBackground(event.target.value as ExportBackground)
              }
            >
              <option value="white">White</option>
              <option value="transparent">Transparent</option>
            </select>
          </label>
        </div>
        <p className="modal-note">
          ArchInt files preserve the editable model and view identities. Open
          Group XML is an interoperability snapshot; 4.0-only features may be
          retained in an ArchInt extension for tools that understand it.
        </p>
        <div className="row between modal-actions export-actions">
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button className="primary" type="submit">
            Export {format.toUpperCase()}
          </button>
        </div>
      </form>
    </div>
  );
}
