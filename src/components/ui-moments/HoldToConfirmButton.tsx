import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";

interface HoldToConfirmButtonProps {
  label: string;
  holdingLabel?: string;
  doneLabel?: string;
  durationMs?: number;
  disabled?: boolean;
  busy?: boolean;
  onConfirm: () => Promise<void> | void;
}

/**
 * Adapted from guanmo-ai/ui-moments (Hold to Confirm, MIT).
 * Press-and-hold destructive guard using Web Animations API with keyboard Space/Enter support.
 */
export function HoldToConfirmButton({
  label,
  holdingLabel = "按住不放以确认...",
  doneLabel = "已确认",
  durationMs = 900,
  disabled = false,
  busy = false,
  onConfirm,
}: HoldToConfirmButtonProps) {
  const fillRef = useRef<HTMLSpanElement | null>(null);
  const labelRef = useRef<HTMLSpanElement | null>(null);
  const progressAnimRef = useRef<Animation | null>(null);
  const trembleAnimRef = useRef<Animation | null>(null);
  const startedAtRef = useRef(0);
  const hintTimerRef = useRef<number | null>(null);
  const completedRef = useRef(false);

  const [holding, setHolding] = useState(false);
  const [done, setDone] = useState(false);
  const [hint, setHint] = useState("");

  const reducedMotion = () =>
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    return () => {
      progressAnimRef.current?.cancel();
      trembleAnimRef.current?.cancel();
      if (hintTimerRef.current !== null) window.clearTimeout(hintTimerRef.current);
    };
  }, []);

  const flashHint = (text: string) => {
    if (hintTimerRef.current !== null) window.clearTimeout(hintTimerRef.current);
    setHint(text);
    if (text) {
      hintTimerRef.current = window.setTimeout(() => {
        setHint("");
        hintTimerRef.current = null;
      }, 1500);
    }
  };

  const finishHold = async () => {
    const anim = progressAnimRef.current;
    if (anim && anim.playbackRate < 0) {
      anim.cancel();
      progressAnimRef.current = null;
      return;
    }
    if (completedRef.current) return;
    completedRef.current = true;
    trembleAnimRef.current?.cancel();
    trembleAnimRef.current = null;
    setHolding(false);
    setDone(true);
    setHint("");
    try {
      await onConfirm();
    } catch {
      completedRef.current = false;
      setDone(false);
      progressAnimRef.current?.cancel();
      progressAnimRef.current = null;
    }
  };

  const startHold = () => {
    if (disabled || busy || done || completedRef.current) return;
    if (progressAnimRef.current && progressAnimRef.current.playbackRate > 0) return;

    startedAtRef.current = performance.now();
    setHolding(true);
    setHint(holdingLabel);

    const fillEl = fillRef.current;
    if (!fillEl) return;

    if (progressAnimRef.current) {
      progressAnimRef.current.updatePlaybackRate(1);
    } else {
      const anim = fillEl.animate(
        [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }],
        {
          duration: reducedMotion() ? 400 : durationMs,
          easing: "cubic-bezier(.45, 0, .6, 1)",
          fill: "forwards",
        },
      );
      anim.onfinish = () => {
        void finishHold();
      };
      progressAnimRef.current = anim;
    }
    progressAnimRef.current.play();

    if (!reducedMotion() && labelRef.current) {
      trembleAnimRef.current = labelRef.current.animate(
        [
          { transform: "translateX(0)" },
          { transform: "translateX(-0.7px)" },
          { transform: "translateX(0.7px)" },
          { transform: "translateX(0)" },
        ],
        {
          duration: 110,
          iterations: Infinity,
          delay: durationMs * 0.55,
        },
      );
    }
  };

  const releaseHold = () => {
    const anim = progressAnimRef.current;
    if (!anim || anim.playbackRate < 0 || done || completedRef.current) return;
    setHolding(false);
    trembleAnimRef.current?.cancel();
    trembleAnimRef.current = null;
    if (performance.now() - startedAtRef.current < 260) {
      flashHint("请长按按钮以确认操作");
    } else {
      setHint("");
    }
    anim.updatePlaybackRate(reducedMotion() ? -100 : -3.2);
  };

  return (
    <div className="relative inline-flex flex-col items-end">
      <button
        type="button"
        disabled={disabled || busy}
        data-holding={holding ? "" : undefined}
        data-done={done ? "" : undefined}
        aria-label={done ? doneLabel : `${label}（按住确认）`}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          startHold();
        }}
        onPointerUp={releaseHold}
        onPointerCancel={releaseHold}
        onLostPointerCapture={releaseHold}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key !== " " && e.key !== "Enter") return;
          e.preventDefault();
          if (!e.repeat) startHold();
        }}
        onKeyUp={(e) => {
          if (e.key === " " || e.key === "Enter") releaseHold();
        }}
        onBlur={releaseHold}
        className="um-hold min-h-[40px] rounded-full px-5 text-[13px] font-semibold disabled:opacity-60"
      >
        <span ref={fillRef} className="um-hold-fill" aria-hidden="true" />
        <span ref={labelRef} className="um-hold-label">
          <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{busy ? "处理中..." : `长按 · ${label}`}</span>
        </span>
        <svg className="um-hold-check" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </button>
      {hint && (
        <span aria-live="polite" className="mt-1.5 text-[11.5px] font-medium text-[#9a4500]">
          {hint}
        </span>
      )}
    </div>
  );
}
