import { useEffect, useRef } from "react";

type ImportSummaryDialogProps = {
  open: boolean;
  filename: string;
  format: string;
  languageVersion?: string;
  warnings: string[];
  errors: string[];
  onClose: () => void;
  onConfirm: () => void;
};

export function ImportSummaryDialog({
  open,
  filename,
  format,
  languageVersion,
  warnings,
  errors,
  onClose,
  onConfirm,
}: ImportSummaryDialogProps) {
  const firstControl = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      requestAnimationFrame(() => firstControl.current?.focus());
    } else if (wasOpen.current) {
      wasOpen.current = false;
    }
  }, [open]);

  if (!open) return null;
  const canImport = errors.length === 0;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="modal import-summary-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-summary-title"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
      >
        <div className="row between">
          <div>
            <p className="eyebrow">Validated file import</p>
            <h2 id="import-summary-title">Review before importing</h2>
          </div>
          <button type="button" aria-label="Close import summary" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="modal-note import-file-name">{filename}</p>
        <div className="import-summary-meta">
          <span>{format === "open-group-exchange" ? "Open Group exchange" : "ArchInt native JSON"}</span>
          <span>ArchiMate {languageVersion || "4.0"}</span>
          <span>Imported as a new drawing</span>
        </div>
        {errors.length > 0 && (
          <div className="import-summary-section import-errors" role="alert">
            <strong>Import blocked</strong>
            <ul>
              {errors.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        )}
        {warnings.length > 0 && (
          <div className="import-summary-section import-warnings">
            <strong>Review these notes</strong>
            <ul>
              {warnings.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        )}
        {canImport && warnings.length === 0 && (
          <p className="modal-note">The file passed structural and semantic validation. Its identifiers and view geometry will be preserved.</p>
        )}
        <div className="row between modal-actions">
          <button ref={firstControl} type="button" onClick={onClose}>Cancel</button>
          <button className="primary" type="button" disabled={!canImport} onClick={onConfirm}>
            Import as new drawing
          </button>
        </div>
      </section>
    </div>
  );
}
