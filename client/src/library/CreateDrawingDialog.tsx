import { useEffect, useRef } from "react";
import type { FormEventHandler } from "react";
import type { Template } from "../app/types";

type CreateDrawingDialogProps = {
  open: boolean;
  busy: boolean;
  error: string;
  name: string;
  template: Template;
  onNameChange: (value: string) => void;
  onTemplateChange: (template: Template) => void;
  onClose: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
};

export function CreateDrawingDialog({
  open,
  busy,
  error,
  name,
  template,
  onNameChange,
  onTemplateChange,
  onClose,
  onSubmit,
}: CreateDrawingDialogProps) {
  const trigger = useRef<HTMLElement | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open) {
      trigger.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      wasOpen.current = true;
      requestAnimationFrame(() => nameInput.current?.focus());
    } else if (wasOpen.current) {
      wasOpen.current = false;
      requestAnimationFrame(() => trigger.current?.focus());
    }
  }, [open]);

  if (!open) return null;

  const close = () => {
    if (!busy) onClose();
  };

  return (
    <div className="modal-backdrop" onClick={close}>
      <form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            close();
            return;
          }
          if (e.key !== "Tab") return;
          const items = Array.from(
            e.currentTarget.querySelectorAll<HTMLElement>(
              "button:not(:disabled),input",
            ),
          );
          const first = items[0];
          const last = items[items.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }}
      >
        <div className="row between">
          <span className="eyebrow">A NEW IDEA STARTS HERE</span>
          <button
            type="button"
            disabled={busy}
            aria-label="Close"
            onClick={close}
          >
            ×
          </button>
        </div>
        <h2 id="new-title">Create a drawing</h2>
        <label>
          Drawing name
          <input
            ref={nameInput}
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            maxLength={100}
          />
        </label>
        <p>Choose your starting point</p>
        <div className="template-options">
          {(["blank", "architecture"] as const).map((option) => (
            <button
              type="button"
              className={template === option ? "chosen" : ""}
              onClick={() => onTemplateChange(option)}
              key={option}
            >
              <span>{option === "blank" ? "+" : "▧"}</span>
              {option === "blank" ? "Blank canvas" : "Architecture template"}
            </button>
          ))}
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary wide" disabled={busy}>
          {busy ? "Creating…" : "Create drawing ↗"}
        </button>
      </form>
    </div>
  );
}
