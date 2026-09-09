import { useEffect, useRef } from "react";
import type { FormEventHandler } from "react";

type ReauthenticationDialogProps = {
  open: boolean;
  busy: boolean;
  error: string;
  email: string;
  password: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onClose: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
};

export function ReauthenticationDialog({
  open,
  busy,
  error,
  email,
  password,
  onEmailChange,
  onPasswordChange,
  onClose,
  onSubmit,
}: ReauthenticationDialogProps) {
  const trigger = useRef<HTMLElement | null>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open) {
      trigger.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      wasOpen.current = true;
      requestAnimationFrame(() => emailInput.current?.focus());
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
        className="modal reauth-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reauth-title"
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
          <span className="eyebrow">SESSION RESTORATION</span>
          <button
            type="button"
            disabled={busy}
            aria-label="Close"
            onClick={close}
          >
            ×
          </button>
        </div>
        <h2 id="reauth-title">Sign in to save your draft</h2>
        <p>Your editor stays open while we restore your workspace session.</p>
        <label>
          Email address
          <input
            ref={emailInput}
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="row between modal-actions">
          <button type="button" disabled={busy} onClick={close}>
            Keep editing
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "Restoring…" : "Sign in again"}
          </button>
        </div>
      </form>
    </div>
  );
}
