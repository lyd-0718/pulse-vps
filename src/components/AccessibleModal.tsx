import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { HoldToConfirmButton } from "./ui-moments/HoldToConfirmButton";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface AccessibleModalProps {
  open: boolean;
  onClose: () => void;
  titleId: string;
  variant?: "dialog" | "drawer";
  children: React.ReactNode;
}

/**
 * Shared accessible modal/drawer shell:
 * - role="dialog" + aria-modal="true" + aria-labelledby
 * - Escape key dismissal
 * - Tab / Shift+Tab focus trap + focus restoration on close
 * - Background body scroll lock
 */
export function AccessibleModal({
  open,
  onClose,
  titleId,
  variant = "dialog",
  children,
}: AccessibleModalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    const prevFocused = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Move initial focus inside dialog if not already focused inside
    const focusTimer = window.setTimeout(() => {
      const root = containerRef.current;
      if (!root) return;
      if (root.contains(document.activeElement)) return;
      const first = root.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      if (first) first.focus();
      else root.focus();
    }, 10);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const root = containerRef.current;
      if (!root) return;
      const focusables = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first || !root.contains(document.activeElement)) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last || !root.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      if (prevFocused && typeof prevFocused.focus === "function") {
        prevFocused.focus();
      }
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={
        variant === "drawer"
          ? "fixed inset-0 z-50 flex justify-end bg-[#0f172a]/22 p-2 backdrop-blur-sm sm:p-4"
          : "fixed inset-0 z-50 flex items-center justify-center bg-[#0f172a]/22 p-4 backdrop-blur-sm"
      }
      onClick={onClose}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={variant === "drawer" ? "flex h-full w-full max-w-3xl outline-none" : "flex w-full justify-center outline-none"}
      >
        {children}
      </div>
    </div>
  );
}

/* ---------- Liquid Glass Confirmation Dialog ---------- */
export interface ConfirmDialogState {
  title: string;
  description: string;
  confirmLabel: string;
  tone?: "danger" | "primary";
  onConfirm: () => Promise<void>;
}

export function ConfirmDialog({
  state,
  onClose,
}: {
  state: ConfirmDialogState | null;
  onClose: () => void;
}) {
  const titleId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setError("");
    setBusy(false);
  }, [state]);

  if (!state) return null;

  const handleConfirm = async () => {
    setError("");
    setBusy(true);
    try {
      await state.onConfirm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败，请稍后重试");
    } finally {
      setBusy(false);
    }
  };

  const isDanger = state.tone !== "primary";

  return (
    <AccessibleModal open={!!state} onClose={busy ? () => {} : onClose} titleId={titleId}>
      <div className="liquid-sheet w-full max-w-sm rounded-[26px] p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                isDanger ? "bg-[#FF3B30]/12 text-[#c41e14]" : "bg-[#007AFF]/12 text-[#0058c4]"
              }`}
            >
              <AlertTriangle className="h-4.5 w-4.5" />
            </span>
            <h3 id={titleId} className="text-[17px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">
              {state.title}
            </h3>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            aria-label="关闭确认窗口"
            className="liquid-btn flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#4c515c] disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-3 text-[13px] leading-relaxed text-[#4c515c]">{state.description}</p>

        {error && (
          <div
            role="alert"
            className="mt-3 rounded-[12px] bg-[#FF3B30]/10 px-3 py-2 text-[12.5px] font-medium text-[#c41e14]"
          >
            {error}
          </div>
        )}

        <div className="mt-5 flex items-start justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="liquid-btn min-h-[40px] rounded-full px-4 text-[13px] font-medium disabled:opacity-50"
          >
            取消
          </button>
          {isDanger ? (
            <HoldToConfirmButton
              label={state.confirmLabel}
              busy={busy}
              onConfirm={handleConfirm}
            />
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={handleConfirm}
              className="liquid-btn-primary min-h-[40px] rounded-full px-5 text-[13px] font-medium disabled:opacity-60"
            >
              {busy ? "处理中..." : state.confirmLabel}
            </button>
          )}
        </div>
      </div>
    </AccessibleModal>
  );
}
