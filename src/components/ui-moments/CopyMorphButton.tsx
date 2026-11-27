import { useEffect, useRef, useState } from "react";

interface CopyMorphButtonProps {
  text: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
  variant?: "pill" | "inline";
  ariaLabel?: string;
}

/**
 * Adapted from guanmo-ai/ui-moments (Copy Button, MIT).
 * Morphs clipboard glyph into an animated SVG checkmark while vertical-swapping label text.
 */
export function CopyMorphButton({
  text,
  label = "复制",
  copiedLabel = "已复制",
  className = "",
  variant = "pill",
  ariaLabel,
}: CopyMorphButtonProps) {
  const [done, setDone] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for restricted clipboard contexts
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } finally {
        ta.remove();
      }
    }
    setDone(true);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setDone(false);
      timerRef.current = null;
    }, 1700);
  };

  const baseClass =
    variant === "inline"
      ? "um-copy inline-flex min-h-[30px] items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium text-[#0058c4] transition hover:bg-[#007AFF]/[0.08]"
      : "um-copy liquid-btn inline-flex min-h-[34px] items-center justify-center gap-1.5 rounded-full px-3.5 text-[12px] font-medium text-[#0058c4] sm:min-h-[30px]";

  return (
    <button
      type="button"
      data-done={done ? "" : undefined}
      onClick={handleCopy}
      aria-label={ariaLabel ?? (done ? copiedLabel : label)}
      className={`${baseClass} ${className}`}
    >
      <span className="um-copy-icon" aria-hidden="true">
        <svg className="um-clip" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <rect x="6.5" y="6.5" width="10" height="10" rx="2.5" />
          <path d="M13.5 6.5V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v7A1.5 1.5 0 0 0 5 13.5h1.5" />
        </svg>
        <svg className="um-check" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4.5 10.5l3.5 3.5 7.5-8" />
        </svg>
      </span>
      <span className="um-swap">
        <span>{label}</span>
        <span aria-hidden="true">{copiedLabel}</span>
      </span>
      <span className="sr-only" aria-live="polite">
        {done ? copiedLabel : ""}
      </span>
    </button>
  );
}
